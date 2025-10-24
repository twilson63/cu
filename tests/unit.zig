const std = @import("std");
const lua = @import("../src/lua.zig");
const serializer = @import("../src/serializer.zig");
const error_handler = @import("../src/error.zig");
const output_capture = @import("../src/output.zig");
const result_encoder = @import("../src/result.zig");
const ext_table = @import("../src/ext_table.zig");

const TestContext = struct {
    L: *lua.lua_State,
    buffer: [65536]u8,
};

var test_context: TestContext = undefined;

fn setup() void {
    test_context.L = lua.newstate();
    lua.openlibs(test_context.L);
    error_handler.init_error_state();
    output_capture.init_output_capture();
    ext_table.init_ext_table(&test_context.buffer, 65536);
    ext_table.setup_ext_table_library(test_context.L);
}

fn teardown() void {
    if (test_context.L != null) {
        lua.close(test_context.L);
    }
}

pub fn test_serialization_nil() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushnil(test_context.L);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 1);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.nil));
}

pub fn test_serialization_boolean_true() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushboolean(test_context.L, 1);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 2);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.boolean));
    std.debug.assert(buffer[1] == 1);
}

pub fn test_serialization_boolean_false() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushboolean(test_context.L, 0);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 2);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.boolean));
    std.debug.assert(buffer[1] == 0);
}

pub fn test_serialization_integer() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushinteger(test_context.L, 42);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 9);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.integer));
}

pub fn test_serialization_integer_negative() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushinteger(test_context.L, -999);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 9);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.integer));

    const int_bytes = buffer[1..9];
    const int_val: i64 = std.mem.bytesAsValue(i64, int_bytes[0..8].*);
    std.debug.assert(int_val == -999);
}

pub fn test_serialization_integer_max() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    const max_i64: i64 = 9223372036854775807;
    lua.pushinteger(test_context.L, max_i64);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 9);
    const int_bytes = buffer[1..9];
    const int_val: i64 = std.mem.bytesAsValue(i64, int_bytes[0..8].*);
    std.debug.assert(int_val == max_i64);
}

pub fn test_serialization_float() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushnumber(test_context.L, 3.14);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 9);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.float));
}

pub fn test_serialization_string_empty() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    _ = lua.pushlstring(test_context.L, "", 0);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 5);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.string));
}

pub fn test_serialization_string_simple() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;
    const test_str = "hello";

    _ = lua.pushlstring(test_context.L, test_str, test_str.len);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;

    std.debug.assert(len == 5 + test_str.len);
    std.debug.assert(buffer[0] == @intFromEnum(serializer.SerializationType.string));
}

pub fn test_serialization_roundtrip_nil() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushnil(test_context.L);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isnil(test_context.L, -1));
}

pub fn test_serialization_roundtrip_boolean() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushboolean(test_context.L, 1);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isboolean(test_context.L, -1));
    std.debug.assert(lua.toboolean(test_context.L, -1) == 1);
}

pub fn test_serialization_roundtrip_integer() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushinteger(test_context.L, 12345);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isnumber(test_context.L, -1));
    std.debug.assert(lua.tointeger(test_context.L, -1) == 12345);
}

pub fn test_serialization_roundtrip_float() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushnumber(test_context.L, 3.14159);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isnumber(test_context.L, -1));
    const val = lua.tonumber(test_context.L, -1);
    std.debug.assert(@abs(val - 3.14159) < 0.0001);
}

pub fn test_serialization_roundtrip_string() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;
    const test_str = "test string";

    _ = lua.pushlstring(test_context.L, test_str, test_str.len);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isstring(test_context.L, -1));
    var result_len: usize = 0;
    const result_str = lua.tolstring(test_context.L, -1, &result_len);
    std.debug.assert(result_len == test_str.len);
    std.debug.assert(std.mem.eql(u8, result_str[0..result_len], test_str));
}

pub fn test_serialization_buffer_overflow_prevention() void {
    setup();
    defer teardown();

    var buffer: [5]u8 = undefined;

    lua.pushinteger(test_context.L, 42);
    const result = serializer.serialize_value(test_context.L, -1, &buffer, 4);

    std.debug.assert(result == error.BufferTooSmall);
}

pub fn test_output_single_print() void {
    setup();
    defer teardown();

    output_capture.reset_output();

    const test_str = "hello";

    _ = lua.pushlstring(test_context.L, test_str, test_str.len);
    _ = output_capture.custom_print(test_context.L);

    const output_len = output_capture.get_output_len();

    std.debug.assert(output_len > 0);
}

