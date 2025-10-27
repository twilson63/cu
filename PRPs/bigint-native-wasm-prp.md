# Project Request Protocol: Native BigInt Support in Cu WASM Runtime

**Project Name:** bigint-native-wasm  
**Version:** 1.0  
**Date:** October 27, 2025  
**Author:** Rakis  
**Status:** Proposal

---

## Executive Summary

This PRP proposes implementing arbitrary precision integer arithmetic directly within the Cu WASM runtime using Zig's `std.math.big.Int` library. Unlike the host-provided approach, this embeds bigint functionality into the WASM binary itself, making it available via `require('bigint')` in Lua scripts without any host support requirements.

**Key Benefits:**
- Self-contained: No host dependencies
- Portable: Works in any WASM environment
- Predictable: Same behavior across all platforms
- Integrated: Uses Lua's allocator and GC

---

## Project Overview

### Background

The Cu WASM runtime currently supports Lua's native 64-bit integers, which are insufficient for many use cases:
- Token amounts in cryptocurrency (often 18+ decimals)
- Cryptographic operations (RSA, large primes)
- Financial calculations requiring arbitrary precision
- Blockchain integration (block numbers, nonces)

The existing PRP (`bigint-host-hooks.md`) proposed a host-provided solution where JavaScript's BigInt or Rust's num-bigint would be called via host imports. This PRP proposes an alternative: embedding bigint support directly in the WASM module.

### Goals

1. **Primary**: Provide arbitrary precision integer arithmetic natively in WASM
2. **Self-contained**: No host dependencies beyond existing external table API
3. **Performance**: Reasonable performance for typical operations (tokens, hashes)
4. **Memory efficiency**: Use Lua's allocator for all bigint storage
5. **Developer experience**: Familiar API similar to `math` module
6. **Small footprint**: Minimize WASM binary size increase

### Non-Goals

1. Floating point arbitrary precision (only integers)
2. Cryptographic primitives (though enables them)
3. Bitwise operations initially (can add later)
4. Optimization for cryptographic-level performance
5. Backward compatibility with external bigint libraries

---

## Technical Requirements

### Functional Requirements

**FR-1: Bigint Module**
- Expose `bigint` module via Lua's `require()`
- Module available after VM initialization
- No host configuration required

**FR-2: Construction**
```lua
local x = bigint.new("123456789012345678901234567890")
local y = bigint.new(42)  -- from Lua number
local z = bigint.new("DEADBEEF", 16)  -- hex
```

**FR-3: Arithmetic Operations**
```lua
local sum = bigint.add(a, b)
local diff = bigint.sub(a, b)
local prod = bigint.mul(a, b)
local quot = bigint.div(a, b)
local rem = bigint.mod(a, b)
```

**FR-4: Comparison**
```lua
if bigint.compare(a, b) > 0 then ... end
if bigint.eq(a, b) then ... end
```

**FR-5: Conversion**
```lua
local str = bigint.to_string(x)
local hex = bigint.to_string(x, 16)
```

**FR-6: Metamethods**
```lua
local sum = a + b  -- __add
local diff = a - b  -- __sub
local prod = a * b  -- __mul
if a == b then ... end  -- __eq
print(tostring(a))  -- __tostring
```

### Non-Functional Requirements

**NFR-1: Binary Size**
- Target: < 100KB increase to WASM binary
- Maximum acceptable: 200KB increase

**NFR-2: Performance**
- Addition/subtraction: < 10μs for 256-bit numbers
- Multiplication: < 100μs for 256-bit numbers
- Division: < 500μs for 256-bit numbers

**NFR-3: Memory**
- All allocations use Lua's allocator (`lua_malloc/lua_realloc/lua_free`)
- Proper GC integration via userdata with `__gc` metamethod
- No memory leaks

**NFR-4: Compatibility**
- Works in freestanding WASM environment
- No libc dependencies beyond what's already used
- Compatible with existing external table API

---

