# Node.js Bare WASM Integration Example

Example of integrating `lua.wasm` with Node.js using the built-in WebAssembly API - no frameworks, no npm packages!

## Features

- Zero npm dependencies (only Node.js built-ins)
- Direct WebAssembly API usage
- Manual memory management
- Shows low-level WASM interaction
- Contrast to high-level lua-api.js wrapper
- ES modules (modern JavaScript)

## Prerequisites

- Node.js 16.0.0 or later

That's it! No `npm install` required.

## Running

```bash
cd examples/wasm-integration/nodejs-example
node index.js
```

## Project Structure

```
nodejs-example/
├── package.json      # Minimal metadata (no dependencies!)
├── index.js          # Complete implementation
├── README.md         # This file
└── lua.wasm         # Copy or symlink from ../../web/lua.wasm
```

## How It Works

### 1. Loading WASM

Using Node.js file system API:

```javascript
import { readFile } from 'fs/promises';

const wasmBuffer = await readFile('./lua.wasm');
```

### 2. Creating Import Object

Host functions are plain JavaScript functions:

```javascript
const imports = {
  env: {
    js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
      // Implementation
      return 0;
    },
    // ... more functions
  }
};
```

### 3. Instantiating WASM

Using built-in WebAssembly API:

```javascript
const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
```

### 4. Accessing Memory

Direct memory access with Uint8Array:

```javascript
const memory = new Uint8Array(instance.exports.memory.buffer);
const bytes = memory.slice(ptr, ptr + len);
```

### 5. Calling Exports

Exports are directly callable:

```javascript
const initResult = instance.exports.init();
const resultLen = instance.exports.compute(bufferPtr, codeLen);
```

## Key Differences from lua-api.js

This bare example vs. the high-level wrapper:

| Feature | Bare WASM (this) | lua-api.js |
|---------|------------------|------------|
| Dependencies | None | Several npm packages |
| Memory access | Manual Uint8Array | Helper functions |
| Result parsing | Manual byte parsing | Automatic deserializer |
| Error handling | Check return codes | Exceptions |
| API style | Low-level | High-level |
| Code complexity | More verbose | More concise |

### Example Comparison

**Bare WASM (this example):**

```javascript
// Write code to buffer
const memory = new Uint8Array(instance.exports.memory.buffer);
const codeBytes = new TextEncoder().encode(code);
memory.set(codeBytes, bufferPtr);

// Execute
const resultLen = instance.exports.compute(bufferPtr, codeBytes.length);

// Parse result manually
if (resultLen < 0) {
  // Error handling
} else {
  const resultBytes = memory.slice(bufferPtr, bufferPtr + resultLen);
  // Manual deserialization
}
```

**High-level API (lua-api.js):**

```javascript
// Just call the function
const result = await lua.execute(code);
// Result is already parsed
```

## Host Functions Implementation

All 5 host functions use direct memory access:

### js_ext_table_set

```javascript
function jsExtTableSet(tableId, keyPtr, keyLen, valPtr, valLen) {
  const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
  
  // Read from WASM memory
  const keyBytes = memory.slice(keyPtr, keyPtr + keyLen);
  const key = new TextDecoder().decode(keyBytes);
  
  const value = new Uint8Array(memory.slice(valPtr, valPtr + valLen));
  
  // Store in JavaScript Map
  const table = getOrCreateTable(tableId);
  table.set(key, value);
  
  return 0;
}
```

### Memory Buffer Pattern

Reading from WASM memory:

```javascript
const memory = new Uint8Array(instance.exports.memory.buffer);
const bytes = memory.slice(startPtr, endPtr);
const text = new TextDecoder().decode(bytes);
```

Writing to WASM memory:

```javascript
const memory = new Uint8Array(instance.exports.memory.buffer);
const bytes = new TextEncoder().encode(text);
memory.set(bytes, targetPtr);
```

### DataView for Numbers

Reading little-endian integers:

```javascript
const view = new DataView(buffer, offset, length);
const num = view.getUint32(0, true); // true = little-endian
```

## External Table Storage

Simple Map-based storage:

```javascript
// Outer map: table ID → table
const externalTables = new Map();

// Inner map: string key → Uint8Array value
function getOrCreateTable(tableId) {
  if (!externalTables.has(tableId)) {
    externalTables.set(tableId, new Map());
  }
  return externalTables.get(tableId);
}
```

