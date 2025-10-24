const std = @import("std");
const lua = @import("lua.zig");

const IO_BUFFER_SIZE = 64 * 1024;
const MAX_ERROR_MSG_SIZE = IO_BUFFER_SIZE - 10;
const ERROR_PREFIX_LEN = 4;

pub const ErrorCode = enum(c_int) {
    success = 0,
    compilation_error = -1,
    runtime_error = -2,
    serialization_error = -3,
};

var error_buffer: [MAX_ERROR_MSG_SIZE]u8 = undefined;
var error_len: usize = 0;
var last_error_code: ErrorCode = .success;

pub fn init_error_state() void {
    error_len = 0;
    last_error_code = .success;
}

pub fn clear_error_state(L: *lua.lua_State) void {
    error_len = 0;
    last_error_code = .success;
    lua.settop(L, 0);
}

pub fn capture_lua_error(L: *lua.lua_State, error_code: c_int) ErrorCode {
    var error_enum: ErrorCode = .runtime_error;

    if (error_code == 4) {
        error_enum = .compilation_error;
    } else if (error_code == 2) {
        error_enum = .runtime_error;
    } else if (error_code == 5) {
        error_enum = .serialization_error;
    }

    last_error_code = error_enum;

    const err_str = lua.tostring(L, -1);
    if (err_str[0] != 0) {
        var i: usize = 0;
        while (i < MAX_ERROR_MSG_SIZE - 1 and err_str[i] != 0) : (i += 1) {
            error_buffer[i] = err_str[i];
        }
        error_len = i;
    } else {
        const fallback = "Unknown error";
        @memcpy(error_buffer[0..fallback.len], fallback);
        error_len = fallback.len;
    }

    lua.settop(L, 0);
    return error_enum;
}

pub fn format_error_to_buffer(buffer: [*]u8, max_len: usize) usize {
    if (max_len < 1) return 0;

    if (error_len == 0) {
        const msg = "Unknown error";
        const copy_len = if (msg.len < max_len) msg.len else max_len - 1;
        @memcpy(buffer[0..copy_len], msg[0..copy_len]);
        return copy_len;
    }

    const copy_len = if (error_len < max_len) error_len else max_len - 1;
    @memcpy(buffer[0..copy_len], error_buffer[0..copy_len]);
    return copy_len;
}

pub fn get_last_error_code() ErrorCode {
    return last_error_code;
}

pub fn get_error_len() usize {
    return error_len;
}

pub fn truncate_error_message() void {
    const truncation = "...";
    const max_trunc = MAX_ERROR_MSG_SIZE - truncation.len;
    if (error_len > max_trunc) {
        @memcpy(error_buffer[max_trunc .. max_trunc + truncation.len], truncation);
        error_len = max_trunc + truncation.len;
    }
}

pub fn is_error() bool {
    return last_error_code != .success;
}