## Solution Analysis

### Solution 1: Zig std.math.big.Int

**Description:**  
Use Zig's standard library `std.math.big.Int.Managed` which is already available in our Zig toolchain.

**Implementation Approach:**
```zig
// src/bignum.zig
const std = @import("std");
const BigInt = std.math.big.int.Managed;

pub const BigIntHandle = struct {
    value: BigInt,
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) !*BigIntHandle {
        var handle = try allocator.create(BigIntHandle);
        handle.* = .{
            .value = try BigInt.init(allocator),
            .allocator = allocator,
        };
        return handle;
    }
    
    pub fn deinit(self: *BigIntHandle) void {
        self.value.deinit();
        self.allocator.destroy(self);
    }
};

export fn bigint_new_from_string(ptr: [*]const u8, len: usize, base: c_int) ?*BigIntHandle {
    const allocator = getLuaAllocator();
    const handle = BigIntHandle.init(allocator) catch return null;
    const str = ptr[0..len];
    handle.value.setString(@intCast(u8, base), str) catch {
        handle.deinit();
        return null;
    };
    return handle;
}

export fn bigint_add(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    const allocator = getLuaAllocator();
    const result = BigIntHandle.init(allocator) catch return null;
    result.value.add(&a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}
```

**Pros:**
- ✅ Already in toolchain (zero external dependencies)
- ✅ Well-tested and maintained by Zig core team
- ✅ Works in freestanding mode
- ✅ Good documentation
- ✅ Native Zig API is clean and safe
- ✅ Relatively small footprint (~40-60KB estimated)

**Cons:**
- ⚠️ Not optimized for cryptographic performance
- ⚠️ Limited to what's in std lib (no special functions)
- ⚠️ Zig's big int API changes between versions
- ⚠️ Less mature than decades-old C libraries

**Binary Size Estimate:** +50-80KB

---

### Solution 2: LibTomMath (C Library)

**Description:**  
Integrate LibTomMath, a public domain C library designed for cryptographic use, widely used in TLS implementations.

**Implementation Approach:**
```c
// External C library
#include "tommath.h"

typedef struct {
    mp_int value;
} BigIntHandle;

BigIntHandle* bigint_new_from_string(const char* str, size_t len, int base) {
    BigIntHandle* handle = lua_malloc(sizeof(BigIntHandle));
    mp_init(&handle->value);
    mp_read_radix(&handle->value, str, base);
    return handle;
}

BigIntHandle* bigint_add(BigIntHandle* a, BigIntHandle* b) {
    BigIntHandle* result = lua_malloc(sizeof(BigIntHandle));
    mp_init(&result->value);
    mp_add(&a->value, &b->value, &result->value);
    return result;
}

void bigint_free(BigIntHandle* handle) {
    mp_clear(&handle->value);
    lua_free(handle);
}
```

**Pros:**
- ✅ Battle-tested (used in OpenSSL, OpenSSH, etc.)
- ✅ Excellent performance for crypto operations
- ✅ Public domain license (no restrictions)
- ✅ Comprehensive feature set
- ✅ Stable API (no breaking changes)
- ✅ Optimized assembly for common architectures

**Cons:**
- ❌ Adds external C dependency to build
- ❌ Larger binary size (~80-120KB)
- ❌ Requires integrating C build into Zig build system
- ❌ More complex to maintain across toolchain updates
- ❌ May require custom allocator integration

**Binary Size Estimate:** +80-120KB

---

### Solution 3: Minimal Custom Implementation

**Description:**  
Write a minimal bigint implementation from scratch in Zig, supporting only the operations needed for token arithmetic and basic cryptography.