## Expected Output

```
Lua WASM Integration Example (Node.js Bare WASM)
=================================================

NOTE: This example uses Node.js built-in WebAssembly API directly.
No npm packages required!

✓ Loaded lua.wasm from: ../../../web/lua.wasm

✓ WASM module instantiated

Initializing Lua VM...
✓ Lua VM initialized successfully

Buffer info:
  Pointer: 0x...
  Size: 65536 bytes

=== Example 1: Basic Arithmetic ===
Lua code: return 2 + 2
✓ Result: 9 bytes returned
  Number value: 4

=== Example 2: String Operations ===
Lua code: return 'Hello ' .. 'from Lua!'
✓ Result: 20 bytes returned
  String value: 'Hello from Lua!'

=== Example 3: External Table Persistence (1st call) ===
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 1

=== Example 4: External Table Persistence (2nd call) ===
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 2

=== Example 5: Print Output ===
Lua code: print('Hello from Lua!'); return 'done'
Output: Hello from Lua!
✓ Result: 9 bytes returned
  String value: 'done'

=== Example 6: Error Handling ===
Lua code: return 1 / 0
✓ Result: 9 bytes returned
  Number value: Infinity

=== Example 7: Memory Statistics ===
Memory Statistics:
  I/O Buffer Size: 65536 bytes (64 KB)
  Lua Memory Used: 0 bytes
  WASM Pages: 32 (2 MB)
  Total WASM Memory: 2097152 bytes (2 MB)

=== External Table Contents ===
Table ID 1: 1 entries
  'counter': 9 bytes

✓ All examples completed successfully!

Key Differences from lua-api.js:
  - Direct WebAssembly.instantiate() instead of wrapper
  - Manual memory management with Uint8Array views
  - Direct access to WASM exports (init, compute, etc.)
  - No deserialization helpers (raw bytes)
  - Zero dependencies (only Node.js built-ins)
```

## Advantages

- **No dependencies** - Just Node.js built-ins
- **Full control** - Complete control over memory and execution
- **Lightweight** - Minimal code footprint
- **Educational** - Learn how WASM works at low level
- **Portable** - Works in any JavaScript environment with WebAssembly

## Disadvantages

- **Verbose** - More code than high-level wrappers
- **Manual** - Need to handle serialization/deserialization
- **Error-prone** - Easy to make mistakes with memory management
- **No helpers** - Must implement utility functions yourself

## When to Use This Approach

Use bare WASM when:

- You need minimal dependencies
- You want full control over the integration
- You're building your own wrapper/framework
- You need to understand the low-level details
- You're integrating into a custom environment

Use lua-api.js when:

- You want quick integration
- You don't need low-level control
- You prefer a high-level API
- You're building a browser application

## Integration Tips

### 1. Memory Buffer Reuse

The WASM memory buffer can be invalidated after growth:

```javascript
// Bad: Store reference
const memory = new Uint8Array(instance.exports.memory.buffer);

// Good: Get fresh reference each time
function getMemory() {
  return new Uint8Array(instance.exports.memory.buffer);
}
```

### 2. Encoding/Decoding Strings

Always use TextEncoder/TextDecoder for UTF-8:

```javascript
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytes = encoder.encode(string);
const string = decoder.decode(bytes);
```

### 3. Little-Endian Numbers

WASM uses little-endian byte order:

```javascript
const view = new DataView(buffer, offset);
const num = view.getUint32(0, true); // true = little-endian
```

### 4. Error Handling

Always check return values:

```javascript
const result = instance.exports.compute(ptr, len);
if (result < 0) {
  // Handle error
} else {
  // Handle success
}
```

## Further Reading

- [WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface)
- [Node.js WebAssembly Support](https://nodejs.org/api/wasi.html)
- [WASM Exports Reference](../../../docs/WASM_EXPORTS_REFERENCE.md)
- [Host Function Imports](../../../docs/HOST_FUNCTION_IMPORTS.md)

## Extending This Example

Ideas for extensions:

1. **Add persistence** - Store external tables to disk
2. **Add caching** - Cache compiled WASM module
3. **Add pooling** - Reuse WASM instances
4. **Add streaming** - Use WebAssembly.instantiateStreaming()
5. **Add workers** - Run in worker threads for concurrency

## License

Same as the main project (see LICENSE).
