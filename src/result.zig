const std = @import("std");
const lua = @import("lua.zig");
const serializer = @import("serializer.zig");
const output = @import("output.zig");

const IO_BUFFER_SIZE = 64 * 1024;
const OUTPUT_LEN_SIZE = 4;
const RESULT_OFFSET = OUTPUT_LEN_SIZE;

pub fn encode_result(L: *lua.lua_State, buffer: [*]u8, max_len: usize) usize {
    if (max_len < OUTPUT_LEN_SIZE) {
        return 0;
    }

    const output_len = output.get_output_len();
    const output_ptr = output.get_output_ptr();

    const output_len_u32: u32 = @intCast(output_len);
    const output_len_bytes = std.mem.asBytes(&output_len_u32);
    @memcpy(buffer[0..4], output_len_bytes);

    var offset: usize = OUTPUT_LEN_SIZE;

    if (output_len > 0) {
        const output_copy_len = if (OUTPUT_LEN_SIZE + output_len > max_len)
            max_len - OUTPUT_LEN_SIZE
        else
            output_len;

        @memcpy(buffer[offset .. offset + output_copy_len], output_ptr[0..output_copy_len]);
        offset += output_copy_len;

        if (output.is_overflow() and offset + 3 <= max_len) {
            @memcpy(buffer[offset .. offset + 3], "...");
            offset += 3;
        }
    }

    const top = lua.gettop(L);

    if (top > 0) {
        offset = encode_stack_value(L, -1, buffer, offset, max_len);
    } else {
        if (offset + 1 <= max_len) {
            buffer[offset] = @intFromEnum(serializer.SerializationType.nil);
            offset += 1;
        }
    }

    lua.settop(L, 0);
    return offset;
}

fn encode_stack_value(L: *lua.lua_State, stack_idx: c_int, buffer: [*]u8, offset: usize, max_len: usize) usize {
    if (offset >= max_len) {
        return offset;
    }

    const remaining = max_len - offset;

    if (lua.isnil(L, stack_idx)) {
        if (remaining >= 1) {
            buffer[offset] = @intFromEnum(serializer.SerializationType.nil);
            return offset + 1;
        }
        return offset;
    }

    if (lua.isboolean(L, stack_idx)) {
        if (remaining >= 2) {
            buffer[offset] = @intFromEnum(serializer.SerializationType.boolean);
            const val = lua.toboolean(L, stack_idx);
            buffer[offset + 1] = if (val) 1 else 0;
            return offset + 2;
        }
        return offset;
    }

    if (lua.isnumber(L, stack_idx)) {
        const num = lua.tonumber(L, stack_idx);
        const int_val = lua.tointeger(L, stack_idx);

        if (@as(f64, @floatFromInt(int_val)) == num) {
            if (remaining >= 9) {
                buffer[offset] = @intFromEnum(serializer.SerializationType.integer);
                const bytes = std.mem.asBytes(&int_val);
                @memcpy(buffer[offset + 1 .. offset + 9], bytes);
                return offset + 9;
            }
        } else {
            if (remaining >= 9) {
                buffer[offset] = @intFromEnum(serializer.SerializationType.float);
                const bytes = std.mem.asBytes(&num);
                @memcpy(buffer[offset + 1 .. offset + 9], bytes);
                return offset + 9;
            }
        }
        return offset;
    }

    if (lua.isstring(L, stack_idx)) {
        var str_len: usize = 0;
        const str = lua.tolstring(L, stack_idx, &str_len);

        if (str_len > 0) {
            if (remaining >= 5 + str_len) {
                buffer[offset] = @intFromEnum(serializer.SerializationType.string);
                const len_u32: u32 = @intCast(str_len);
                const len_bytes = std.mem.asBytes(&len_u32);
                @memcpy(buffer[offset + 1 .. offset + 5], len_bytes);
                @memcpy(buffer[offset + 5 .. offset + 5 + str_len], str[0..str_len]);
                return offset + 5 + str_len;
            } else if (remaining >= 5) {
                buffer[offset] = @intFromEnum(serializer.SerializationType.string);
                const copy_len = remaining - 5;
                const len_u32: u32 = @intCast(copy_len);
                const len_bytes = std.mem.asBytes(&len_u32);
                @memcpy(buffer[offset + 1 .. offset + 5], len_bytes);
                @memcpy(buffer[offset + 5 .. offset + 5 + copy_len], str[0..copy_len]);
                return offset + 5 + copy_len;
            }
        }
        return offset;
    }

    if (lua.istable(L, stack_idx)) {
        const type_marker = "table";
        if (remaining >= type_marker.len) {
            @memcpy(buffer[offset .. offset + type_marker.len], type_marker);
            return offset + type_marker.len;
        }
        return offset;
    }

    if (lua.isfunction(L, stack_idx)) {
        const type_marker = "function";
        if (remaining >= type_marker.len) {
            @memcpy(buffer[offset .. offset + type_marker.len], type_marker);
            return offset + type_marker.len;
        }
        return offset;
    }

    const type_name = lua.type_name(L, stack_idx);
    var i: usize = 0;
    while (i < remaining and type_name[i] != 0) : (i += 1) {
        buffer[offset + i] = type_name[i];
    }
    return offset + i;
}

pub fn write_encoded_output_length(buffer: [*]u8, output_len: usize) void {
    const len_u32: u32 = @intCast(output_len);
    const len_bytes = std.mem.asBytes(&len_u32);
    @memcpy(buffer[0..4], len_bytes);
}

pub fn read_encoded_output_length(buffer: [*]const u8) u32 {
    const len_bytes = buffer[0..4];
    return std.mem.bytesAsValue(u32, len_bytes[0..4].*);
}