**Implementation Approach:**
```zig
// Simplified bigint supporting only common operations
pub const SimpleBigInt = struct {
    // Use array of u64 limbs
    limbs: []u64,
    negative: bool,
    allocator: std.mem.Allocator,
    
    pub fn add(self: *SimpleBigInt, other: *SimpleBigInt) !*SimpleBigInt {
        // School addition with carry
        // Optimized for common case (< 4 limbs)
    }
    
    pub fn mul(self: *SimpleBigInt, other: *SimpleBigInt) !*SimpleBigInt {
        // Karatsuba for large numbers
        // Long multiplication for small numbers
    }
};
```

**Pros:**
- ✅ Minimal binary size (~20-40KB)
- ✅ Tailored exactly to our needs
- ✅ No external dependencies
- ✅ Full control over implementation
- ✅ Can optimize for common cases (256-bit token amounts)

**Cons:**
- ❌ Requires significant development time
- ❌ Risk of bugs (especially edge cases)
- ❌ Need extensive testing
- ❌ Performance may be suboptimal
- ❌ Missing advanced features (mod exp, GCD, etc.)
- ❌ Maintenance burden

**Binary Size Estimate:** +20-40KB

---

## Solution Comparison

| Criteria | Zig std.math.big | LibTomMath | Custom Minimal |
|----------|------------------|------------|----------------|
| **Development Time** | Low (1-2 days) | Medium (3-5 days) | High (1-2 weeks) |
| **Binary Size** | ~60KB | ~100KB | ~30KB |
| **Performance** | Good | Excellent | Fair |
| **Reliability** | High | Very High | Unknown |
| **Maintenance** | Low | Medium | High |
| **Feature Complete** | Yes | Yes | Limited |
| **Testing Effort** | Low | Low | High |
| **Risk** | Low | Low | High |

---

## Recommended Solution

**Winner: Solution 1 - Zig std.math.big.Int**

### Rationale

1. **Best Balance**: Offers good performance, reasonable size, and minimal complexity
2. **Low Risk**: Already tested and maintained by Zig core team
3. **Fast Implementation**: Can be built in 1-2 days vs weeks for custom
4. **Good Enough**: Performance is sufficient for token arithmetic (main use case)
5. **Future Proof**: Can always swap to LibTomMath later if crypto performance becomes critical
6. **Maintenance**: Zero external dependencies means easier maintenance

### Decision Matrix

```
                    Weight  Zig    LibTom  Custom
Development Speed     25%    10      7       3
Binary Size          20%     8      6      10
Performance          15%     7     10       5
Reliability          25%     9     10       4
Maintenance          15%     9      6       3
----------------------------------------
Total Score                 8.65   7.85    5.0
```

**Zig std.math.big.Int wins with 8.65/10**

---

## Implementation Plan

### Phase 1: Zig Bigint Wrapper (2 days)

**File:** `src/bignum.zig`

