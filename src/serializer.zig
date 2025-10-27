const std = @import("std");
const lua = @import("lua.zig");
const function_serializer = @import("function_serializer.zig");
const ext_table = @import("ext_table.zig");

// External function for setting values in external tables
extern fn js_ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]const u8, val_len: usize) c_int;

const IO_BUFFER_SIZE = 64 * 1024;

// Limits for table conversion
const MAX_RECURSION_DEPTH: usize = 32;
const MAX_TABLE_ENTRIES: usize = 10000;

// Context for tracking recursion
const ConversionContext = struct {
    depth: usize,
    visited_stack_index: c_int, // Stack index of visited tables tracking table
};

pub const SerializationType = enum(u8) {
    nil = 0x00,
    boolean = 0x01,
    integer = 0x02,
    float = 0x03,
    string = 0x04,
    function_bytecode = 0x05, // For Lua functions
    function_ref = 0x06, // For C functions
    table_ref = 0x07, // For external tables
};

pub const SerializationError = error{
    BufferTooSmall,
    InvalidFormat,
    TypeMismatch,
    CircularReference,
    MaxDepthExceeded,
    TableTooLarge,
};

// Helper to serialize Lua table keys to external table format
fn serialize_table_key(L: *lua.lua_State, key_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    if (lua.isstring(L, key_index)) {
        var key_len: usize = 0;
        const key_ptr = lua.tolstring(L, key_index, &key_len);
        if (key_len == 0) return SerializationError.InvalidFormat;
        if (key_len > max_len) return SerializationError.BufferTooSmall;
        @memcpy(buffer[0..key_len], key_ptr[0..key_len]);
        return key_len;
    }

    if (lua.isnumber(L, key_index)) {
        const num = lua.tonumber(L, key_index);
        const int_val = lua.tointeger(L, key_index);

        if (@as(f64, @floatFromInt(int_val)) == num) {
            var buf: [32]u8 = undefined;
            const num_str = std.fmt.bufPrint(&buf, "{d}", .{int_val}) catch {
                return SerializationError.InvalidFormat;
            };
            if (num_str.len > max_len) return SerializationError.BufferTooSmall;
            @memcpy(buffer[0..num_str.len], num_str);
            return num_str.len;
        }
    }

    return SerializationError.TypeMismatch;
}

// Check if table is already being visited (circular reference detection)
fn is_table_visited(L: *lua.lua_State, table_index: c_int, ctx: *ConversionContext) bool {
    // Push the table we're checking
    lua.pushvalue(L, table_index);

    // Check if it's in the visited map
    _ = lua.c.lua_rawget(L, ctx.visited_stack_index);
    const is_visited = !lua.isnil(L, -1);

    // Clean up stack: pop result
    lua.pop(L, 1);

    return is_visited;
}

// Mark table as visited
fn mark_table_visited(L: *lua.lua_State, table_index: c_int, ctx: *ConversionContext) void {
    // Push the table as key
    lua.pushvalue(L, table_index);

    // Push true as value
    lua.pushboolean(L, 1);

    // Set visited[table] = true
    lua.c.lua_rawset(L, ctx.visited_stack_index);
}

// Unmark table as visited (for cleanup)
fn unmark_table_visited(L: *lua.lua_State, table_index: c_int, ctx: *ConversionContext) void {
    // Push the table as key
    lua.pushvalue(L, table_index);

    // Push nil as value to remove
    lua.pushnil(L);

    // Set visited[table] = nil
    lua.c.lua_rawset(L, ctx.visited_stack_index);
}

