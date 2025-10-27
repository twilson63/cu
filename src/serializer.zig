const std = @import("std");
const lua = @import("lua.zig");
const function_serializer = @import("function_serializer.zig");
const ext_table = @import("ext_table.zig");

const IO_BUFFER_SIZE = 64 * 1024;

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
};

pub fn serialize_value(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
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

        // Allow empty strings (str_len == 0 is valid)
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
        // Delegate to function serializer
        return function_serializer.serialize_function(L, stack_index, buffer, max_len);
    }

    if (lua.istable(L, stack_index)) {
        // Check if it's an external table by looking for __ext_table_id field
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

        // Regular table - not supported in serialization
        return SerializationError.TypeMismatch;
    }

    return SerializationError.TypeMismatch;
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