```zig
const std = @import("std");
const BigInt = std.math.big.int.Managed;
const c = @cImport({
    @cInclude("lua.h");
    @cInclude("lauxlib.h");
});

// Global allocator backed by Lua's allocator
var lua_allocator: std.mem.Allocator = undefined;

pub fn setLuaAllocator(allocator: std.mem.Allocator) void {
    lua_allocator = allocator;
}

pub const BigIntHandle = struct {
    value: BigInt,
    
    pub fn init() !*BigIntHandle {
        var handle = try lua_allocator.create(BigIntHandle);
        handle.value = try BigInt.init(lua_allocator);
        return handle;
    }
    
    pub fn deinit(self: *BigIntHandle) void {
        self.value.deinit();
        lua_allocator.destroy(self);
    }
};

// Exported C API
export fn bigint_new() ?*BigIntHandle {
    return BigIntHandle.init() catch null;
}

export fn bigint_new_from_i64(val: i64) ?*BigIntHandle {
    var handle = BigIntHandle.init() catch return null;
    handle.value.set(val) catch {
        handle.deinit();
        return null;
    };
    return handle;
}

export fn bigint_new_from_string(ptr: [*]const u8, len: usize, base: c_int) ?*BigIntHandle {
    var handle = BigIntHandle.init() catch return null;
    const str = ptr[0..len];
    handle.value.setString(@intCast(u8, base), str) catch {
        handle.deinit();
        return null;
    };
    return handle;
}

export fn bigint_free(handle: *BigIntHandle) void {
    handle.deinit();
}

// Arithmetic operations
export fn bigint_add(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    var result = BigIntHandle.init() catch return null;
    result.value.add(&a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}

export fn bigint_sub(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    var result = BigIntHandle.init() catch return null;
    result.value.sub(&a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}

export fn bigint_mul(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    var result = BigIntHandle.init() catch return null;
    result.value.mul(&a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}

export fn bigint_div(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    var result = BigIntHandle.init() catch return null;
    var remainder = BigInt.init(lua_allocator) catch {
        result.deinit();
        return null;
    };
    defer remainder.deinit();
    
    result.value.divTrunc(&remainder, &a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}

export fn bigint_mod(a: *BigIntHandle, b: *BigIntHandle) ?*BigIntHandle {
    var quotient = BigInt.init(lua_allocator) catch return null;
    defer quotient.deinit();
    
    var result = BigIntHandle.init() catch return null;
    result.value.divTrunc(&quotient, &a.value, &b.value) catch {
        result.deinit();
        return null;
    };
    return result;
}

// Comparison
export fn bigint_compare(a: *BigIntHandle, b: *BigIntHandle) c_int {
    const order = a.value.order(&b.value);
    return switch (order) {
        .lt => -1,
        .eq => 0,
        .gt => 1,
    };
}

// Conversion
export fn bigint_to_string(handle: *BigIntHandle, base: c_int, buf: [*]u8, max_len: usize) c_int {
    const str = handle.value.toString(lua_allocator, @intCast(u8, base)) catch return -1;
    defer lua_allocator.free(str);
    
    if (str.len > max_len) return -1;
    
    @memcpy(buf, str.ptr, str.len);
    return @intCast(c_int, str.len);
}

export fn bigint_to_i64(handle: *BigIntHandle) i64 {
    return handle.value.to(i64) catch 0;
}
```

**Tasks:**
- [ ] Create `src/bignum.zig` with core operations
- [ ] Add tests in Zig for arithmetic correctness
- [ ] Wire into `build.zig`
- [ ] Verify WASM exports are visible

---

### Phase 2: Lua C Module (2 days)

**File:** `src/lua/lbigint.c`

