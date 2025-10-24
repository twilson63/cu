const std = @import("std");
const lua = @import("lua.zig");
const serializer = @import("serializer.zig");

const SerializationType = serializer.SerializationType;
const SerializationError = serializer.SerializationError;

// Error types specific to function serialization
pub const FunctionSerializationError = error{
    UnsupportedFunctionType,
    BytecodeTooLarge,
    InvalidBytecode,
    CFunctionNotSerializable,
    UpvalueSerializationFailed,
};

// C function registry entry
const CFunctionEntry = struct {
    name: []const u8,
    func: lua.c.lua_CFunction,
};

// Registry of standard library C functions
const c_function_registry = [_]CFunctionEntry{
    // Core functions
    .{ .name = "print", .func = null },
    .{ .name = "type", .func = null },
    .{ .name = "tonumber", .func = null },
    .{ .name = "tostring", .func = null },
    .{ .name = "pairs", .func = null },
    .{ .name = "ipairs", .func = null },
    .{ .name = "next", .func = null },
    .{ .name = "pcall", .func = null },
    .{ .name = "xpcall", .func = null },
    .{ .name = "error", .func = null },
    .{ .name = "assert", .func = null },
    .{ .name = "select", .func = null },
    .{ .name = "rawget", .func = null },
    .{ .name = "rawset", .func = null },
    .{ .name = "rawequal", .func = null },
    .{ .name = "getmetatable", .func = null },
    .{ .name = "setmetatable", .func = null },

    // Math library functions
    .{ .name = "math.abs", .func = null },
    .{ .name = "math.acos", .func = null },
    .{ .name = "math.asin", .func = null },
    .{ .name = "math.atan", .func = null },
    .{ .name = "math.atan2", .func = null },
    .{ .name = "math.ceil", .func = null },
    .{ .name = "math.cos", .func = null },
    .{ .name = "math.cosh", .func = null },
    .{ .name = "math.deg", .func = null },
    .{ .name = "math.exp", .func = null },
    .{ .name = "math.floor", .func = null },
    .{ .name = "math.fmod", .func = null },
    .{ .name = "math.frexp", .func = null },
    .{ .name = "math.huge", .func = null },
    .{ .name = "math.ldexp", .func = null },
    .{ .name = "math.log", .func = null },
    .{ .name = "math.log10", .func = null },
    .{ .name = "math.max", .func = null },
    .{ .name = "math.min", .func = null },
    .{ .name = "math.modf", .func = null },
    .{ .name = "math.pi", .func = null },
    .{ .name = "math.pow", .func = null },
    .{ .name = "math.rad", .func = null },
    .{ .name = "math.random", .func = null },
    .{ .name = "math.randomseed", .func = null },
    .{ .name = "math.sin", .func = null },
    .{ .name = "math.sinh", .func = null },
    .{ .name = "math.sqrt", .func = null },
    .{ .name = "math.tan", .func = null },
    .{ .name = "math.tanh", .func = null },

    // String library functions
    .{ .name = "string.byte", .func = null },
    .{ .name = "string.char", .func = null },
    .{ .name = "string.dump", .func = null },
    .{ .name = "string.find", .func = null },
    .{ .name = "string.format", .func = null },
    .{ .name = "string.gmatch", .func = null },
    .{ .name = "string.gsub", .func = null },
    .{ .name = "string.len", .func = null },
    .{ .name = "string.lower", .func = null },
    .{ .name = "string.match", .func = null },
    .{ .name = "string.rep", .func = null },
    .{ .name = "string.reverse", .func = null },
    .{ .name = "string.sub", .func = null },
    .{ .name = "string.upper", .func = null },

    // Table library functions
    .{ .name = "table.concat", .func = null },
    .{ .name = "table.insert", .func = null },
    .{ .name = "table.maxn", .func = null },
    .{ .name = "table.remove", .func = null },
    .{ .name = "table.sort", .func = null },
};

// Function metadata structure for serialization
const FunctionMetadata = struct {
    is_c_function: bool,
    has_upvalues: bool,
    bytecode_size: u32,
    upvalue_count: u8,
};

