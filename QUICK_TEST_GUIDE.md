# Quick Test Guide

## TL;DR

```bash
npm test              # Run all tests (~80ms) ✅
npm run demo          # Start browser demo
npm run test:browser  # Browser-specific tests
```

## Writing Tests

### Basic Test Pattern

```javascript
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('My Feature', () => {
  beforeEach(async () => {
    reset();          // Clean state
    await loadWasm(); // Load WASM
    init();           // Init Lua VM
  });

  it('Does something', () => {
    const bytes = compute('return 2 + 2');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 4);
  });
});
```

## Common Patterns

### Test Arithmetic
```javascript
it('Adds numbers', () => {
  const bytes = compute('return 10 + 5');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 15);
});
```

### Test Strings
```javascript
it('Concatenates strings', () => {
  const bytes = compute('return "Hello" .. " " .. "World"');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 'Hello World');
});
```

### Test Print Output
```javascript
it('Captures print output', () => {
  const bytes = compute('print("Debug message")');
  const result = readResult(getBufferPtr(), bytes);
  assert.ok(result.output.includes('Debug message'));
});
```

### Test Variables
```javascript
it('Persists variables', () => {
  compute('x = 42');
  const bytes = compute('return x');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 42);
});
```

### Test _io.input
```javascript
const { setInput } = require('./node-test-utils');

it('Reads input from JavaScript', () => {
  setInput({ name: 'Alice', age: 30 });
  
  const bytes = compute('return _io.input.name .. " is " .. _io.input.age');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 'Alice is 30');
});
```

### Test _io.output
```javascript
const { getOutput } = require('./node-test-utils');

it('Sets output to JavaScript', () => {
  compute('_io.output = 42');
  const output = getOutput();
  assert.strictEqual(output, 42);
});
```

### Test Arrays
```javascript
it('Processes arrays', () => {
  setInput([10, 20, 30]);
  
  const bytes = compute(`
    local sum = 0
    for i = 1, 3 do
      sum = sum + _io.input[i]
    end
    return sum
  `);
  
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 60);
});
```

### Test Objects
```javascript
it('Processes nested objects', () => {
  setInput({
    user: {
      name: 'Bob',
      age: 25
    }
  });
  
  const bytes = compute('return _io.input.user.name');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, 'Bob');
});
```

### Test Metadata
```javascript
const { setMetadata } = require('./node-test-utils');

it('Uses metadata', () => {
  setMetadata({ version: '1.0' });
  
  const bytes = compute('return _io.meta.version');
  const result = readResult(getBufferPtr(), bytes);
  assert.strictEqual(result.result, '1.0');
});
```

## Available Utilities

From `./node-test-utils.js`:

```javascript
// Core
await loadWasm()              // Load WASM module
init()                        // Initialize Lua VM
reset()                       // Reset state

// Execution
compute(code)                 // Execute Lua code, returns byte count
getBufferPtr()                // Get buffer pointer
readResult(ptr, len)          // Deserialize result

// _io Table
setInput(data)                // Set _io.input
getOutput()                   // Get _io.output
setMetadata(meta)             // Set _io.meta
clearIo()                     // Clear _io table

// Advanced
externalTables                // Access raw external table storage
```

## Assertions

Using Node's built-in `assert`:

```javascript
// Equality
assert.strictEqual(actual, expected)
assert.notStrictEqual(actual, expected)

// Deep equality (objects/arrays)
assert.deepStrictEqual(actual, expected)

// Truthiness
assert.ok(value)
assert.ok(!value)

// Contains
assert.ok(string.includes(substring))
assert.ok(array.includes(item))

// Type checking
assert.strictEqual(typeof value, 'string')
assert.strictEqual(typeof value, 'number')
assert.strictEqual(typeof value, 'boolean')
assert.strictEqual(value, null)

// Comparisons
assert.ok(value > 10)
assert.ok(value < 100)
assert.ok(Math.abs(value - 3.14) < 0.01)  // Float comparison
```

## Debugging

### Log Results
```javascript
const result = readResult(getBufferPtr(), bytes);
console.log('Result:', result);
console.log('  output:', result.output);
console.log('  result:', result.result);
```

### Inspect Tables
```javascript
const { externalTables } = require('./node-test-utils');

console.log('External tables:', externalTables);
for (const [id, table] of externalTables) {
  console.log(`Table ${id}:`, Array.from(table.entries()));
}
```

### Run Single Test
```bash
npx node --test tests/01-initialization.node.test.js
```

### Run Specific Test
```bash
npx node --test --test-name-pattern="Executes simple arithmetic"
```

## Common Mistakes

### ❌ Forgetting reset()
```javascript
beforeEach(async () => {
  // Missing reset() - state will leak between tests!
  await loadWasm();
  init();
});
```

### ✅ Correct
```javascript
beforeEach(async () => {
  reset();  // Always reset first
  await loadWasm();
  init();
});
```

### ❌ Not checking bytes > 0
```javascript
const bytes = compute('return nil');
const result = readResult(getBufferPtr(), bytes);  // May fail
```

### ✅ Correct
```javascript
const bytes = compute('return nil');
if (bytes > 0) {
  const result = readResult(getBufferPtr(), bytes);
} else {
  // Handle nil case
}
```

### ❌ Comparing floats with ===
```javascript
const result = readResult(getBufferPtr(), bytes);
assert.strictEqual(result.result, 3.14);  // May fail
```

### ✅ Correct
```javascript
const result = readResult(getBufferPtr(), bytes);
assert.ok(Math.abs(result.result - 3.14) < 0.01);
```

## File Naming

- Node.js tests: `*.node.test.js`
- Browser tests: `*.test.js`
- Test utilities: `*-utils.js`

## Test Organization

```
tests/
├── node-test-utils.js           # Shared utilities
├── 01-initialization.node.test.js
├── 02-computation.node.test.js
├── 03-io-table.node.test.js
└── README.md
```

## Performance Tips

1. **Use `reset()` wisely** - Only reset what you need
2. **Batch operations** - Test multiple things in one test when related
3. **Avoid unnecessary loads** - `loadWasm()` takes ~5ms
4. **Keep tests focused** - One concept per test

## When to Use Browser Tests

Use Playwright tests when testing:
- IndexedDB persistence (`saveState`/`loadState`)
- Browser-specific APIs
- DOM integration
- Visual demos

For everything else, use Node.js tests (faster, more reliable).

## Next Steps

1. Read existing tests for examples
2. Run `npm test` to see output
3. Add your test to appropriate file
4. Keep tests simple and focused
5. Always clean up with `reset()`

Happy testing! 🎉