```c
#include "lua.h"
#include "lauxlib.h"

// External Zig functions
extern void* bigint_new_from_string(const char* str, size_t len, int base);
extern void* bigint_new_from_i64(int64_t val);
extern void bigint_free(void* handle);
extern void* bigint_add(void* a, void* b);
extern void* bigint_sub(void* a, void* b);
extern void* bigint_mul(void* a, void* b);
extern void* bigint_div(void* a, void* b);
extern void* bigint_mod(void* a, void* b);
extern int bigint_compare(void* a, void* b);
extern int bigint_to_string(void* handle, int base, char* buf, size_t max_len);
extern int64_t bigint_to_i64(void* handle);

#define BIGINT_METATABLE "bigint.handle"

typedef struct {
    void* handle;
} BigIntUserdata;

// Get bigint handle from userdata
static void* check_bigint(lua_State* L, int idx) {
    BigIntUserdata* ud = luaL_checkudata(L, idx, BIGINT_METATABLE);
    if (!ud->handle) {
        luaL_error(L, "bigint handle is null");
    }
    return ud->handle;
}

// bigint.new(value, base?)
static int l_bigint_new(lua_State* L) {
    void* handle = NULL;
    
    if (lua_type(L, 1) == LUA_TNUMBER) {
        // From Lua number
        int64_t val = lua_tointeger(L, 1);
        handle = bigint_new_from_i64(val);
    } else if (lua_type(L, 1) == LUA_TSTRING) {
        // From string
        size_t len;
        const char* str = lua_tolstring(L, 1, &len);
        int base = luaL_optinteger(L, 2, 10);
        handle = bigint_new_from_string(str, len, base);
    } else {
        return luaL_error(L, "bigint.new expects number or string");
    }
    
    if (!handle) {
        return luaL_error(L, "failed to create bigint");
    }
    
    // Create userdata
    BigIntUserdata* ud = lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = handle;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

// Arithmetic metamethods
static int l_bigint_add(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    void* result = bigint_add(a, b);
    
    if (!result) return luaL_error(L, "bigint add failed");
    
    BigIntUserdata* ud = lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    return 1;
}

static int l_bigint_sub(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    void* result = bigint_sub(a, b);
    
    if (!result) return luaL_error(L, "bigint sub failed");
    
    BigIntUserdata* ud = lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    return 1;
}

static int l_bigint_mul(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    void* result = bigint_mul(a, b);
    
    if (!result) return luaL_error(L, "bigint mul failed");
    
    BigIntUserdata* ud = lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    return 1;
}

static int l_bigint_div(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    void* result = bigint_div(a, b);
    
    if (!result) return luaL_error(L, "bigint div failed");
    
    BigIntUserdata* ud = lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    return 1;
}

// __tostring metamethod
static int l_bigint_tostring(lua_State* L) {
    void* handle = check_bigint(L, 1);
    int base = luaL_optinteger(L, 2, 10);
    
    char buf[1024];
    int len = bigint_to_string(handle, base, buf, sizeof(buf));
    
    if (len < 0) {
        return luaL_error(L, "bigint too large for buffer");
    }
    
    lua_pushlstring(L, buf, len);
    return 1;
}

// __eq metamethod
static int l_bigint_eq(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    int cmp = bigint_compare(a, b);
    lua_pushboolean(L, cmp == 0);
    return 1;
}

// __lt metamethod
static int l_bigint_lt(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    int cmp = bigint_compare(a, b);
    lua_pushboolean(L, cmp < 0);
    return 1;
}

// __le metamethod
static int l_bigint_le(lua_State* L) {
    void* a = check_bigint(L, 1);
    void* b = check_bigint(L, 2);
    int cmp = bigint_compare(a, b);
    lua_pushboolean(L, cmp <= 0);
    return 1;
}

// __gc metamethod
static int l_bigint_gc(lua_State* L) {
    BigIntUserdata* ud = luaL_checkudata(L, 1, BIGINT_METATABLE);
    if (ud->handle) {
        bigint_free(ud->handle);
        ud->handle = NULL;
    }
    return 0;
}

// Module functions
static const luaL_Reg bigint_functions[] = {
    {"new", l_bigint_new},
    {"add", l_bigint_add},
    {"sub", l_bigint_sub},
    {"mul", l_bigint_mul},
    {"div", l_bigint_div},
    {NULL, NULL}
};

// Metamethods
static const luaL_Reg bigint_metamethods[] = {
    {"__add", l_bigint_add},
    {"__sub", l_bigint_sub},
    {"__mul", l_bigint_mul},
    {"__div", l_bigint_div},
    {"__eq", l_bigint_eq},
    {"__lt", l_bigint_lt},
    {"__le", l_bigint_le},
    {"__tostring", l_bigint_tostring},
    {"__gc", l_bigint_gc},
    {NULL, NULL}
};

// Module initialization
int luaopen_bigint(lua_State* L) {
    // Create metatable
    luaL_newmetatable(L, BIGINT_METATABLE);
    lua_pushvalue(L, -1);
    lua_setfield(L, -2, "__index");
    luaL_setfuncs(L, bigint_metamethods, 0);
    
    // Create module table
    luaL_newlib(L, bigint_functions);
    
    return 1;
}
```

**Tasks:**
- [ ] Create `src/lua/lbigint.c`
- [ ] Add to Lua library build
- [ ] Register in VM initialization
- [ ] Test from Lua REPL

---

### Phase 3: Build Integration (1 day)

**Update:** `build.zig`