// Convert a regular Lua table to an external table
fn convert_table_to_external(
    L: *lua.lua_State,
    table_index: c_int,
    ctx: *ConversionContext,
) SerializationError!u32 {
    // Check recursion depth
    if (ctx.depth >= MAX_RECURSION_DEPTH) {
        return SerializationError.MaxDepthExceeded;
    }

    // Convert table_index to absolute index before pushing anything
    var abs_table_index = table_index;
    if (table_index < 0 and table_index > lua.c.LUA_REGISTRYINDEX) {
        abs_table_index = lua.gettop(L) + table_index + 1;
    }

    // Check for circular reference
    if (is_table_visited(L, abs_table_index, ctx)) {
        return SerializationError.CircularReference;
    }

    // Mark table as visited
    mark_table_visited(L, abs_table_index, ctx);
    defer unmark_table_visited(L, abs_table_index, ctx); // Unmark when done

    // Increment depth
    ctx.depth += 1;
    defer ctx.depth -= 1;

    // Create new external table
    const table_id = ext_table.create_table(L);
    _ = lua.gettop(L); // external table is now on stack

    // Count entries and check limit
    var entry_count: usize = 0;
    lua.pushnil(L);
    while (lua.c.lua_next(L, abs_table_index) != 0) {
        entry_count += 1;
        if (entry_count > MAX_TABLE_ENTRIES) {
            lua.pop(L, 2); // pop value and key
            lua.pop(L, 1); // pop external table
            return SerializationError.TableTooLarge;
        }
        lua.pop(L, 1); // pop value, keep key for next iteration
    }

    // Allocate buffers for key and value serialization
    var key_buffer: [4096]u8 = undefined;
    var value_buffer: [16384]u8 = undefined;

    // Iterate over table and populate external table
    lua.pushnil(L);
    while (lua.c.lua_next(L, abs_table_index) != 0) {
        // Stack: ... ext_table, key, value

        // Serialize the key
        const key_len = serialize_table_key(L, -2, &key_buffer, key_buffer.len) catch |err| {
            lua.pop(L, 2); // pop value and key
            lua.pop(L, 1); // pop external table
            return err;
        };

        // Serialize the value (recursive for nested tables)
        const value_len = serialize_value_with_context(L, -1, &value_buffer, value_buffer.len, ctx) catch |err| {
            lua.pop(L, 2); // pop value and key
            lua.pop(L, 1); // pop external table
            return err;
        };

        // Store in external table via JavaScript bridge
        const result = js_ext_table_set(
            table_id,
            &key_buffer,
            key_len,
            &value_buffer,
            value_len,
        );

        if (result != 0) {
            lua.pop(L, 2); // pop value and key
            lua.pop(L, 1); // pop external table
            return SerializationError.InvalidFormat;
        }

        // Pop value, keep key for next iteration
        lua.pop(L, 1);
    }

    // Pop the external table from stack
    lua.pop(L, 1);

    return table_id;
}

// Internal version of serialize_value that accepts a context for recursion tracking
fn serialize_value_with_context(
    L: *lua.lua_State,
    stack_index: c_int,
    buffer: [*]u8,
    max_len: usize,
    ctx: *ConversionContext,
) SerializationError!usize {
    if (max_len == 0) return SerializationError.BufferTooSmall;

    if (lua.isnil(L, stack_index)) {
        if (max_len < 1) return SerializationError.BufferTooSmall;
        buffer[0] = @intFromEnum(SerializationType.nil);
        return 1;
    }

    if (lua.isboolean(L, stack_index)) {
        if (max_len < 2) return SerializationError.BufferTooSmall;
        buffer[0] = @intFromEnum(SerializationType.boolean);
        const val = lua.toboolean(L, stack_index);
        buffer[1] = if (val) 1 else 0;
        return 2;
    }

    if (lua.isnumber(L, stack_index)) {
        const num = lua.tonumber(L, stack_index);
        const int_val = lua.tointeger(L, stack_index);

        if (@as(f64, @floatFromInt(int_val)) == num) {
            if (max_len < 9) return SerializationError.BufferTooSmall;
            buffer[0] = @intFromEnum(SerializationType.integer);
            const bytes = std.mem.asBytes(&int_val);
            @memcpy(buffer[1..9], bytes);
            return 9;
        } else {
            if (max_len < 9) return SerializationError.BufferTooSmall;
            buffer[0] = @intFromEnum(SerializationType.float);
            const bytes = std.mem.asBytes(&num);
            @memcpy(buffer[1..9], bytes);
            return 9;
        }
    }

    if (lua.isstring(L, stack_index)) {
        var str_len: usize = 0;
        const str = lua.tolstring(L, stack_index, &str_len);

        if (max_len < 5 + str_len) return SerializationError.BufferTooSmall;

        buffer[0] = @intFromEnum(SerializationType.string);

        const len_u32: u32 = @intCast(str_len);
        const len_bytes = std.mem.asBytes(&len_u32);
        @memcpy(buffer[1..5], len_bytes);

        if (str_len > 0) {
            @memcpy(buffer[5 .. 5 + str_len], str[0..str_len]);
        }

        return 5 + str_len;
    }

    if (lua.isfunction(L, stack_index)) {
        return function_serializer.serialize_function(L, stack_index, buffer, max_len);
    }

    if (lua.istable(L, stack_index)) {
        // Check if it's already an external table
        _ = lua.getfield(L, stack_index, "__ext_table_id");
        if (!lua.isnil(L, -1)) {
            // It's an external table - serialize as reference
            const table_id = lua.tointeger(L, -1);
            lua.pop(L, 1);

            if (max_len < 5) return SerializationError.BufferTooSmall;
            buffer[0] = @intFromEnum(SerializationType.table_ref);
            const id_u32: u32 = @intCast(table_id);
            const id_bytes = std.mem.asBytes(&id_u32);
            @memcpy(buffer[1..5], id_bytes);
            return 5;
        }
        lua.pop(L, 1);

        // Regular table - convert to external table
        const table_id = try convert_table_to_external(L, stack_index, ctx);

        if (max_len < 5) return SerializationError.BufferTooSmall;
        buffer[0] = @intFromEnum(SerializationType.table_ref);
        const id_u32: u32 = @intCast(table_id);
        const id_bytes = std.mem.asBytes(&id_u32);
        @memcpy(buffer[1..5], id_bytes);
        return 5;
    }

    return SerializationError.TypeMismatch;
}

