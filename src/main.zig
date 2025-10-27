const std = @import("std");
const lua = @import("lua.zig");
const serializer = @import("serializer.zig");
const ext_table = @import("ext_table.zig");
const error_handler = @import("error.zig");
const output_capture = @import("output.zig");
const result_encoder = @import("result.zig");

const IO_BUFFER_SIZE = 64 * 1024;
const TOTAL_MEMORY = 2 * 1024 * 1024;

// Storage namespace constants
const HOME_TABLE_NAME = "_home";
const LEGACY_MEMORY_NAME = "Memory";

var io_buffer: [IO_BUFFER_SIZE]u8 align(16) = undefined;
var heap: [TOTAL_MEMORY]u8 align(4096) = undefined;
var global_lua_state: ?*lua.lua_State = null;
var lua_memory_used: usize = 0;
var memory_table_id: u32 = 0;
var io_table_id: u32 = 0;
var enable_memory_alias: bool = true; // Feature flag for backward compatibility

extern fn js_ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]const u8, val_len: usize) c_int;
extern fn js_ext_table_get(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]u8, max_len: usize) c_int;
extern fn js_ext_table_delete(table_id: u32, key_ptr: [*]const u8, key_len: usize) c_int;
extern fn js_ext_table_size(table_id: u32) usize;
extern fn js_ext_table_keys(table_id: u32, buf_ptr: [*]u8, max_len: usize) c_int;

// Import our renamed allocators from libc-stubs.zig
extern fn lua_malloc(size: usize) ?*anyopaque;
extern fn lua_realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque;
extern fn lua_free(ptr: ?*anyopaque) void;

// Custom allocator function for Lua
export fn lua_alloc(ud: ?*anyopaque, ptr: ?*anyopaque, osize: usize, nsize: usize) ?*anyopaque {
    _ = ud;
    _ = osize;

    if (nsize == 0) {
        lua_free(ptr);
        return null;
    }

    return lua_realloc(ptr, nsize);
}

export fn init() i32 {
    if (global_lua_state != null) {
        return 0;
    }

    // Use lua_newstate with custom allocator instead of luaL_newstate
    const L = lua.c.lua_newstate(lua_alloc, null);
    if (L == null) {
        return -1;
    }

    global_lua_state = L;
    lua.openlibs(L.?);
    lua_memory_used = 0;

    error_handler.init_error_state();
    output_capture.init_output_capture();

    ext_table.init_ext_table(&io_buffer, IO_BUFFER_SIZE);
    ext_table.setup_ext_table_library(L.?);
    setup_print_override(L.?);
    setup_memory_global(L.?);
    setup_io_global(L.?);

    return 0;
}

fn setup_print_override(L: *lua.lua_State) void {
    lua.pushcfunction(L, @as(lua.c.lua_CFunction, @ptrCast(&output_capture.custom_print)));
    lua.setglobal(L, "print");
}

fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    // Set primary _home global
    lua.pushvalue(L, -1); // Duplicate table reference
    lua.setglobal(L, HOME_TABLE_NAME);
    // Set legacy Memory alias for backward compatibility
    if (enable_memory_alias) {
        lua.setglobal(L, LEGACY_MEMORY_NAME);
    } else {
        lua.pop(L, 1); // Clean up duplicate if alias disabled
    }
}

fn setup_io_global(L: *lua.lua_State) void {
    io_table_id = ext_table.create_table(L);
    lua.setglobal(L, "_io");
}

pub fn ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]const u8, val_len: usize) c_int {
    return js_ext_table_set(table_id, key_ptr, key_len, val_ptr, val_len);
}

pub fn ext_table_get(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]u8, max_len: usize) c_int {
    return js_ext_table_get(table_id, key_ptr, key_len, val_ptr, max_len);
}

pub fn ext_table_delete(table_id: u32, key_ptr: [*]const u8, key_len: usize) c_int {
    return js_ext_table_delete(table_id, key_ptr, key_len);
}

pub fn ext_table_size(table_id: u32) usize {
    return js_ext_table_size(table_id);
}

pub fn ext_table_keys(table_id: u32, buf_ptr: [*]u8, max_len: usize) c_int {
    return js_ext_table_keys(table_id, buf_ptr, max_len);
}

