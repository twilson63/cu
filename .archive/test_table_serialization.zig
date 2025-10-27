const std = @import("std");
const lua = @import("src/lua.zig");
const serializer = @import("src/serializer.zig");
const ext_table = @import("src/ext_table.zig");

// Mock JavaScript bridge functions for testing
var mock_table_storage = std.AutoHashMap(u32, std.StringHashMap([]const u8)).init(std.heap.page_allocator);

export fn js_ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]const u8, val_len: usize) c_int {
    const allocator = std.heap.page_allocator;

    // Get or create table
    const table = mock_table_storage.getPtr(table_id) orelse blk: {
        const new_table = std.StringHashMap([]const u8).init(allocator);
        mock_table_storage.put(table_id, new_table) catch return -1;
        break :blk mock_table_storage.getPtr(table_id).?;
    };

    // Copy key
    const key = allocator.dupe(u8, key_ptr[0..key_len]) catch return -1;

    // Copy value
    const value = allocator.dupe(u8, val_ptr[0..val_len]) catch return -1;

    // Store
    table.put(key, value) catch return -1;

    std.debug.print("  [MOCK] Table {d}: set key '{s}' ({d} bytes)\n", .{ table_id, key, val_len });

    return 0;
}

export fn js_ext_table_get(table_id: u32, key_ptr: [*]const u8, key_len: usize, val_ptr: [*]u8, max_len: usize) c_int {
    const table = mock_table_storage.getPtr(table_id) orelse return -1;

    const key = key_ptr[0..key_len];
    const value = table.get(key) orelse return -1;

    if (value.len > max_len) return -1;

    @memcpy(val_ptr[0..value.len], value);

    return @intCast(value.len);
}

export fn js_ext_table_delete(table_id: u32, key_ptr: [*]const u8, key_len: usize) c_int {
    const table = mock_table_storage.getPtr(table_id) orelse return -1;
    const key = key_ptr[0..key_len];
    _ = table.remove(key);
    return 0;
}

export fn js_ext_table_size(table_id: u32) usize {
    const table = mock_table_storage.getPtr(table_id) orelse return 0;
    return table.count();
}

export fn js_ext_table_keys(table_id: u32, buf_ptr: [*]u8, max_len: usize) c_int {
    _ = table_id;
    _ = buf_ptr;
    _ = max_len;
    return 0; // Not implemented for tests
}

fn init_lua() !*lua.lua_State {
    const L = lua.newstate() orelse return error.LuaInitFailed;
    lua.openlibs(L);

    // Initialize ext_table with a buffer
    var buffer: [64 * 1024]u8 = undefined;
    ext_table.init_ext_table(&buffer, buffer.len);

    return L;
}

