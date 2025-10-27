# API Naming Clarification: compute() vs eval()

## Issue Summary

There is an inconsistency in the codebase between the actual exported API function name and what is used in tests and some documentation.

## Current State

### Actual API (Correct)

The exported JavaScript API in `web/cu-api.js` uses:

```javascript
export async function compute(code) {
    // Implementation...
}
```

**This is the correct public API function.**

### Test Usage (Incorrect/Using Test Wrapper)

Tests in `tests/integration.test.js` and `tests/enhanced/enhanced-api.test.js` use:

```javascript
const result = lua.eval('return 42');
```

This appears to be using a test harness wrapper that provides `eval()` as an alias or wrapper around `compute()`.

### Documentation Status

Some documentation files reference `lua.eval()` instead of the correct `lua.compute()`:

- ❌ `docs/README_LUA.md` - Uses `eval()`
- ❌ `docs/PERFORMANCE_GUIDE.md` - Uses `eval()`
- ❌ `docs/TROUBLESHOOTING.md` - Uses `eval()`
- ❌ `docs/ARCHITECTURE.md` - Uses `eval()`
- ✅ `docs/API_REFERENCE.md` - Uses `compute()` (correct)
- ✅ `docs/SECURE_RELAY_ARCHITECTURE.md` - Uses `compute()` (correct)

## Correct API Usage

All production code should use:

```javascript
import lua from './cu-api.js';

// Initialize
await lua.loadLuaWasm();
lua.init();

// Execute Lua code - CORRECT
const resultBytes = await lua.compute('return 1 + 1');

// Read result
const result = lua.readResult(lua.getBufferPtr(), resultBytes);
console.log(result.value);  // 2
```

## Why compute() Not eval()?

The function is named `compute()` rather than `eval()` to:

1. **Avoid JavaScript eval() confusion**: `eval()` in JavaScript has security implications and different semantics
2. **Better describe functionality**: The function computes results from Lua code in a sandboxed WASM environment
3. **Align with WASM exports**: The underlying WASM export is also named `compute`

## Implementation Details

### WASM Export

```zig
// src/main.zig
export fn compute(input_len: usize) c_int {
    // Implementation...
}
```

### JavaScript API

```javascript
// web/cu-api.js
export async function compute(code) {
  // ...
  if (wasmInstance && wasmInstance.exports.compute) {
    // Call WASM compute function
    const result = wasmInstance.exports.compute(bufPtr, codeBytes.length);
    return result;
  }
  // ...
}
```

### Default Export

```javascript
export default {
  loadLuaWasm,
  init,
  compute,  // ← Correct function name
  getBufferPtr,
  getBufferSize,
  getMemoryStats,
  runGc,
  readBuffer,
  readResult,
  writeBuffer,
  saveState,
  loadState,
  clearPersistedState,
  getTableInfo,
  getMemoryTableId,
  setMemoryAliasEnabled
};
```

## Test Harness Behavior

The test files appear to use a custom test setup that provides `lua.eval()`. Looking at the test imports, they likely have a wrapper:

```javascript
// Likely in test setup (not in public API)
const lua = {
  eval: async (code) => {
    const bytes = await luaApi.compute(code);
    return luaApi.readResult(luaApi.getBufferPtr(), bytes).value;
  },
  // ... other helpers
};
```

This is acceptable for tests but should not be used in production code or documentation.

## Recommended Actions

### For Documentation

Update the following files to use `compute()`:

1. `docs/README_LUA.md`
2. `docs/PERFORMANCE_GUIDE.md`
3. `docs/TROUBLESHOOTING.md`
4. `docs/ARCHITECTURE.md`

### For Tests

Consider adding a comment in test files explaining the wrapper:

```javascript
// Test helper: wraps compute() and automatically reads result
// Production code should use lua.compute() directly
const lua = {
  eval: async (code) => {
    const bytes = await luaApi.compute(code);
    return luaApi.readResult(luaApi.getBufferPtr(), bytes).value;
  }
};
```

### For New Code

Always use the correct API:

```javascript
// ✅ CORRECT - Production code
const resultBytes = await lua.compute('return 42');
const result = lua.readResult(lua.getBufferPtr(), resultBytes);

// ❌ INCORRECT - Don't use in production
const result = lua.eval('return 42');  // This doesn't exist in public API
```

## Migration Guide

If you have existing code using `eval()`, update it:

### Before (Incorrect)

```javascript
const result = lua.eval('return 42');
console.log(result.value);
```

### After (Correct)

```javascript
const resultBytes = await lua.compute('return 42');
const result = lua.readResult(lua.getBufferPtr(), resultBytes);
console.log(result.value);
```

## Conclusion

**The correct and only public API function is `lua.compute()`.**

Any references to `lua.eval()` in documentation should be considered incorrect and updated. Test code may use an `eval()` wrapper for convenience, but this is not part of the public API.

When writing new code or documentation, always use `lua.compute()`.