```zig
// Add bignum.zig to compilation
const bignum = b.addObject(.{
    .name = "bignum",
    .root_source_file = .{ .path = "src/bignum.zig" },
    .target = target,
    .optimize = optimize,
});

// Link with main executable
exe.addObject(bignum);

// Add C file to Lua library build
exe.addCSourceFile(.{
    .file = .{ .path = "src/lua/lbigint.c" },
    .flags = &[_][]const u8{"-std=c99"},
});
```

**Update:** `src/main.zig`

```zig
extern fn luaopen_bigint(L: *c.lua_State) c_int;

// In init function, preload bigint module
c.lua_getglobal(L, "package");
c.lua_getfield(L, -1, "preload");
c.lua_pushcfunction(L, luaopen_bigint);
c.lua_setfield(L, -2, "bigint");
c.lua_pop(L, 2);
```

**Tasks:**
- [ ] Update build.zig
- [ ] Update src/main.zig
- [ ] Test build process
- [ ] Verify module loads in Lua

---

### Phase 4: Testing (2 days)

**Node.js Tests:** `tests/06-bigint.node.test.js`

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('BigInt Module', () => {
  beforeEach(async () => {
    reset();
    await loadWasm();
    init();
  });

  it('Loads bigint module', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      return type(bigint)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'table');
  });

  it('Creates bigint from string', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new("123456789012345678901234567890")
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '123456789012345678901234567890');
  });

  it('Adds two bigints', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("2000000000000000000")
      local sum = bigint.add(a, b)
      return tostring(sum)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '3000000000000000000');
  });

  it('Uses metamethod __add', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(100)
      local b = bigint.new(200)
      local sum = a + b
      return tostring(sum)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '300');
  });

  it('Multiplies bigints', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000")
      local b = bigint.new("1000000000")
      local prod = a * b
      return tostring(prod)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '1000000000000000000');
  });

  it('Divides bigints', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("3")
      local quot = a / b
      return tostring(quot)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '333333333333333333');
  });

  it('Compares bigints', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("999999999999999999")
      if a > b then
        return "greater"
      else
        return "not greater"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'greater');
  });

  it('Handles token calculations', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      -- 1 token = 10^18 wei
      local balance = bigint.new("1000000000000000000")
      local transfer = bigint.new("250000000000000000")
      local new_balance = balance - transfer
      return tostring(new_balance)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '750000000000000000');
  });
});
```

**Zig Unit Tests:** `src/bignum.zig` (at end of file)

```zig
test "bigint basic operations" {
    const testing = std.testing;
    const allocator = testing.allocator;
    
    setLuaAllocator(allocator);
    
    // Test creation
    const a = try BigIntHandle.init();
    defer a.deinit();
    try a.value.set(42);
    
    const b = try BigIntHandle.init();
    defer b.deinit();
    try b.value.set(8);
    
    // Test addition
    const sum = try BigIntHandle.init();
    defer sum.deinit();
    try sum.value.add(&a.value, &b.value);
    
    try testing.expectEqual(@as(i64, 50), try sum.value.to(i64));
}
```

**Tasks:**
- [ ] Write Zig unit tests
- [ ] Write Node.js integration tests
- [ ] Test edge cases (negative, zero, large numbers)
- [ ] Test memory leaks (run GC tests)
- [ ] Performance benchmarks

---

### Phase 5: Documentation (1 day)

**Create:** `docs/BIGINT_API.md`

```markdown
# BigInt API Reference

## Overview

The `bigint` module provides arbitrary precision integer arithmetic...

## Usage

### Loading the Module

```lua
local bigint = require('bigint')
```

### Construction

