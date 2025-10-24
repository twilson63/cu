const std = @import("std");
const lua = @import("lua.zig");
const serializer = @import("serializer.zig");

const c = lua.c;
const IO_BUFFER_SIZE = 64 * 1024;

extern fn js_ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]const u8, val_len: usize) c_int;
extern fn js_ext_table_get(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]u8, max_len: usize) c_int;
extern fn js_ext_table_delete(table_id: u32, key_ptr: [*]const u8, key_len: usize) c_int;
extern fn js_ext_table_size(table_id: u32) usize;
extern fn js_ext_table_keys(table_id: u32, buf_ptr: [*]u8, max_len: usize) c_int;

var io_buffer: [*]u8 = undefined;
var io_buffer_size: usize = 0;
var external_table_counter: u32 = 1;

pub fn init_ext_table(buffer: [*]u8, buffer_size: usize) void {
    io_buffer = buffer;
    io_buffer_size = buffer_size;
}

fn ensure_metatable(L: *lua.lua_State) void {
    const meta_type: [*:0]const u8 = "ext_table_mt";
    if (lua.luaL_newmetatable(L, meta_type) != 0) {
        lua.pushcfunction(L, @as(c.lua_CFunction, @ptrCast(&ext_table_index_impl)));
        lua.setfield(L, -2, "__index");

        lua.pushcfunction(L, @as(c.lua_CFunction, @ptrCast(&ext_table_newindex_impl)));
        lua.setfield(L, -2, "__newindex");

        lua.pushcfunction(L, @as(c.lua_CFunction, @ptrCast(&ext_table_len_impl)));
        lua.setfield(L, -2, "__len");
    }

    _ = lua.setmetatable(L, -2);
}

fn push_ext_table(L: *lua.lua_State, table_id: u32) void {
    lua.newtable(L);
    lua.pushinteger(L, table_id);
    lua.setfield(L, -2, "__ext_table_id");
    ensure_metatable(L);
}

pub fn create_table(L: *lua.lua_State) u32 {
    const table_id = external_table_counter;
    external_table_counter += 1;
    push_ext_table(L, table_id);
    return table_id;
}

pub fn attach_table(L: *lua.lua_State, table_id: u32) void {
    if (table_id == 0) return;
    push_ext_table(L, table_id);
    if (table_id >= external_table_counter) {
        external_table_counter = table_id + 1;
    }
}

pub fn sync_counter(next_id: u32) void {
    if (next_id > external_table_counter) {
        external_table_counter = next_id;
    }
}

fn serialize_key(L: *lua.lua_State, idx: c_int, buffer: [*]u8, max_len: usize) !usize {
    if (lua.isstring(L, idx)) {
        var key_len: usize = 0;
        const key_ptr = lua.tolstring(L, idx, &key_len);
        if (key_len == 0) return serializer.SerializationError.InvalidFormat;

        if (key_len > max_len) return serializer.SerializationError.BufferTooSmall;

        @memcpy(buffer[0..key_len], key_ptr[0..key_len]);
        return key_len;
    }

    if (lua.isnumber(L, idx)) {
        const num = lua.tonumber(L, idx);
        const int_val = lua.tointeger(L, idx);

        if (@as(f64, @floatFromInt(int_val)) == num) {
            var buf: [32]u8 = undefined;
            const num_str = std.fmt.bufPrint(&buf, "{d}", .{int_val}) catch {
                return serializer.SerializationError.InvalidFormat;
            };

            if (num_str.len > max_len) return serializer.SerializationError.BufferTooSmall;
            @memcpy(buffer[0..num_str.len], num_str);
            return num_str.len;
        } else {
            var buf: [32]u8 = undefined;
            const num_str = std.fmt.bufPrint(&buf, "{d}", .{num}) catch {
                return serializer.SerializationError.InvalidFormat;
            };

            if (num_str.len > max_len) return serializer.SerializationError.BufferTooSmall;
            @memcpy(buffer[0..num_str.len], num_str);
            return num_str.len;
        }
    }

    return serializer.SerializationError.TypeMismatch;
}

fn ext_table_new_impl(L: *lua.lua_State) c_int {
    _ = create_table(L);
    return 1;
}

fn ext_table_index_impl(L: *lua.lua_State) c_int {
    if (lua.gettop(L) < 2) {
        return 0;
    }

    var table_id: u32 = 0;
    _ = lua.getfield(L, 1, "__ext_table_id");
    if (lua.isnumber(L, -1)) {
        table_id = @intCast(lua.tointeger(L, -1));
    }
    lua.settop(L, -2);

    if (table_id == 0) {
        lua.pushnil(L);
        return 1;
    }

    const key_buffer_start = io_buffer;
    const key_buffer_size = io_buffer_size / 4;

    const key_len = serialize_key(L, 2, key_buffer_start, key_buffer_size) catch {
        lua.pushnil(L);
        return 1;
    };

    const value_buffer_start = io_buffer + io_buffer_size / 4;
    const value_buffer_size = io_buffer_size / 4;

    const result = js_ext_table_get(table_id, key_buffer_start, key_len, value_buffer_start, value_buffer_size);
    if (result > 0) {
        serializer.deserialize_value(L, value_buffer_start, @intCast(result)) catch {
            lua.pushnil(L);
        };
        return 1;
    }

    lua.pushnil(L);
    return 1;
}

fn ext_table_newindex_impl(L: *lua.lua_State) c_int {
    if (lua.gettop(L) < 3) {
        return 0;
    }

    var table_id: u32 = 0;
    _ = lua.getfield(L, 1, "__ext_table_id");
    if (lua.isnumber(L, -1)) {
        table_id = @intCast(lua.tointeger(L, -1));
    }
    lua.settop(L, -2);

    if (table_id == 0) {
        return 0;
    }

    const key_buffer_start = io_buffer;
    const key_buffer_size = io_buffer_size / 4;

    const key_len = serialize_key(L, 2, key_buffer_start, key_buffer_size) catch {
        return 0;
    };

    const value_buffer_start = io_buffer + io_buffer_size / 4;
    const value_buffer_size = io_buffer_size / 4;

    const value_len = serializer.serialize_value(L, 3, value_buffer_start, value_buffer_size) catch {
        return 0;
    };

    _ = js_ext_table_set(table_id, key_buffer_start, key_len, value_buffer_start, value_len);

    return 0;
}

fn ext_table_len_impl(L: *lua.lua_State) c_int {
    if (lua.gettop(L) < 1) {
        return 0;
    }

    var table_id: u32 = 0;
    _ = lua.getfield(L, 1, "__ext_table_id");
    if (lua.isnumber(L, -1)) {
        table_id = @intCast(lua.tointeger(L, -1));
    }
    lua.settop(L, -2);

    if (table_id == 0) {
        return 0;
    }

    const size = js_ext_table_size(table_id);
    lua.pushinteger(L, @intCast(size));
    return 1;
}

pub fn setup_ext_table_library(L: *lua.lua_State) void {
    lua.newtable(L);

    lua.pushcfunction(L, @as(c.lua_CFunction, @ptrCast(&ext_table_new_impl)));
    lua.setfield(L, -2, "table");

    lua.setglobal(L, "ext");
}