// Public API - creates context and delegates to internal function
pub fn serialize_value(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    const initial_top = lua.gettop(L);

    // Create a table on the stack to track visited tables
    lua.newtable(L); // Create visited tracking table
    const visited_index = lua.gettop(L);

    var ctx = ConversionContext{
        .depth = 0,
        .visited_stack_index = visited_index,
    };

    // Adjust stack_index if it's relative and we pushed the visited table
    var adjusted_index = stack_index;
    if (stack_index < 0 and stack_index > lua.c.LUA_REGISTRYINDEX) {
        // Negative indices need adjustment since we pushed a value
        adjusted_index = stack_index - 1;
    }

    const result = serialize_value_with_context(L, adjusted_index, buffer, max_len, &ctx);

    // Clean up: remove visited table from stack
    lua.settop(L, initial_top);

    return result;
}

pub fn deserialize_value(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    if (len < 1) return SerializationError.InvalidFormat;

    const type_byte = buffer[0];
    const value_type: SerializationType = @enumFromInt(type_byte);

    switch (value_type) {
        SerializationType.nil => {
            lua.pushnil(L);
        },
        SerializationType.boolean => {
            if (len < 2) return SerializationError.InvalidFormat;
            const val = buffer[1] != 0;
            lua.pushboolean(L, if (val) 1 else 0);
        },
        SerializationType.integer => {
            if (len < 9) return SerializationError.InvalidFormat;
            // Read as little-endian i64
            var int_val: i64 = undefined;
            const bytes = buffer[1..9];
            @memcpy(std.mem.asBytes(&int_val), bytes);
            lua.pushinteger(L, int_val);
        },
        SerializationType.float => {
            if (len < 9) return SerializationError.InvalidFormat;
            // Read as little-endian f64
            var float_val: f64 = undefined;
            const bytes = buffer[1..9];
            @memcpy(std.mem.asBytes(&float_val), bytes);
            lua.pushnumber(L, float_val);
        },
        SerializationType.string => {
            if (len < 5) return SerializationError.InvalidFormat;
            const str_len: u32 = @as(u32, buffer[1]) |
                (@as(u32, buffer[2]) << 8) |
                (@as(u32, buffer[3]) << 16) |
                (@as(u32, buffer[4]) << 24);

            if (len < 5 + str_len) return SerializationError.InvalidFormat;

            _ = lua.pushlstring(L, buffer + 5, str_len);
        },
        SerializationType.function_bytecode, SerializationType.function_ref => {
            // Delegate to function serializer for deserialization
            // Pass the full buffer including type byte
            try function_serializer.deserialize_function(L, value_type, buffer, len);
        },
        SerializationType.table_ref => {
            if (len < 5) return SerializationError.InvalidFormat;
            const table_id: u32 = @as(u32, buffer[1]) |
                (@as(u32, buffer[2]) << 8) |
                (@as(u32, buffer[3]) << 16) |
                (@as(u32, buffer[4]) << 24);

            // Attach the external table
            ext_table.attach_table(L, table_id);
        },
    }
}

pub fn serialize_key(key: [*]const u8, key_len: usize, buffer: [*]u8, max_len: usize) SerializationError!usize {
    if (max_len < 4 + key_len) return SerializationError.BufferTooSmall;

    const len_u32: u32 = @intCast(key_len);
    const len_bytes = std.mem.asBytes(&len_u32);
    @memcpy(buffer[0..4], len_bytes);
    @memcpy(buffer[4 .. 4 + key_len], key[0..key_len]);

    return 4 + key_len;
}

pub fn deserialize_key(buffer: [*]const u8, len: usize) SerializationError![*]const u8 {
    if (len < 4) return SerializationError.InvalidFormat;

    const key_len: u32 = @as(u32, buffer[0]) |
        (@as(u32, buffer[1]) << 8) |
        (@as(u32, buffer[2]) << 16) |
        (@as(u32, buffer[3]) << 24);

    if (len < 4 + key_len) return SerializationError.InvalidFormat;

    return buffer[4 .. 4 + key_len];
}
