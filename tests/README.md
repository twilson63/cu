# Cu WASM Test Suite

Fast, focused test suite for Cu WASM Lua runtime - all tests passing with no loops or hangs.

## Test Architecture

Tests are now written in **pure Node.js** using Node's built-in test runner, providing:
- ⚡ **Fast execution** (~80ms for all tests)
- 🚫 **No hanging tests** (direct WASM loading, no browser overhead)
- 🔧 **Easy debugging** (standard Node.js debugging)
- 📦 **No browser dependencies** for core functionality tests

## Test Files

### Node.js Tests (Primary)

These tests run directly in Node.js using the WASM module:

#### 01-initialization.node.test.js (4 tests)
Tests for WASM module loading:
- WASM loads successfully
- Lua VM initializes
- Required exports exist
- Buffer pointer is valid

#### 02-computation.node.test.js (12 tests)
Tests for Lua code execution:
- Simple arithmetic operations
- String concatenation and operations
- Variable persistence across calls
- Print statement output capture
- Nil value handling
- Table operations
- Loops and conditionals
- Boolean values
- Floating point numbers

#### 03-io-table.node.test.js (11 tests)
Tests for the `_io` table API (JavaScript ↔ Lua data exchange):
- Setting input from JS and reading in Lua
- Setting output from Lua and reading in JS
- Setting and using metadata
- Passing arrays through _io.input
- Passing nested objects through _io.input
- clearIo() functionality
- Bidirectional data flow
- Various data types (strings, booleans, numbers)
- Empty objects and arrays

### Browser Tests (Legacy/Demo)

For browser-specific testing (IndexedDB persistence, DOM integration), see the `.test.js` files which use Playwright.

## Running Tests

```bash
# Run all Node.js tests (fast, recommended)
npm test

# Run browser tests with Playwright (slower, for browser-specific features)
npm run test:browser

# Debug Playwright tests
npm run test:debug

# Headed mode (see browser)
npm run test:headed
```

## Test Pattern

### Node.js Tests

Node.js tests use a simple pattern with the `node-test-utils.js` helper:

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('My Test Suite', () => {
  beforeEach(async () => {
    reset();  // Clear state between tests
    await loadWasm();
    init();
  });

  it('Executes Lua code', () => {
    const bytes = compute('return 2 + 2');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 4);
  });
});
```

Key points:
- Always call `reset()` in `beforeEach` to ensure clean state
- `loadWasm()` loads the WASM module with host imports
- `init()` initializes the Lua VM
- `compute()` returns byte count
- Use `readResult(getBufferPtr(), bytes)` to deserialize results

### Browser Tests (Playwright)

For browser-specific tests:

```javascript
test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.cu !== undefined);
  
  await page.evaluate(async () => {
    await window.cu.load();
    window.cu.init();
  });
});
```

## _io Table API

The `_io` table provides a clean way to exchange data between JavaScript and Lua:

```javascript
// JavaScript side
cu.setInput({ name: 'Alice', age: 30 });
cu.setMetadata({ version: '1.0' });

// Lua side
local name = _io.input.name
local age = _io.input.age
_io.output = name .. " is " .. age

// JavaScript side
const output = cu.getOutput(); // "Alice is 30"
```

## _home Table Persistence

The `_home` table is an external table that persists:
- Across `compute()` calls within a session
- Across page reloads when using `saveState()`/`loadState()`
- Can store Lua values, tables, and **functions**

```lua
-- Store a function
_home.multiply = function(x, y)
  return x * y
end

-- Use it later (even after page reload)
return _home.multiply(6, 7) -- 42
```

## Known Limitations

- Complex closures with upvalues may not serialize correctly
- Setting complex nested tables as `_io.output` may cause issues (use simple values)
- Always call `clearPersistedState()` at the end of persistence tests to clean up

## Test Results

All 27 Node.js tests passing in **~80ms**:
- ✓ 4 initialization tests
- ✓ 12 computation tests  
- ✓ 11 _io table tests

## Architecture Details

The `node-test-utils.js` module provides a Node.js-compatible implementation of the Cu WASM interface:
- Uses Node's built-in `WebAssembly` API to load WASM
- Implements the same host imports (`js_ext_table_*`) as the browser version
- Uses `Map` for external table storage (no IndexedDB needed for unit tests)
- Provides serialization/deserialization for the `_io` table API
- Resets state between tests for isolation

This architecture allows:
- Fast iteration during development
- CI/CD friendly (no browser dependencies)
- Easy debugging with Node.js tools
- Browser tests only when testing browser-specific features (persistence, DOM)