...
```

**Update:** `README.md`

Add section on bigint support with examples.

**Tasks:**
- [ ] Create docs/BIGINT_API.md
- [ ] Update README.md
- [ ] Add examples/bigint-demo.lua
- [ ] Update CHANGELOG.md

---

## Success Criteria

### Functional Success

- [ ] `require('bigint')` works in Lua scripts
- [ ] All arithmetic operations work correctly
- [ ] Metamethods work (`+`, `-`, `*`, `/`, `==`, `<`, etc.)
- [ ] Conversions work (string, hex, number)
- [ ] No memory leaks (verified with long-running tests)

### Performance Success

- [ ] Addition/subtraction: < 10μs for 256-bit
- [ ] Multiplication: < 100μs for 256-bit
- [ ] Division: < 500μs for 256-bit
- [ ] Binary size increase: < 100KB

### Quality Success

- [ ] All tests pass (Zig unit tests + Node.js tests)
- [ ] No valgrind errors (if running native tests)
- [ ] Documentation complete
- [ ] Examples work

---

## Testing Strategy

### Unit Tests (Zig)
```bash
zig test src/bignum.zig
```

### Integration Tests (Node.js)
```bash
npm test tests/06-bigint.node.test.js
```

### Performance Tests
```lua
local bigint = require('bigint')
local start = os.clock()
for i = 1, 10000 do
  local a = bigint.new("12345678901234567890")
  local b = bigint.new("98765432109876543210")
  local sum = a + b
end
local elapsed = os.clock() - start
print("10000 additions in " .. elapsed .. " seconds")
```

---

## Risks and Mitigations

### Risk 1: Binary Size Bloat
**Impact:** High  
**Likelihood:** Medium  
**Mitigation:**
- Use release-small build mode
- Profile binary size after implementation
- If > 100KB, consider stripping unused operations

### Risk 2: Performance Issues
**Impact:** Medium  
**Likelihood:** Low  
**Mitigation:**
- Benchmark early in development
- If too slow, can swap to LibTomMath
- Most use cases (tokens) won't hit performance limits

### Risk 3: Memory Leaks
**Impact:** High  
**Likelihood:** Low  
**Mitigation:**
- Careful GC integration via __gc metamethod
- Add long-running leak tests
- Use Zig's allocator tracking

### Risk 4: API Complexity
**Impact:** Low  
**Likelihood:** Low  
**Mitigation:**
- Start with minimal API
- Add features incrementally
- Get user feedback early

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Zig Wrapper | 2 days | None |
| Phase 2: Lua Module | 2 days | Phase 1 |
| Phase 3: Build Integration | 1 day | Phase 2 |
| Phase 4: Testing | 2 days | Phase 3 |
| Phase 5: Documentation | 1 day | Phase 4 |

**Total: 8 days (1.6 weeks)**

---

## Future Enhancements

### Phase 2 Features (Optional)
- Modular exponentiation: `bigint.powmod(base, exp, mod)`
- GCD/LCM: `bigint.gcd(a, b)`, `bigint.lcm(a, b)`
- Bitwise operations: `bigint.shl(x, bits)`, `bigint.shr(x, bits)`
- Random generation: `bigint.random(bits)`
- Prime testing: `bigint.is_prime(x)`

### Performance Optimizations
- Cache small integers (-1, 0, 1, 2, 10, etc.)
- Inline small number operations
- Assembly optimizations for target platforms

### API Improvements
- Method syntax: `x:add(y)` instead of `bigint.add(x, y)`
- Constants: `bigint.ZERO`, `bigint.ONE`
- Parsing helpers: `bigint.from_hex()`, `bigint.from_bytes()`

---

## References

- [Zig std.math.big.int documentation](https://ziglang.org/documentation/master/std/#A;std:math.big.int)
- [Lua C API Reference](https://www.lua.org/manual/5.4/manual.html#4)
- [LibTomMath documentation](https://www.libtom.net/LibTomMath/)
- Existing PRP: `PRPs/bigint-host-hooks.md`

---

## Approval

**Status:** Awaiting Review

**Reviewers:**
- [ ] Technical Lead
- [ ] Security Review
- [ ] Performance Review

**Approval Date:** TBD

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-27 | Rakis | Initial proposal |