pub fn test_output_multiple_prints() void {
    setup();
    defer teardown();

    output_capture.reset_output();

    const result1 = output_capture.push_output("first");
    const result2 = output_capture.push_output(" ");
    const result3 = output_capture.push_output("second");

    std.debug.assert(result1);
    std.debug.assert(result2);
    std.debug.assert(result3);

    std.debug.assert(output_capture.get_output_len() == 12);
}

pub fn test_output_large_output() void {
    setup();
    defer teardown();

    output_capture.reset_output();

    var large_data: [1000]u8 = undefined;
    @memset(&large_data, 'a');

    const result = output_capture.push_output(&large_data);

    std.debug.assert(result);
    std.debug.assert(output_capture.get_output_len() == 1000);
}

pub fn test_output_overflow_detection() void {
    setup();
    defer teardown();

    output_capture.reset_output();

    var data: [100000]u8 = undefined;
    @memset(&data, 'x');

    _ = output_capture.push_output(data[0..100000]);

    std.debug.assert(output_capture.is_overflow());
}

pub fn test_error_handling_nil_state() void {
    std.debug.assert(error_handler.get_last_error_code() == error_handler.ErrorCode.success);
}

pub fn test_error_state_initialization() void {
    error_handler.init_error_state();
    std.debug.assert(error_handler.get_last_error_code() == error_handler.ErrorCode.success);
    std.debug.assert(error_handler.get_error_len() == 0);
}

pub fn test_error_code_compilation() void {
    error_handler.init_error_state();
    const code = error_handler.capture_lua_error(null, 4);
    std.debug.assert(code == error_handler.ErrorCode.compilation_error);
}

pub fn test_error_code_runtime() void {
    error_handler.init_error_state();
    const code = error_handler.capture_lua_error(null, 2);
    std.debug.assert(code == error_handler.ErrorCode.runtime_error);
}

pub fn test_result_encoding_nil() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushnil(test_context.L);
    const len = result_encoder.encode_result(test_context.L, &buffer, 1024);

    std.debug.assert(len > 0);
}

pub fn test_result_encoding_integer() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    lua.pushinteger(test_context.L, 42);
    const len = result_encoder.encode_result(test_context.L, &buffer, 1024);

    std.debug.assert(len > 4);
}

pub fn test_result_encoding_string() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;
    const test_str = "result";

    _ = lua.pushlstring(test_context.L, test_str, test_str.len);
    const len = result_encoder.encode_result(test_context.L, &buffer, 1024);

    std.debug.assert(len > 4);
}

pub fn test_result_output_length_encoding() void {
    var buffer: [10]u8 = undefined;
    result_encoder.write_encoded_output_length(&buffer, 12345);

    const read_len = result_encoder.read_encoded_output_length(&buffer);
    std.debug.assert(read_len == 12345);
}

pub fn test_serialization_max_buffer_size() void {
    setup();
    defer teardown();

    var buffer: [65536]u8 = undefined;
    var large_str: [65000]u8 = undefined;
    @memset(&large_str, 'x');

    _ = lua.pushlstring(test_context.L, &large_str, large_str.len);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 65536) catch unreachable;

    std.debug.assert(len == 5 + 65000);
}

pub fn test_serialization_float_precision() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    const original: f64 = 123.456789;
    lua.pushnumber(test_context.L, original);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    const restored = lua.tonumber(test_context.L, -1);
    std.debug.assert(restored == original);
}

pub fn test_serialization_empty_string_roundtrip() void {
    setup();
    defer teardown();

    var buffer: [1024]u8 = undefined;

    _ = lua.pushlstring(test_context.L, "", 0);
    const len = serializer.serialize_value(test_context.L, -1, &buffer, 1024) catch unreachable;
    lua.settop(test_context.L, 0);

    serializer.deserialize_value(test_context.L, &buffer, len) catch unreachable;

    std.debug.assert(lua.isstring(test_context.L, -1));
    var result_len: usize = 0;
    _ = lua.tolstring(test_context.L, -1, &result_len);
    std.debug.assert(result_len == 0);
}

pub fn test_output_capture_reset() void {
    output_capture.init_output_capture();
    output_capture.push_output("test");

    std.debug.assert(output_capture.get_output_len() > 0);

    output_capture.reset_output();

    std.debug.assert(output_capture.get_output_len() == 0);
}

pub fn test_ext_table_library_setup() void {
    setup();
    defer teardown();

    lua.getglobal(test_context.L, "ext");
    std.debug.assert(!lua.isnil(test_context.L, -1));
    std.debug.assert(lua.istable(test_context.L, -1));
}

pub fn test_error_buffer_handling() void {
    error_handler.init_error_state();
    var buffer: [100]u8 = undefined;

    const len = error_handler.format_error_to_buffer(&buffer, 100);
    std.debug.assert(len >= 0);
}