export fn get_buffer_ptr() [*]u8 {
    return &io_buffer;
}

export fn get_buffer_size() usize {
    return IO_BUFFER_SIZE;
}

export fn compute(code_ptr: usize, code_len: usize) i32 {
    _ = code_ptr;
    if (code_len > IO_BUFFER_SIZE) return -1;
    if (code_len == 0) return 0;

    if (global_lua_state == null) {
        const error_msg = "Lua state not initialized";
        @memcpy(io_buffer[0..error_msg.len], error_msg);
        return -1;
    }

    const L = global_lua_state.?;

    output_capture.reset_output();
    error_handler.clear_error_state(L);

    const code_bytes = io_buffer[0..code_len];

    var code_with_null: [IO_BUFFER_SIZE + 1]u8 = undefined;
    @memcpy(code_with_null[0..code_len], code_bytes);
    code_with_null[code_len] = 0;
    const code_cstr: [*:0]u8 = @ptrCast(&code_with_null[0]);

    const result = lua.dostring(L, code_cstr);

    if (result != 0) {
        _ = error_handler.capture_lua_error(L, result);
        const error_len = error_handler.format_error_to_buffer(&io_buffer, IO_BUFFER_SIZE);
        return -@as(i32, @intCast(error_len + 1));
    }

    const encoded_len = result_encoder.encode_result(L, &io_buffer, IO_BUFFER_SIZE);
    return @intCast(encoded_len);
}

pub const MemoryStats = extern struct {
    io_buffer_size: usize,
    lua_memory_used: usize,
    wasm_pages: usize,
};

export fn get_memory_stats(stats_ptr: *MemoryStats) void {
    stats_ptr.*.io_buffer_size = IO_BUFFER_SIZE;
    stats_ptr.*.lua_memory_used = lua_memory_used;
    stats_ptr.*.wasm_pages = (TOTAL_MEMORY + 65535) / 65536;
}

export fn run_gc() void {}

export fn attach_memory_table(table_id: u32) void {
    if (global_lua_state == null) return;
    if (table_id == 0) return;

    const L = global_lua_state.?;
    ext_table.attach_table(L, table_id);
    // Set primary _home global
    lua.pushvalue(L, -1); // Duplicate table reference
    lua.setglobal(L, HOME_TABLE_NAME);
    // Set legacy Memory alias for backward compatibility
    if (enable_memory_alias) {
        lua.setglobal(L, LEGACY_MEMORY_NAME);
    } else {
        lua.pop(L, 1); // Clean up duplicate if alias disabled
    }
    memory_table_id = table_id;
}

export fn get_memory_table_id() u32 {
    return memory_table_id;
}

export fn get_io_table_id() u32 {
    return io_table_id;
}

export fn clear_io_table() void {
    if (global_lua_state == null) return;
    const L = global_lua_state.?;

    // Clear _io.input, _io.output, _io.meta
    _ = lua.getglobal(L, "_io");
    lua.pushnil(L);
    lua.setfield(L, -2, "input");
    lua.pushnil(L);
    lua.setfield(L, -2, "output");
    lua.pushnil(L);
    lua.setfield(L, -2, "meta");
    lua.pop(L, 1);
}

export fn sync_external_table_counter(next_id: u32) void {
    ext_table.sync_counter(next_id);
}

export fn set_memory_alias_enabled(enabled: c_int) void {
    enable_memory_alias = enabled != 0;
}

pub fn main() void {
    // Empty main - required for WASI target
}

// Explicitly call all exported functions in start to prevent optimizer removal
pub fn _start_lua() void {
    _ = init;
    _ = compute;
    _ = get_buffer_ptr;
    _ = get_buffer_size;
    _ = get_memory_stats;
    _ = run_gc;
}

var _exports_keepalive: usize = @intFromPtr(&init) + @intFromPtr(&compute) + @intFromPtr(&get_buffer_ptr) + @intFromPtr(&get_buffer_size) + @intFromPtr(&get_memory_stats) + @intFromPtr(&run_gc) + @intFromPtr(&get_io_table_id) + @intFromPtr(&clear_io_table);