// Serialize a Lua function to buffer
pub fn serialize_function(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    // Ensure we're dealing with a function
    if (!lua.isfunction(L, stack_index)) {
        return SerializationError.TypeMismatch;
    }

    // Check if it's a C function
    if (is_c_function(L, stack_index)) {
        return serialize_c_function_ref(L, stack_index, buffer, max_len);
    }

    // It's a Lua function - serialize bytecode
    return serialize_lua_bytecode(L, stack_index, buffer, max_len) catch |err| switch (err) {
        FunctionSerializationError.BytecodeTooLarge => SerializationError.BufferTooSmall,
        FunctionSerializationError.InvalidBytecode => SerializationError.InvalidFormat,
        else => SerializationError.TypeMismatch,
    };
}

// Check if a function at the given stack index is a C function
fn is_c_function(L: *lua.lua_State, stack_index: c_int) bool {
    // Push the function to check
    lua.c.lua_pushvalue(L, stack_index);

    // Try to get debug info - C functions have limited debug info
    var ar: lua.c.lua_Debug = undefined;
    if (lua.c.lua_getinfo(L, ">S", &ar) != 0) {
        // Check the 'what' field - "C" for C functions, "Lua" for Lua functions
        if (ar.what[0] == 'C') {
            return true;
        }
    }

    return false;
}

// Serialize a C function reference
fn serialize_c_function_ref(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    // Minimum space: type (1) + index (2)
    if (max_len < 3) return SerializationError.BufferTooSmall;

    buffer[0] = @intFromEnum(SerializationType.function_ref);

    // Try to find the function in our registry
    const func_ptr = lua.c.lua_tocfunction(L, stack_index);

    // Search for the function in the registry
    var found_index: ?u16 = null;
    for (c_function_registry, 0..) |entry, i| {
        if (entry.func == func_ptr) {
            found_index = @intCast(i);
            break;
        }
    }

    if (found_index) |idx| {
        // Found in registry - store the index
        buffer[1] = @intCast(idx & 0xFF);
        buffer[2] = @intCast((idx >> 8) & 0xFF);
        return 3;
    } else {
        // Not in registry - mark as unsupported
        buffer[1] = 0xFF;
        buffer[2] = 0xFF;
        return 3;
    }
}

// Dump a Lua function to bytecode using string.dump
fn dump_function(L: *lua.lua_State, stack_index: c_int) !struct { bytecode: [*]const u8, len: usize } {
    const initial_top = lua.gettop(L);
    defer lua.settop(L, initial_top);

    // Get string.dump function
    if (lua.getglobal(L, "string") != lua.c.LUA_TTABLE) {
        return FunctionSerializationError.InvalidBytecode;
    }

    if (lua.getfield(L, -1, "dump") != lua.c.LUA_TFUNCTION) {
        return FunctionSerializationError.InvalidBytecode;
    }

    // Remove string table from stack
    lua.c.lua_remove(L, -2);

    // Push the target function
    lua.c.lua_pushvalue(L, stack_index);

    // Push strip parameter (true to strip debug info)
    lua.pushboolean(L, 1);

    // Call string.dump(func, true)
    if (lua.c.lua_pcallk(L, 2, 1, 0, 0, null) != 0) {
        // Error message is on stack - we'll pop it with defer
        return FunctionSerializationError.InvalidBytecode;
    }

    // Get the resulting bytecode
    var bytecode_len: usize = 0;
    const bytecode = lua.tolstring(L, -1, &bytecode_len);

    if (bytecode_len == 0) {
        return FunctionSerializationError.InvalidBytecode;
    }

    return .{ .bytecode = bytecode, .len = bytecode_len };
}

