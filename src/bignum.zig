//! BigInt wrapper module for Cu runtime
//! Provides arbitrary-precision integer arithmetic using Zig's std.math.big.Int
//! All functions are exported as C-compatible symbols for WASM/FFI usage

const std = @import("std");
const math = std.math;
const Allocator = std.mem.Allocator;

/// Global allocator instance - must be set via bigint_set_allocator before use
var lua_allocator: Allocator = undefined;
var allocator_initialized: bool = false;

/// Sets the global allocator for all bigint operations
/// MUST be called during Lua initialization before any bigint operations
/// @param allocator The allocator to use (typically Lua's allocator)
export fn bigint_set_allocator(allocator: *anyopaque) void {
    lua_allocator = @as(*Allocator, @ptrCast(@alignCast(allocator))).*;
    allocator_initialized = true;
}

/// Opaque handle to a BigInt instance
/// Wraps std.math.big.Int.Managed with proper memory management
pub const BigIntHandle = struct {
    bigint: math.big.int.Managed,

    /// Initialize a new BigIntHandle with the given allocator
    pub fn init(allocator: Allocator) !*BigIntHandle {
        const handle = try allocator.create(BigIntHandle);
        handle.* = BigIntHandle{
            .bigint = try math.big.int.Managed.init(allocator),
        };
        return handle;
    }

    /// Initialize a new BigIntHandle from an i64 value
    pub fn initFromI64(allocator: Allocator, value: i64) !*BigIntHandle {
        const handle = try allocator.create(BigIntHandle);
        handle.* = BigIntHandle{
            .bigint = try math.big.int.Managed.initSet(allocator, value),
        };
        return handle;
    }

    /// Initialize a new BigIntHandle from a string (base 10)
    pub fn initFromString(allocator: Allocator, str: []const u8, base: u8) !*BigIntHandle {
        const handle = try allocator.create(BigIntHandle);
        handle.* = BigIntHandle{
            .bigint = try math.big.int.Managed.init(allocator),
        };

        try handle.bigint.setString(base, str);
        return handle;
    }

    /// Free all resources associated with this BigIntHandle
    pub fn deinit(self: *BigIntHandle, allocator: Allocator) void {
        self.bigint.deinit();
        allocator.destroy(self);
    }
};

// ============================================================================
// Creation and Destruction
// ============================================================================

/// Create a new BigInt initialized to 0
/// @return Handle to the new BigInt, or null on allocation failure
export fn bigint_new() ?*BigIntHandle {
    if (!allocator_initialized) return null;
    return BigIntHandle.init(lua_allocator) catch null;
}

/// Create a new BigInt from a 64-bit signed integer
/// @param value The initial value
/// @return Handle to the new BigInt, or null on allocation failure
export fn bigint_new_from_i64(value: i64) ?*BigIntHandle {
    if (!allocator_initialized) return null;
    return BigIntHandle.initFromI64(lua_allocator, value) catch null;
}

/// Create a new BigInt from a string with specified base
/// @param str Pointer to string bytes
/// @param len Length of string
/// @param base Number base (2-36)
/// @return Handle to the new BigInt, or null on allocation/parse failure
export fn bigint_new_from_string(str: [*]const u8, len: usize, base: c_int) ?*BigIntHandle {
    if (!allocator_initialized) return null;
    if (base < 2 or base > 36) return null;

    const slice = str[0..len];
    return BigIntHandle.initFromString(lua_allocator, slice, @intCast(base)) catch null;
}

/// Free a BigInt and all its resources
/// @param handle The BigInt handle to free (must not be null)
export fn bigint_free(handle: *BigIntHandle) void {
    handle.deinit(lua_allocator);
}

// ============================================================================
// Arithmetic Operations
// ============================================================================

/// Add two BigInts: returns new BigInt = a + b
/// @param a First operand
/// @param b Second operand
/// @return New BigInt handle, or null on failure
export fn bigint_add(a: *const BigIntHandle, b: *const BigIntHandle) ?*BigIntHandle {
    if (!allocator_initialized) return null;
    const result = BigIntHandle.init(lua_allocator) catch return null;
    result.bigint.add(&a.bigint, &b.bigint) catch {
        result.deinit(lua_allocator);
        return null;
    };
    return result;
}

/// Subtract two BigInts: returns new BigInt = a - b
/// @param a First operand (minuend)
/// @param b Second operand (subtrahend)
/// @return New BigInt handle, or null on failure
export fn bigint_sub(a: *const BigIntHandle, b: *const BigIntHandle) ?*BigIntHandle {
    if (!allocator_initialized) return null;
    const result = BigIntHandle.init(lua_allocator) catch return null;
    result.bigint.sub(&a.bigint, &b.bigint) catch {
        result.deinit(lua_allocator);
        return null;
    };
    return result;
}

