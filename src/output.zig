const std = @import("std");
const lua = @import("lua.zig");

const IO_BUFFER_SIZE = 64 * 1024;
const OUTPUT_BUFFER_MAX = IO_BUFFER_SIZE - 1024;
const OVERFLOW_MARKER = "...";

var output_buffer: [OUTPUT_BUFFER_MAX]u8 = undefined;
var output_len: usize = 0;
var output_overflow: bool = false;

pub fn init_output_capture() void {
    output_len = 0;
    output_overflow = false;
}

pub fn reset_output() void {
    output_len = 0;
    output_overflow = false;
}

pub fn push_output(data: []const u8) bool {
    if (output_overflow) {
        return false;
    }

    const remaining = OUTPUT_BUFFER_MAX - output_len;
    if (data.len > remaining) {
        if (remaining >= OVERFLOW_MARKER.len) {
            @memcpy(output_buffer[output_len .. output_len + remaining], data[0..remaining]);
            output_len += remaining;
        }
        output_overflow = true;
        return false;
    }

    @memcpy(output_buffer[output_len .. output_len + data.len], data);
    output_len += data.len;
    return true;
}

pub fn get_output_len() usize {
    if (output_overflow) {
        return output_len + OVERFLOW_MARKER.len;
    }
    return output_len;
}

pub fn get_output_ptr() [*]u8 {
    return &output_buffer;
}

pub fn flush_output_to_buffer(buffer: [*]u8, offset: usize, max_len: usize) usize {
    if (max_len < output_len) {
        const copy_len = max_len;
        @memcpy(buffer[offset .. offset + copy_len], output_buffer[0..copy_len]);
        if (output_overflow and offset + copy_len + OVERFLOW_MARKER.len <= IO_BUFFER_SIZE) {
            @memcpy(buffer[offset + copy_len .. offset + copy_len + OVERFLOW_MARKER.len], OVERFLOW_MARKER);
            return copy_len + OVERFLOW_MARKER.len;
        }
        return copy_len;
    }

    @memcpy(buffer[offset .. offset + output_len], output_buffer[0..output_len]);
    var total = output_len;

    if (output_overflow) {
        const remaining = max_len - output_len;
        if (remaining >= OVERFLOW_MARKER.len) {
            @memcpy(buffer[offset + output_len .. offset + output_len + OVERFLOW_MARKER.len], OVERFLOW_MARKER);
            total += OVERFLOW_MARKER.len;
        }
    }

    return total;
}

pub fn custom_print(L: *lua.lua_State) c_int {
    const argc = lua.gettop(L);

    for (0..@intCast(argc)) |i| {
        if (i > 0) {
            _ = push_output("\t");
        }

        if (lua.isstring(L, @intCast(i + 1))) {
            var str_len: usize = 0;
            const str = lua.tolstring(L, @intCast(i + 1), &str_len);
            _ = push_output(str[0..str_len]);
        } else if (lua.isnumber(L, @intCast(i + 1))) {
            var buf: [64]u8 = undefined;
            const num = lua.tonumber(L, @intCast(i + 1));
            const int_val = lua.tointeger(L, @intCast(i + 1));

            if (@as(f64, @floatFromInt(int_val)) == num) {
                const fmt_result = std.fmt.bufPrint(&buf, "{d}", .{int_val}) catch "";
                _ = push_output(fmt_result);
            } else {
                const fmt_result = std.fmt.bufPrint(&buf, "{d}", .{num}) catch "";
                _ = push_output(fmt_result);
            }
        } else if (lua.isboolean(L, @intCast(i + 1))) {
            const val = lua.toboolean(L, @intCast(i + 1));
            const str = if (val) "true" else "false";
            _ = push_output(str);
        } else if (lua.isnil(L, @intCast(i + 1))) {
            _ = push_output("nil");
        } else {
            const type_name = lua.type_name(L, @intCast(i + 1));
            var i_type: usize = 0;
            while (i_type < 32 and type_name[i_type] != 0) : (i_type += 1) {
                var buf: [32]u8 = undefined;
                buf[i_type] = type_name[i_type];
            }
            if (i_type > 0) {
                _ = push_output(type_name[0..i_type]);
            }
        }
    }

    _ = push_output("\n");
    return 0;
}

pub fn is_overflow() bool {
    return output_overflow;
}