// Serialize Lua function bytecode with proper error handling
fn serialize_lua_bytecode(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) !usize {
    // Ensure we have minimum space for header (type + 4-byte length)
    if (max_len < 5) return SerializationError.BufferTooSmall;

    // Set the type marker
    buffer[0] = @intFromEnum(SerializationType.function_bytecode);

    // Dump the function to bytecode
    const dump_result = try dump_function(L, stack_index);

    // Check if bytecode fits in buffer
    if (max_len < 5 + dump_result.len) {
        return FunctionSerializationError.BytecodeTooLarge;
    }

    // Write bytecode length as 4 bytes (little-endian)
    const len_u32: u32 = @intCast(dump_result.len);
    buffer[1] = @intCast(len_u32 & 0xFF);
    buffer[2] = @intCast((len_u32 >> 8) & 0xFF);
    buffer[3] = @intCast((len_u32 >> 16) & 0xFF);
    buffer[4] = @intCast((len_u32 >> 24) & 0xFF);

    // Copy bytecode data
    @memcpy(buffer[5 .. 5 + dump_result.len], dump_result.bytecode[0..dump_result.len]);

    return 5 + dump_result.len;
}

// Alternative implementation that manages stack directly
pub fn serialize_function_bytecode(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    // Validate function type
    if (!lua.isfunction(L, stack_index)) {
        return SerializationError.TypeMismatch;
    }

    // Check if it's a C function
    if (is_c_function(L, stack_index)) {
        return SerializationError.TypeMismatch; // Can't serialize C functions as bytecode
    }

    // Use the internal serialization
    return serialize_lua_bytecode(L, stack_index, buffer, max_len) catch |err| switch (err) {
        FunctionSerializationError.BytecodeTooLarge => SerializationError.BufferTooSmall,
        FunctionSerializationError.InvalidBytecode => SerializationError.InvalidFormat,
        else => SerializationError.SerializationFailed,
    };
}

// Serialize a C function reference with proper registry lookup
pub fn serialize_function_ref(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    // Validate function type
    if (!lua.isfunction(L, stack_index)) {
        return SerializationError.TypeMismatch;
    }

    // Check if it's actually a C function
    if (!is_c_function(L, stack_index)) {
        return SerializationError.TypeMismatch;
    }

    return serialize_c_function_ref(L, stack_index, buffer, max_len);
}

// Deserialize a function from buffer
pub fn deserialize_function(L: *lua.lua_State, func_type: SerializationType, buffer: [*]const u8, len: usize) SerializationError!void {
    // Note: buffer points to the type byte, skip it for data
    if (len < 1) return SerializationError.InvalidFormat;

    const data_buffer = buffer + 1;
    const data_len = len - 1;

    switch (func_type) {
        SerializationType.function_bytecode => {
            try deserialize_function_bytecode(L, data_buffer, data_len);
        },
        SerializationType.function_ref => {
            try deserialize_function_ref(L, data_buffer, data_len);
        },
        else => return SerializationError.TypeMismatch,
    }
}

// Deserialize Lua bytecode
fn deserialize_lua_bytecode(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    // Check minimum size (4 bytes length, no type byte as it's already consumed)
    if (len < 4) return SerializationError.InvalidFormat;

    // Read bytecode length (little-endian)
    const bytecode_len: u32 = @as(u32, buffer[0]) |
        (@as(u32, buffer[1]) << 8) |
        (@as(u32, buffer[2]) << 16) |
        (@as(u32, buffer[3]) << 24);

    // Verify we have enough data
    if (len < 4 + bytecode_len) return SerializationError.InvalidFormat;

    // Load the bytecode directly using luaL_loadbufferx
    // Mode "b" for binary (bytecode)
    const bytecode_ptr = @as([*]const u8, @ptrCast(buffer + 4));
    const load_result = lua.c.luaL_loadbufferx(L, @ptrCast(bytecode_ptr), bytecode_len, "=deserialized", "b");

    if (load_result != 0) {
        // Error loading bytecode - error message is on stack
        lua.c.lua_pop(L, 1); // Pop error message
        return SerializationError.InvalidFormat;
    }

    // Function is now on top of stack
}