/// Multiply two BigInts: returns new BigInt = a * b
/// @param a First operand
/// @param b Second operand
/// @return New BigInt handle, or null on failure
export fn bigint_mul(a: *const BigIntHandle, b: *const BigIntHandle) ?*BigIntHandle {
    if (!allocator_initialized) return null;
    const result = BigIntHandle.init(lua_allocator) catch return null;
    result.bigint.mul(&a.bigint, &b.bigint) catch {
        result.deinit(lua_allocator);
        return null;
    };
    return result;
}

/// Divide two BigInts (truncating division): returns new BigInt = a / b
/// @param a Dividend
/// @param b Divisor (must not be zero)
/// @return New BigInt handle, or null on failure (division by zero or allocation error)
export fn bigint_div(a: *const BigIntHandle, b: *const BigIntHandle) ?*BigIntHandle {
    if (!allocator_initialized) return null;

    // Check for division by zero
    if (b.bigint.toConst().eqlZero()) return null;

    const result = BigIntHandle.init(lua_allocator) catch return null;
    var remainder = math.big.int.Managed.init(lua_allocator) catch {
        result.deinit(lua_allocator);
        return null;
    };
    defer remainder.deinit();

    result.bigint.divTrunc(&remainder, &a.bigint, &b.bigint) catch {
        result.deinit(lua_allocator);
        return null;
    };
    return result;
}

/// Modulo operation: returns new BigInt = a % b
/// @param a Dividend
/// @param b Divisor (must not be zero)
/// @return New BigInt handle, or null on failure (division by zero or allocation error)
export fn bigint_mod(a: *const BigIntHandle, b: *const BigIntHandle) ?*BigIntHandle {
    if (!allocator_initialized) return null;

    // Check for division by zero
    if (b.bigint.toConst().eqlZero()) return null;

    var quotient = math.big.int.Managed.init(lua_allocator) catch return null;
    defer quotient.deinit();

    const result = BigIntHandle.init(lua_allocator) catch return null;
    quotient.divTrunc(&result.bigint, &a.bigint, &b.bigint) catch {
        result.deinit(lua_allocator);
        return null;
    };
    return result;
}

// ============================================================================
// Comparison
// ============================================================================

/// Compare two BigInts
/// @param a First operand
/// @param b Second operand
/// @return -1 if a < b, 0 if a == b, 1 if a > b
export fn bigint_compare(a: *const BigIntHandle, b: *const BigIntHandle) c_int {
    const order = a.bigint.toConst().order(b.bigint.toConst());
    return switch (order) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    };
}

// ============================================================================
// Conversion
// ============================================================================

/// Convert BigInt to a string in specified base
/// @param handle The BigInt to convert
/// @param base Number base (2-36)
/// @param buf Output buffer
/// @param max_len Maximum buffer length
/// @return Length written, or -1 on failure
export fn bigint_to_string(handle: *const BigIntHandle, base: c_int, buf: [*]u8, max_len: usize) c_int {
    if (!allocator_initialized) return -1;
    if (base < 2 or base > 36) return -1;

    const str = handle.bigint.toConst().toStringAlloc(lua_allocator, @intCast(base), .lower) catch return -1;
    defer lua_allocator.free(str);

    if (str.len > max_len) return -1;

    @memcpy(buf[0..str.len], str);
    return @intCast(str.len);
}

/// Convert BigInt to i64
/// @param handle The BigInt to convert
/// @return The i64 value, or 0 if doesn't fit
export fn bigint_to_i64(handle: *const BigIntHandle) i64 {
    return handle.bigint.toConst().toInt(i64) catch 0;
}

// ============================================================================
// Unit Tests
// ============================================================================

test "bigint basic creation" {
    const testing = std.testing;
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const handle = try BigIntHandle.init(allocator);
    defer handle.deinit(allocator);
    try testing.expect(handle.bigint.toConst().eqlZero());
}

test "bigint from i64" {
    const testing = std.testing;
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const handle = try BigIntHandle.initFromI64(allocator, 42);
    defer handle.deinit(allocator);
    try testing.expectEqual(@as(i64, 42), try handle.bigint.toConst().to(i64));
}

test "bigint arithmetic" {
    const testing = std.testing;
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const a = try BigIntHandle.initFromI64(allocator, 100);
    defer a.deinit(allocator);
    const b = try BigIntHandle.initFromI64(allocator, 42);
    defer b.deinit(allocator);
    const result = try BigIntHandle.init(allocator);
    defer result.deinit(allocator);

    try result.bigint.add(&a.bigint.toConst(), &b.bigint.toConst());
    try testing.expectEqual(@as(i64, 142), try result.bigint.toConst().to(i64));
}
