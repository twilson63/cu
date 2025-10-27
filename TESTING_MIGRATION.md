# Testing Migration: Browser to Node.js

## Summary

Successfully migrated Cu WASM tests from browser-based (Playwright) to Node.js-based tests, eliminating hanging tests and reducing execution time from indefinite hangs to **~80ms**.

## Problem

The previous Playwright-based tests were experiencing:
- ❌ Hanging/freezing tests that never completed
- ❌ Slow execution (even when working)
- ❌ Browser overhead for testing pure WASM functionality
- ❌ Difficult debugging when tests hang

## Solution

Migrated tests to **pure Node.js** using:
- ✅ Node's built-in test runner (`node:test`)
- ✅ Node's built-in WebAssembly API
- ✅ Direct WASM module loading (no browser required)
- ✅ Custom test utilities (`node-test-utils.js`)

## Results

### Before (Playwright)
```
npm test
- Tests hang indefinitely
- Never complete
- Requires killing process
```

### After (Node.js)
```
npm test
✓ 27 tests pass in ~80ms
✓ No hanging
✓ Fast iteration
✓ Easy debugging
```

## Architecture

### Test Utilities (`tests/node-test-utils.js`)

A Node.js-compatible implementation of the Cu WASM interface that:

1. **Loads WASM directly**
   ```javascript
   const wasmBuffer = fs.readFileSync(wasmPath);
   const wasmModule = await WebAssembly.instantiate(wasmBuffer, imports);
   ```

2. **Implements host imports**
   - `js_ext_table_set` - Store key-value pairs in external tables
   - `js_ext_table_get` - Retrieve values from external tables
   - `js_ext_table_delete` - Delete keys from external tables
   - `js_ext_table_size` - Get table size
   - `js_ext_table_keys` - Get all keys
   - `js_time_now` - Get current timestamp

3. **Provides helper functions**
   - `loadWasm()` - Load the WASM module
   - `init()` - Initialize Lua VM
   - `compute(code)` - Execute Lua code
   - `readResult(ptr, len)` - Deserialize results
   - `setInput(data)` - Set `_io.input` data
   - `getOutput()` - Get `_io.output` data
   - `setMetadata(meta)` - Set `_io.meta` data
   - `clearIo()` - Clear `_io` table
   - `reset()` - Reset state between tests

4. **Uses in-memory storage**
   - External tables stored in `Map` objects
   - No IndexedDB needed for unit tests
   - Fast, synchronous operations

### Test Structure

Each test file follows this pattern:

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('Test Suite', () => {
  beforeEach(async () => {
    reset();  // Clean state
    await loadWasm();
    init();
  });

  it('Test case', () => {
    const bytes = compute('return 2 + 2');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 4);
  });
});
```

## Test Files

### Node.js Tests (Primary)

1. **01-initialization.node.test.js** (4 tests)
   - WASM module loading
   - VM initialization
   - Export validation
   - Buffer pointer checks

2. **02-computation.node.test.js** (12 tests)
   - Arithmetic operations
   - String operations
   - Variables
   - Print statements
   - Data types (nil, boolean, number, string)
   - Control flow (loops, conditionals)

3. **03-io-table.node.test.js** (11 tests)
   - JavaScript ↔ Lua data exchange
   - Input/output/metadata
   - Arrays and objects
   - Nested structures
   - clearIo() functionality

### Browser Tests (Optional)

The original Playwright tests (`*.test.js`) are kept for:
- Browser-specific features (IndexedDB persistence)
- DOM integration testing
- Visual demos

Run with: `npm run test:browser`

## Commands

```bash
# Run Node.js tests (fast, recommended)
npm test

# Run browser tests (for browser-specific features)
npm run test:browser

# Debug browser tests
npm run test:debug

# Run browser tests in headed mode
npm run test:headed

# Run demo server
npm run demo
```

## Benefits

1. **Speed**: 73ms vs. indefinite hang
2. **Reliability**: No more hanging tests
3. **Developer Experience**: Fast iteration, easy debugging
4. **CI/CD Friendly**: No browser dependencies for unit tests
5. **Isolation**: Clean state between tests with `reset()`
6. **Simplicity**: Pure Node.js, no Playwright complexity

## Future Considerations

### When to Use Node.js Tests
- ✅ Unit tests for computation logic
- ✅ API validation
- ✅ Data serialization/deserialization
- ✅ Core WASM functionality

### When to Use Browser Tests
- ✅ IndexedDB persistence
- ✅ DOM integration
- ✅ Browser-specific APIs
- ✅ Visual demos

## Migration Guide

To convert an existing Playwright test to Node.js:

### Before (Playwright)
```javascript
const { test, expect } = require('@playwright/test');

test('Executes arithmetic', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.cu !== undefined);
  
  await page.evaluate(async () => {
    await window.cu.load();
    window.cu.init();
  });
  
  const bytes = await page.evaluate(() => window.cu.compute('return 2 + 2'));
  const result = await page.evaluate((b) => {
    return window.cu.readResult(window.cu.getBufferPtr(), b);
  }, bytes);
  
  expect(result.result).toBe(4);
});
```

### After (Node.js)
```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('Test Suite', () => {
  beforeEach(async () => {
    reset();
    await loadWasm();
    init();
  });

  it('Executes arithmetic', () => {
    const bytes = compute('return 2 + 2');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 4);
  });
});
```

**Differences:**
- No `page.evaluate()` wrapping
- Direct function calls
- Simpler syntax
- No async/await for compute operations (synchronous WASM calls)
- Node's built-in `assert` instead of Playwright's `expect`

## Conclusion

The migration to Node.js tests has been a complete success:
- ✅ All 27 tests passing
- ✅ Fast execution (~80ms)
- ✅ No hanging tests
- ✅ Better developer experience
- ✅ Browser tests kept for web-specific features
- ✅ Demo still works in browser

The Cu WASM project now has a robust, fast, and reliable test suite suitable for both development and CI/CD pipelines.