// Deserialize C function reference
fn deserialize_c_function_ref(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    // Check minimum size (2 bytes for index)
    if (len < 2) return SerializationError.InvalidFormat;

    // Read the registry index (little-endian)
    const index: u16 = @as(u16, buffer[0]) |
        (@as(u16, buffer[1]) << 8);

    // Check for unsupported marker
    if (index == 0xFFFF) {
        // Push a placeholder function that raises an error
        lua.c.lua_pushcfunction(L, unsupported_c_function);
        return;
    }

    // Look up the function in the registry
    if (index >= c_function_registry.len) {
        return SerializationError.InvalidFormat;
    }

    const entry = c_function_registry[index];

    // Get the actual C function from Lua's global environment
    // We need to resolve the function by name since we don't store actual pointers

    // Check if name contains a dot (table.field pattern)
    var dot_pos: ?usize = null;
    for (entry.name, 0..) |c, i| {
        if (c == '.') {
            dot_pos = i;
            break;
        }
    }

    if (dot_pos) |pos| {
        // It's a table field like "math.sin"
        const table_name = entry.name[0..pos];
        const field_name = entry.name[pos + 1 ..];

        // Create null-terminated strings
        var table_buf: [256]u8 = undefined;
        var field_buf: [256]u8 = undefined;

        @memcpy(table_buf[0..table_name.len], table_name);
        table_buf[table_name.len] = 0;

        @memcpy(field_buf[0..field_name.len], field_name);
        field_buf[field_name.len] = 0;

        // Get the table
        _ = lua.getglobal(L, @ptrCast(&table_buf));

        if (!lua.istable(L, -1)) {
            lua.c.lua_pop(L, 1);
            lua.pushnil(L);
            return;
        }

        // Get the field
        _ = lua.getfield(L, -1, @ptrCast(&field_buf));
        lua.c.lua_remove(L, -2); // Remove the table
    } else {
        // It's a global function
        var name_buf: [256]u8 = undefined;
        @memcpy(name_buf[0..entry.name.len], entry.name);
        name_buf[entry.name.len] = 0;

        _ = lua.getglobal(L, @ptrCast(&name_buf));
    }

    // Verify we got a function
    if (!lua.isfunction(L, -1)) {
        lua.c.lua_pop(L, 1);
        lua.pushnil(L);
    }
}

// Placeholder C function for unsupported C functions
fn unsupported_c_function(L: ?*lua.c.lua_State) callconv(.c) c_int {
    const state = L.?;
    _ = lua.pushstring(state, "Attempted to call deserialized C function (not supported)");
    return lua.c.lua_error(state);
}

// Get C function name from registry for a function on the stack
pub fn get_c_function_name(L: *lua.lua_State, stack_index: c_int) ?[]const u8 {
    if (!is_c_function(L, stack_index)) return null;

    const func_ptr = lua.c.lua_tocfunction(L, stack_index);
    if (func_ptr == null) return null;

    // Search in registry
    for (c_function_registry) |entry| {
        if (entry.func == func_ptr) {
            return entry.name;
        }
    }

    return null;
}

// Initialize the C function registry with actual function pointers
pub fn init_c_function_registry(L: *lua.lua_State) void {
    // This would be called during initialization to populate the registry
    // with actual function pointers from the Lua state
    _ = L;
    // Implementation would iterate through known functions and store their pointers
}

// Helper function to get upvalue count (for future phases)
fn get_upvalue_count(L: *lua.lua_State, stack_index: c_int) u8 {
    _ = L;
    _ = stack_index;
    // Stub for Phase 1 - will be implemented in later phases
    return 0;
}

// Serialize upvalues (for future phases)
fn serialize_upvalues(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) !usize {
    _ = L;
    _ = stack_index;
    _ = buffer;
    _ = max_len;
    // Stub for Phase 1 - will be implemented in later phases
    return 0;
}

// Deserialize upvalues (for future phases)
fn deserialize_upvalues(L: *lua.lua_State, buffer: [*]const u8, len: usize) !void {
    _ = L;
    _ = buffer;
    _ = len;
    // Stub for Phase 1 - will be implemented in later phases
}

