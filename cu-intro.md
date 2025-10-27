# Cu WASM: Technical Overview

## What It Is
A 1.8MB WebAssembly module executing Lua 5.4.7 with fixed 2MB linear memory and external JavaScript storage.

## Memory Architecture

**Fixed WASM Memory (2MB)**
- Lua heap: 1.5MB
- I/O buffer: 64KB  
- Stack: ~436KB

**External JavaScript Storage (Unlimited)**
- `_home` table: Persistent via IndexedDB
- `_io` table: Ephemeral request/response data

## Key Technical Features

### 1. External Table Implementation
Host functions bridge WASM to JavaScript Maps:
```c
js_ext_table_set(table_id, key, value)
js_ext_table_get(table_id, key)
```
Lua accesses these as native tables through metatables. No copying occurs - only references pass between WASM and JavaScript.

### 2. Function Persistence
```lua
function _home.calc(x) return x * 2 end  -- Survives restart
```
- Functions compile to bytecode via `string.dump()`
- Bytecode stores in external table
- `load()` restores on initialization
- Limitation: No upvalue preservation

### 3. Zero-Copy I/O
```javascript
cu.setInput({ data: largeArray });  // Reference, not copy
cu.compute('process(_io.input.data)');  // Direct access
```
Data remains in JavaScript. Lua operates on references through table metatable hooks.

### 4. Native BigInt
Zig's std.math.big.Int compiled into WASM:
- Binary arithmetic operations (no string parsing)
- Lua garbage collection manages memory
- Operator overloading via metamethods
- 98KB addition to binary size

## Why This Solves Long-Running Process Issues

**Problem**: WASM linear memory grows with data, causing OOM
**Solution**: Data lives in JavaScript; WASM memory stays at 2MB

**Problem**: Large data requires copying through limited buffers  
**Solution**: _io tables provide zero-copy access to JavaScript data

**Problem**: Process restart loses all state
**Solution**: _home table persists to IndexedDB, including functions

**Problem**: BigInt operations require string round-trips
**Solution**: Native binary arithmetic in WASM

## Concrete Example: Processing 1GB Dataset

**Traditional WASM Approach:**
1. Allocate 1GB in linear memory (if possible)
2. Copy data from JavaScript
3. Process
4. Copy results back
5. Memory stays allocated

**Cu Approach:**
```javascript
// Data stays in JavaScript
cu.setInput({ dataset: gigabyteArray });
cu.compute(`
  -- Direct access, no copying
  for i, item in ipairs(_io.input.dataset) do
    _home.results[i] = process(item)
  end
`);
// WASM memory still 2MB
```

## Measured Performance

- Fixed memory: 2MB (constant)
- External data capacity: ~2GB (browser dependent)
- BigInt 100-digit multiply: 1ms (vs 10ms string-based)
- Function restore time: <1ms per function
- State persistence: 50ms (IndexedDB write)
- Table access overhead: ~1μs per operation

## Build Details

- Compiler: Zig 0.15.1 targeting wasm32-freestanding
- Lua version: 5.4.7 (unmodified C source)
- Dependencies: None (fully self-contained)
- Test suite: 55 tests in 140ms

---
Source: https://github.com/twilson63/cu