fn test_simple_table() !void {
    std.debug.print("\n=== Test: Simple Table ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create a simple Lua table: {a=1, b=2}
    lua.newtable(L);

    _ = lua.pushstring(L, "a");
    lua.pushinteger(L, 1);
    lua.c.lua_rawset(L, -3);

    _ = lua.pushstring(L, "b");
    lua.pushinteger(L, 2);
    lua.c.lua_rawset(L, -3);

    // Serialize it
    var buffer: [1024]u8 = undefined;
    const len = try serializer.serialize_value(L, -1, &buffer, buffer.len);

    std.debug.print("✓ Serialized simple table: {d} bytes\n", .{len});

    // Should be a table reference (type 0x07)
    if (buffer[0] != 0x07) {
        return error.WrongSerializationType;
    }

    std.debug.print("✓ Type is table_ref (0x07)\n", .{});

    lua.pop(L, 1);
}

fn test_nested_table() !void {
    std.debug.print("\n=== Test: Nested Table ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create nested table: {outer={inner={value=42}}}
    lua.newtable(L); // outer

    _ = lua.pushstring(L, "outer");
    lua.newtable(L); // inner table

    _ = lua.pushstring(L, "inner");
    lua.newtable(L); // innermost table

    _ = lua.pushstring(L, "value");
    lua.pushinteger(L, 42);
    lua.c.lua_rawset(L, -3);

    lua.c.lua_rawset(L, -3); // set outer.inner
    lua.c.lua_rawset(L, -3); // set table.outer

    // Serialize it
    var buffer: [1024]u8 = undefined;
    const len = try serializer.serialize_value(L, -1, &buffer, buffer.len);

    std.debug.print("✓ Serialized nested table: {d} bytes\n", .{len});

    if (buffer[0] != 0x07) {
        return error.WrongSerializationType;
    }

    std.debug.print("✓ Type is table_ref (0x07)\n", .{});

    lua.pop(L, 1);
}

fn test_empty_table() !void {
    std.debug.print("\n=== Test: Empty Table ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create empty table: {}
    lua.newtable(L);

    // Serialize it
    var buffer: [1024]u8 = undefined;
    const len = try serializer.serialize_value(L, -1, &buffer, buffer.len);

    std.debug.print("✓ Serialized empty table: {d} bytes\n", .{len});

    if (buffer[0] != 0x07) {
        return error.WrongSerializationType;
    }

    std.debug.print("✓ Type is table_ref (0x07)\n", .{});

    lua.pop(L, 1);
}

fn test_large_table() !void {
    std.debug.print("\n=== Test: Large Table (100 entries) ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create table with 100 entries
    lua.newtable(L);

    var i: i64 = 1;
    while (i <= 100) : (i += 1) {
        lua.pushinteger(L, i);
        lua.pushinteger(L, i * 10);
        lua.c.lua_rawset(L, -3);
    }

    // Serialize it
    var buffer: [8192]u8 = undefined;
    const len = try serializer.serialize_value(L, -1, &buffer, buffer.len);

    std.debug.print("✓ Serialized large table: {d} bytes\n", .{len});

    if (buffer[0] != 0x07) {
        return error.WrongSerializationType;
    }

    std.debug.print("✓ Type is table_ref (0x07)\n", .{});

    lua.pop(L, 1);
}

fn test_circular_reference() !void {
    std.debug.print("\n=== Test: Circular Reference Detection ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create table that references itself: t = {}; t.self = t
    const code =
        \\local t = {}
        \\t.self = t
        \\return t
    ;

    const load_result = lua.c.luaL_loadstring(L, code);
    if (load_result != 0) {
        std.debug.print("✗ Failed to load Lua code\n", .{});
        return error.LuaLoadFailed;
    }

    const call_result = lua.c.lua_pcallk(L, 0, 1, 0, 0, null);
    if (call_result != 0) {
        std.debug.print("✗ Failed to execute Lua code\n", .{});
        return error.LuaCallFailed;
    }

    // Try to serialize - should get CircularReference error
    var buffer: [1024]u8 = undefined;
    const result = serializer.serialize_value(L, -1, &buffer, buffer.len);

    if (result) |_| {
        std.debug.print("✗ Should have returned CircularReference error\n", .{});
        return error.ShouldHaveFailedWithCircularReference;
    } else |err| {
        if (err == error.CircularReference) {
            std.debug.print("✓ Correctly detected circular reference\n", .{});
        } else {
            std.debug.print("✗ Wrong error type: {}\n", .{err});
            return error.WrongErrorType;
        }
    }

    lua.pop(L, 1);
}

fn test_deep_nesting() !void {
    std.debug.print("\n=== Test: Deep Nesting (10 levels) ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create 10-level nested table
    const code =
        \\local t = {level=1}
        \\t.next = {level=2}
        \\t.next.next = {level=3}
        \\t.next.next.next = {level=4}
        \\t.next.next.next.next = {level=5}
        \\t.next.next.next.next.next = {level=6}
        \\t.next.next.next.next.next.next = {level=7}
        \\t.next.next.next.next.next.next.next = {level=8}
        \\t.next.next.next.next.next.next.next.next = {level=9}
        \\t.next.next.next.next.next.next.next.next.next = {level=10}
        \\return t
    ;

    const load_result = lua.c.luaL_loadstring(L, code);
    if (load_result != 0) {
        return error.LuaLoadFailed;
    }

    const call_result = lua.c.lua_pcallk(L, 0, 1, 0, 0, null);
    if (call_result != 0) {
        return error.LuaCallFailed;
    }

    // Serialize it
    var buffer: [4096]u8 = undefined;
    const len = try serializer.serialize_value(L, -1, &buffer, buffer.len);

    std.debug.print("✓ Serialized 10-level nested table: {d} bytes\n", .{len});

    if (buffer[0] != 0x07) {
        return error.WrongSerializationType;
    }

    std.debug.print("✓ Type is table_ref (0x07)\n", .{});

    lua.pop(L, 1);
}

fn test_max_depth_exceeded() !void {
    std.debug.print("\n=== Test: Max Depth Exceeded (> 32 levels) ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    // Create a table nested 35 levels deep
    var code_buffer: [4096]u8 = undefined;
    const code = std.fmt.bufPrint(&code_buffer,
        \\local t = {{level=1}}
        \\local current = t
        \\for i = 2, 35 do
        \\  current.next = {{level=i}}
        \\  current = current.next
        \\end
        \\return t
    , .{}) catch return error.BufferTooSmall;

    const load_result = lua.c.luaL_loadstring(L, code.ptr);
    if (load_result != 0) {
        return error.LuaLoadFailed;
    }

    const call_result = lua.c.lua_pcallk(L, 0, 1, 0, 0, null);
    if (call_result != 0) {
        return error.LuaCallFailed;
    }

    // Try to serialize - should get MaxDepthExceeded error
    var buffer: [8192]u8 = undefined;
    const result = serializer.serialize_value(L, -1, &buffer, buffer.len);

    if (result) |_| {
        std.debug.print("✗ Should have returned MaxDepthExceeded error\n", .{});
        return error.ShouldHaveFailedWithMaxDepth;
    } else |err| {
        if (err == error.MaxDepthExceeded) {
            std.debug.print("✓ Correctly detected max depth exceeded\n", .{});
        } else {
            std.debug.print("✗ Wrong error type: {}\n", .{err});
            return error.WrongErrorType;
        }
    }

    lua.pop(L, 1);
}

fn test_primitives() !void {
    std.debug.print("\n=== Test: Primitives (Backwards Compatibility) ===\n", .{});

    const L = try init_lua();
    defer lua.close(L);

    var buffer: [1024]u8 = undefined;

    // Test nil
    lua.pushnil(L);
    _ = try serializer.serialize_value(L, -1, &buffer, buffer.len);
    if (buffer[0] != 0x00) return error.WrongType;
    std.debug.print("✓ Nil serializes correctly\n", .{});
    lua.pop(L, 1);

    // Test boolean
    lua.pushboolean(L, 1);
    _ = try serializer.serialize_value(L, -1, &buffer, buffer.len);
    if (buffer[0] != 0x01) return error.WrongType;
    std.debug.print("✓ Boolean serializes correctly\n", .{});
    lua.pop(L, 1);

    // Test integer
    lua.pushinteger(L, 42);
    _ = try serializer.serialize_value(L, -1, &buffer, buffer.len);
    if (buffer[0] != 0x02) return error.WrongType;
    std.debug.print("✓ Integer serializes correctly\n", .{});
    lua.pop(L, 1);

    // Test string
    _ = lua.pushstring(L, "hello");
    _ = try serializer.serialize_value(L, -1, &buffer, buffer.len);
    if (buffer[0] != 0x04) return error.WrongType;
    std.debug.print("✓ String serializes correctly\n", .{});
    lua.pop(L, 1);
}

pub fn main() !void {
    std.debug.print("\n╔══════════════════════════════════════════════════╗\n", .{});
    std.debug.print("║  Table Serialization Test Suite                 ║\n", .{});
    std.debug.print("╚══════════════════════════════════════════════════╝\n", .{});

    var passed: u32 = 0;
    var failed: u32 = 0;

    // Test primitives (backwards compatibility)
    test_primitives() catch |err| {
        std.debug.print("\n✗ FAILED: Primitives - {}\n", .{err});
        failed += 1;
    };
    if (failed == 0) {
        std.debug.print("✓ PASSED: Primitives\n", .{});
        passed += 1;
    }

    // Test simple table
    test_simple_table() catch |err| {
        std.debug.print("\n✗ FAILED: Simple Table - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed) {
        std.debug.print("✓ PASSED: Simple Table\n", .{});
        passed += 1;
    }

    // Test nested table
    test_nested_table() catch |err| {
        std.debug.print("\n✗ FAILED: Nested Table - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 2) {
        std.debug.print("✓ PASSED: Nested Table\n", .{});
        passed += 1;
    }

    // Test empty table
    test_empty_table() catch |err| {
        std.debug.print("\n✗ FAILED: Empty Table - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 3) {
        std.debug.print("✓ PASSED: Empty Table\n", .{});
        passed += 1;
    }

    // Test large table
    test_large_table() catch |err| {
        std.debug.print("\n✗ FAILED: Large Table - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 4) {
        std.debug.print("✓ PASSED: Large Table\n", .{});
        passed += 1;
    }

    // Test deep nesting
    test_deep_nesting() catch |err| {
        std.debug.print("\n✗ FAILED: Deep Nesting - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 5) {
        std.debug.print("✓ PASSED: Deep Nesting\n", .{});
        passed += 1;
    }

    // Test circular reference detection
    test_circular_reference() catch |err| {
        std.debug.print("\n✗ FAILED: Circular Reference - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 6) {
        std.debug.print("✓ PASSED: Circular Reference\n", .{});
        passed += 1;
    }

    // Test max depth exceeded
    test_max_depth_exceeded() catch |err| {
        std.debug.print("\n✗ FAILED: Max Depth Exceeded - {}\n", .{err});
        failed += 1;
    };
    if (failed == passed - 7) {
        std.debug.print("✓ PASSED: Max Depth Exceeded\n", .{});
        passed += 1;
    }

    // Summary
    std.debug.print("\n╔══════════════════════════════════════════════════╗\n", .{});
    std.debug.print("║  Test Summary                                    ║\n", .{});
    std.debug.print("╠══════════════════════════════════════════════════╣\n", .{});
    std.debug.print("║  Passed: {d:2}/8                                    ║\n", .{passed});
    std.debug.print("║  Failed: {d:2}/8                                    ║\n", .{failed});
    std.debug.print("╚══════════════════════════════════════════════════╝\n", .{});

    if (failed > 0) {
        std.process.exit(1);
    }
}