// Validate bytecode for basic security checks
pub fn validate_bytecode(bytecode: [*]const u8, len: usize) bool {
    // Minimum bytecode size check
    if (len < 4) return false;

    // Lua bytecode signature check (0x1B 0x4C 0x75 0x61)
    if (bytecode[0] != 0x1B or bytecode[1] != 0x4C or
        bytecode[2] != 0x75 or bytecode[3] != 0x61)
    {
        return false;
    }

    // Additional checks could include:
    // - Version compatibility
    // - Format validity
    // - Size sanity checks

    return true;
}

// Public function to deserialize bytecode with validation
pub fn deserialize_function_bytecode(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    // Check minimum size (4 bytes length)
    if (len < 4) return SerializationError.InvalidFormat;

    // Read bytecode length (little-endian)
    const bytecode_len: u32 = @as(u32, buffer[0]) |
        (@as(u32, buffer[1]) << 8) |
        (@as(u32, buffer[2]) << 16) |
        (@as(u32, buffer[3]) << 24);

    // Verify we have enough data
    if (len < 4 + bytecode_len) return SerializationError.InvalidFormat;

    // Validate bytecode before loading
    const bytecode_ptr = buffer + 4;
    if (!validate_bytecode(bytecode_ptr, bytecode_len)) {
        return SerializationError.InvalidFormat;
    }

    // Load the bytecode using luaL_loadbuffer
    const load_result = lua.c.luaL_loadbufferx(L, @ptrCast(bytecode_ptr), bytecode_len, "=deserialized_function", "b" // Binary mode
    );

    if (load_result != lua.c.LUA_OK) {
        // Error loading bytecode - error message is on stack
        lua.c.lua_pop(L, 1); // Pop error message
        return SerializationError.InvalidFormat;
    }

    // Function is now on top of stack
}

// Public function to deserialize C function reference
pub fn deserialize_function_ref(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    // Check minimum size (2 bytes for index)
    if (len < 2) return SerializationError.InvalidFormat;

    // Read the registry index (little-endian)
    const index: u16 = @as(u16, buffer[0]) | (@as(u16, buffer[1]) << 8);

    // Check for unsupported marker
    if (index == 0xFFFF) {
        // Push a placeholder function that raises an error
        lua.c.lua_pushcfunction(L, unsupported_c_function);
        return;
    }

    // Look up the function in the registry
    if (index >= c_function_registry.len) {
        return SerializationError.InvalidFormat;
    }

    const entry = c_function_registry[index];

    // Get the actual C function from Lua's global environment
    // We need to resolve the function by name since we don't store actual pointers

    // Check if name contains a dot (table.field pattern)
    var dot_pos: ?usize = null;
    for (entry.name, 0..) |c, i| {
        if (c == '.') {
            dot_pos = i;
            break;
        }
    }

    if (dot_pos) |pos| {
        // It's a table field like "math.sin"
        const table_name = entry.name[0..pos];
        const field_name = entry.name[pos + 1 ..];

        // Create null-terminated strings
        var table_buf: [256]u8 = undefined;
        var field_buf: [256]u8 = undefined;

        @memcpy(table_buf[0..table_name.len], table_name);
        table_buf[table_name.len] = 0;

        @memcpy(field_buf[0..field_name.len], field_name);
        field_buf[field_name.len] = 0;

        // Get the table
        _ = lua.getglobal(L, @ptrCast(&table_buf));

        if (!lua.istable(L, -1)) {
            lua.c.lua_pop(L, 1);
            // Push nil instead of error
            lua.pushnil(L);
            return;
        }

        // Get the field
        _ = lua.getfield(L, -1, @ptrCast(&field_buf));
        lua.c.lua_remove(L, -2); // Remove the table
    } else {
        // It's a global function
        var name_buf: [256]u8 = undefined;
        @memcpy(name_buf[0..entry.name.len], entry.name);
        name_buf[entry.name.len] = 0;

        _ = lua.getglobal(L, @ptrCast(&name_buf));
    }

    // Verify we got a function
    if (!lua.isfunction(L, -1)) {
        lua.c.lua_pop(L, 1);
        // Push nil for missing functions
        lua.pushnil(L);
    }
}
