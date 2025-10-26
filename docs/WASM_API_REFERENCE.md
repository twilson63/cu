# Lua WASM Low-Level API Reference

**Version:** 2.0.0  
**Last Updated:** October 2025  
**Target:** Developers integrating lua.wasm with WAMR, wasmtime, wazero, or custom WASM runtimes

---

## Table of Contents

- [Overview](#overview)
  - [What is lua.wasm?](#what-is-luawasm)
  - [Target Audience](#target-audience)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Architecture](#architecture)
- [Exports Reference](#exports-reference)
  - [Core Functions](#core-functions)
  - [Memory Management](#memory-management)
  - [External Tables](#external-tables)
  - [Configuration](#configuration)
  - [Internal Functions](#internal-functions)
- [Imports Reference](#imports-reference)
  - [External Table Operations](#external-table-operations)
  - [Implementation Requirements](#implementation-requirements)
- [Memory Protocol](#memory-protocol)
  - [I/O Buffer](#io-buffer)
  - [Type Encoding](#type-encoding)
  - [Error Protocol](#error-protocol)
- [Integration Examples](#integration-examples)
  - [Rust + wasmtime](#rust--wasmtime)
  - [C + WAMR](#c--wamr)
  - [Go + wazero](#go--wazero)
  - [Node.js](#nodejs-bare-wasm)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Performance Guide](#performance-guide)
- [Migration Notes](#migration-notes)
- [FAQ](#faq)
- [Appendices](#appendices)

---

## Overview

### What is lua.wasm?

lua.wasm is a WebAssembly build of Lua 5.4.7 with external table persistence, compiled from Zig source code. It provides a complete Lua runtime that can execute in any WASM environment, with special support for persisting Lua state outside of WASM linear memory.

**Key Features:**
- Full Lua 5.4.7 compatibility
- 64KB I/O buffer for code execution and results
- External table system for persistence (IndexedDB, files, databases)
- Function serialization with bytecode preservation
- Custom memory allocator (2MB fixed heap)
- Zero external dependencies

**Build Configuration:**
- Target: `wasm32-freestanding`
- Optimization: `ReleaseFast`
- Binary Size: ~1.6 MB
- Memory: 2 MB fixed (32 WASM pages)
- I/O Buffer: 64 KB

### Target Audience

This documentation is for developers who want to:
- Integrate lua.wasm into non-JavaScript environments
- Build custom WASM runtimes with Lua support
- Implement host functions in Rust, C, Go, or other languages
- Understand the low-level WASM interface
- Create language-specific bindings

**Not Needed If:**
- You're using the JavaScript wrapper (web/lua-api.js)
- You only need browser integration (use high-level API)

### Prerequisites

**Required Knowledge:**
- WASM basics (imports, exports, linear memory)
- Understanding of pointers and memory management
- Familiarity with your target language (Rust/C/Go/etc.)

**Required Tools:**
- WASM runtime (wasmtime, WAMR, wazero, Node.js, browser)
- lua.wasm binary (from web/lua.wasm)

### Quick Start

**30-Second Integration:**

```javascript
// 1. Load WASM
const wasmBytes = await readFile('web/lua.wasm');
const imports = {
  env: {
    js_ext_table_set: (tid, kp, kl, vp, vl) => { /* implement */ },
    js_ext_table_get: (tid, kp, kl, vp, ml) => { /* implement */ },
    js_ext_table_delete: (tid, kp, kl) => { /* implement */ },
    js_ext_table_size: (tid) => { /* implement */ },
    js_ext_table_keys: (tid, bp, ml) => { /* implement */ }
  }
};

const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
const { init, compute, get_buffer_ptr, get_buffer_size } = instance.exports;

// 2. Initialize
if (init() !== 0) throw new Error('Init failed');

// 3. Execute Lua
const bufPtr = get_buffer_ptr();
const code = new TextEncoder().encode('return 2 + 2');
new Uint8Array(instance.exports.memory.buffer, bufPtr, code.length).set(code);

const resultLen = compute(bufPtr, code.length);
if (resultLen < 0) {
  const errorLen = (-resultLen) - 1;
  const error = new TextDecoder().decode(
    new Uint8Array(instance.exports.memory.buffer, bufPtr, errorLen)
  );
  console.error('Error:', error);
} else {
  const result = new Uint8Array(instance.exports.memory.buffer, bufPtr, resultLen);
  console.log('Result:', deserialize(result));
}
```

**See [Integration Examples](#integration-examples) for complete working code.**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Host Environment                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │         WASM Runtime (wasmtime/WAMR/etc.)        │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │          lua.wasm Module                    │ │  │
│  │  │                                             │ │  │
│  │  │  ┌──────────────┐  ┌──────────────┐       │ │  │
│  │  │  │  Lua 5.4 VM  │  │  I/O Buffer  │       │ │  │
│  │  │  │              │  │   (64 KB)    │       │ │  │
│  │  │  └──────────────┘  └──────────────┘       │ │  │
│  │  │                                             │ │  │
│  │  │  External Table System                     │ │  │
│  │  │  (calls host functions)                    │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │         ▲                            │            │  │
│  │         │ Exports                    │ Imports    │  │
│  │         │                            ▼            │  │
│  └─────────┼────────────────────────────┼────────────┘  │
│            │                            │               │
│      ┌─────┴──────┐            ┌───────▼────────┐      │
│      │  11 Funcs  │            │  5 Host Funcs  │      │
│      │  (init,    │            │  (ext_table_*) │      │
│      │  compute,  │            └────────────────┘      │
│      │  etc.)     │                     │               │
│      └────────────┘                     ▼               │
│                              ┌──────────────────────┐   │
│                              │  External Storage    │   │
│                              │  (Map/DB/File)       │   │
│                              └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Data Flow:**
1. Host writes Lua code to I/O buffer
2. Host calls `compute(ptr, len)`
3. WASM executes Lua code
4. Lua code may access `_home` table → triggers host function calls
5. WASM writes result to I/O buffer
6. Host reads result from buffer

---

## Exports Reference

The lua.wasm module exports 11 functions. All exports use C calling convention compatible with standard WASM.

### Type Mappings

| WASM Type | Zig Type | C Type | Rust Type | Go Type | Description |
|-----------|----------|--------|-----------|---------|-------------|
| `i32` | `i32`, `c_int` | `int32_t` | `i32` | `int32` | 32-bit signed integer |
| `i32` (ptr) | `[*]u8`, `*T` | `uint8_t*` | `*mut u8` | `*byte` | Memory pointer (offset) |
| `u32` | `u32` | `uint32_t` | `u32` | `uint32` | 32-bit unsigned integer |
| `usize` | `usize` | `size_t` | `usize` | `uintptr` | Pointer-sized integer |

### Core Functions

#### `init()`

Initialize the Lua VM and runtime environment.

**Signature:**
```wasm
(func (export "init") (result i32))
```

**Parameters:** None

**Returns:**
- `0` - Success
- `-1` - Failure (out of memory or already initialized)

**Description:**  
Must be called once after WASM instantiation. Sets up Lua 5.4 runtime with standard libraries, external table system, and the `_home` global table for persistence.

**Usage:**
```c
int32_t result = init();
if (result != 0) {
    fprintf(stderr, "Failed to initialize Lua\n");
    exit(1);
}
```

**Notes:**
- Idempotent (safe to call multiple times)
- Creates 2MB heap for Lua allocations
- Thread-safe: No (uses global state)

---

#### `compute(code_ptr, code_len)`

Execute Lua code and return results via the I/O buffer.

**Signature:**
```wasm
(func (export "compute") (param i32 i32) (result i32))
```

**Parameters:**
- `code_ptr` (i32): Pointer to Lua code in buffer (usually from `get_buffer_ptr()`)
- `code_len` (i32): Length of Lua code in bytes (max 65536)

**Returns:**
- `>= 0` - Success, result length in bytes
- `< 0` - Error, error length = `(-return_value) - 1`

**Description:**  
Executes Lua code from the I/O buffer. Code must be null-terminated internally (added automatically). Results are written back to the same buffer.

**Usage:**
```rust
let code = b"return 2 + 2";
memory.write(buffer_ptr as usize, code)?;

let result_len = compute(buffer_ptr, code.len() as i32);
if result_len < 0 {
    let error_len = ((-result_len) - 1) as usize;
    let error_msg = memory.read(buffer_ptr as usize, error_len)?;
    eprintln!("Lua error: {}", String::from_utf8_lossy(&error_msg));
} else {
    let result_data = memory.read(buffer_ptr as usize, result_len as usize)?;
    // Deserialize result_data
}
```

**Buffer Protocol:**
- **Input:** Raw UTF-8 Lua code
- **Output (success):** 4-byte output length + captured print output + type tag + serialized value
- **Output (error):** Plain UTF-8 error message

**Error Conditions:**
- Syntax error in Lua code
- Runtime error (nil access, type mismatch, etc.)
- code_len > 65536
- Lua state not initialized

---

#### `get_buffer_ptr()`

Get the address of the 64KB I/O buffer.

**Signature:**
```wasm
(func (export "get_buffer_ptr") (result i32))
```

**Returns:**  
Memory address (i32) of the I/O buffer start

**Usage:**
```go
bufferPtr := instance.GetFunc("get_buffer_ptr").Call()[0].(int32)
// Cache this value - it never changes
```

**Notes:**
- Returns same value every time (static buffer)
- Buffer is 16-byte aligned
- Cache the result for performance

---

#### `get_buffer_size()`

Get the size of the I/O buffer in bytes.

**Signature:**
```wasm
(func (export "get_buffer_size") (result i32))
```

**Returns:**  
`65536` (64 KB)

**Usage:**
```javascript
const bufferSize = get_buffer_size(); // Always 65536
```

---

### Memory Management

#### `get_memory_stats(stats_ptr)`

Write memory statistics to a 12-byte struct.

**Signature:**
```wasm
(func (export "get_memory_stats") (param i32))
```

**Parameters:**
- `stats_ptr` (i32): Pointer to 12-byte buffer for MemoryStats struct

**Returns:** void (writes to memory)

**MemoryStats Structure:**
```c
struct MemoryStats {
    uint32_t io_buffer_size;  // bytes 0-3: 65536
    uint32_t lua_memory_used; // bytes 4-7: current Lua memory usage
    uint32_t wasm_pages;      // bytes 8-11: WASM pages (32)
};
```

**Usage:**
```c
uint8_t stats_buffer[12];
get_memory_stats((int32_t)stats_buffer);

uint32_t io_size = *(uint32_t*)(stats_buffer + 0);
uint32_t lua_mem = *(uint32_t*)(stats_buffer + 4);
uint32_t pages = *(uint32_t*)(stats_buffer + 8);

printf("Lua memory: %u bytes, WASM pages: %u\n", lua_mem, pages);
```

---

#### `run_gc()`

Trigger Lua garbage collection (currently a no-op).

**Signature:**
```wasm
(func (export "run_gc"))
```

**Parameters:** None  
**Returns:** void

**Note:** Not currently implemented. Reserved for future GC control.

---

### External Tables

#### `attach_memory_table(table_id)`

Attach an external table as the `_home` global.

**Signature:**
```wasm
(func (export "attach_memory_table") (param i32))
```

**Parameters:**
- `table_id` (u32): External table ID to attach as `_home`

**Description:**  
Restores a previously created external table as the global `_home` table. Used after loading saved state.

**Usage:**
```javascript
// After loading persisted tables
const homeTableId = metadata.homeTableId;
attach_memory_table(homeTableId);
// Now _home table in Lua points to the restored external table
```

---

#### `get_memory_table_id()`

Get the current `_home` table ID.

**Signature:**
```wasm
(func (export "get_memory_table_id") (result i32))
```

**Returns:**  
Table ID (u32) of the current `_home` table, or 0 if not set

**Usage:**
```rust
let home_id = get_memory_table_id();
// Save this ID to restore state later
```

---

#### `sync_external_table_counter(next_id)`

Synchronize the external table ID counter.

**Signature:**
```wasm
(func (export "sync_external_table_counter") (param i32))
```

**Parameters:**
- `next_id` (u32): Next table ID to use

**Description:**  
Used when restoring state to ensure new tables don't conflict with loaded ones.

---

### Configuration

#### `set_memory_alias_enabled(enabled)`

Enable or disable the legacy `Memory` alias.

**Signature:**
```wasm
(func (export "set_memory_alias_enabled") (param i32))
```

**Parameters:**
- `enabled` (i32): Non-zero to enable, 0 to disable

**Description:**  
Controls whether the legacy `Memory` global is created as an alias to `_home`. Default: enabled.

---

### Internal Functions

#### `lua_alloc(ud, ptr, osize, nsize)`

Custom Lua memory allocator (internal use).

**Signature:**
```wasm
(func (export "lua_alloc") (param i32 i32 i32 i32) (result i32))
```

**Note:** Used internally by Lua. Not for direct host use.

---

## Imports Reference

The lua.wasm module requires 5 host functions in the `env` namespace.

### External Table Operations

All host functions receive data via pointers into WASM linear memory. The host must:
1. Read data from WASM memory at specified offsets
2. Process the data
3. Write results back to WASM memory (for `get` and `keys`)

**Namespace:** `env`

---

#### `js_ext_table_set(table_id, key_ptr, key_len, val_ptr, val_len)`

Store a key-value pair in an external table.

**Signature:**
```wasm
(import "env" "js_ext_table_set" (func (param i32 i32 i32 i32 i32) (result i32)))
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `table_id` | u32 | Table identifier (1+) |
| `key_ptr` | ptr | Pointer to key bytes |
| `key_len` | usize | Key length in bytes |
| `val_ptr` | ptr | Pointer to serialized value |
| `val_len` | usize | Value length in bytes |

**Returns:**
- `0` - Success
- `-1` - Error

**Expected Behavior:**
```javascript
js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
  // 1. Ensure table exists
  if (!externalTables.has(table_id)) {
    externalTables.set(table_id, new Map());
  }
  const table = externalTables.get(table_id);
  
  // 2. Read key from WASM memory
  const keyBytes = new Uint8Array(memory.buffer, key_ptr, key_len);
  const key = new TextDecoder().decode(keyBytes);
  
  // 3. Read value from WASM memory (keep as binary!)
  const value = new Uint8Array(memory.buffer, val_ptr, val_len);
  
  // 4. Store value (preserve binary encoding)
  table.set(key, new Uint8Array(value)); // Copy to prevent overwrite
  
  return 0;
}
```

---

#### `js_ext_table_get(table_id, key_ptr, key_len, val_ptr, max_len)`

Retrieve a value by key from an external table.

**Signature:**
```wasm
(import "env" "js_ext_table_get" (func (param i32 i32 i32 i32 i32) (result i32)))
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `table_id` | u32 | Table identifier |
| `key_ptr` | ptr | Pointer to key bytes |
| `key_len` | usize | Key length |
| `val_ptr` | ptr | Pointer to output buffer |
| `max_len` | usize | Maximum bytes to write |

**Returns:**
- `>= 0` - Success, number of bytes written
- `-1` - Key not found or table doesn't exist

**Expected Behavior:**
```javascript
js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
  const table = externalTables.get(table_id);
  if (!table) return -1;
  
  // Read key
  const keyBytes = new Uint8Array(memory.buffer, key_ptr, key_len);
  const key = new TextDecoder().decode(keyBytes);
  
  // Get value
  const value = table.get(key);
  if (!value) return -1;
  
  // Write to WASM memory
  const len = Math.min(value.length, max_len);
  const outBuffer = new Uint8Array(memory.buffer, val_ptr, len);
  outBuffer.set(value.subarray(0, len));
  
  return len;
}
```

---

#### `js_ext_table_delete(table_id, key_ptr, key_len)`

Remove a key-value pair from a table.

**Signature:**
```wasm
(import "env" "js_ext_table_delete" (func (param i32 i32 i32) (result i32)))
```

**Returns:**
- `0` - Success
- `-1` - Table doesn't exist

---

#### `js_ext_table_size(table_id)`

Get the number of entries in a table.

**Signature:**
```wasm
(import "env" "js_ext_table_size" (func (param i32) (result i32)))
```

**Returns:**  
Number of key-value pairs, or 0 if table doesn't exist

---

#### `js_ext_table_keys(table_id, buf_ptr, max_len)`

List all keys in a table (newline-separated).

**Signature:**
```wasm
(import "env" "js_ext_table_keys" (func (param i32 i32 i32) (result i32)))
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `table_id` | u32 | Table identifier |
| `buf_ptr` | ptr | Output buffer pointer |
| `max_len` | usize | Max bytes to write |

**Returns:**
- `>= 0` - Number of bytes written
- `-1` - Table doesn't exist or buffer too small

**Format:**  
Keys separated by `\n` (newline), UTF-8 encoded

---

### Implementation Requirements

**Memory Safety:**
- Always validate table_id, pointers, and lengths
- Check buffer bounds before reading/writing
- Handle out-of-memory gracefully

**Data Preservation:**
- Store values as raw binary (Uint8Array)
- Do NOT decode or interpret value data
- Function bytecode must be preserved exactly

**Error Handling:**
- Return -1 on any error
- Log errors for debugging (optional)
- Never throw exceptions into WASM

**Example C Implementation:**
```c
typedef struct {
    uint32_t id;
    // Hash table or map implementation
} ExternalTable;

int32_t js_ext_table_set(uint32_t table_id, uint8_t* key_ptr, 
                          size_t key_len, uint8_t* val_ptr, size_t val_len) {
    ExternalTable* table = ensure_table(table_id);
    if (!table) return -1;
    
    // Copy key (null-terminate if needed)
    char* key = malloc(key_len + 1);
    memcpy(key, key_ptr, key_len);
    key[key_len] = '\0';
    
    // Copy value (binary data)
    uint8_t* value = malloc(val_len);
    memcpy(value, val_ptr, val_len);
    
    // Store in hash table
    hash_table_insert(table, key, value, val_len);
    
    return 0;
}
```

---

## Memory Protocol

### I/O Buffer

**Location:** Static buffer in WASM linear memory  
**Size:** 64 KB (65,536 bytes)  
**Alignment:** 16 bytes  
**Usage:** Shared for input (Lua code) and output (results)

**Access:**
```javascript
const bufferPtr = get_buffer_ptr();     // Get pointer (cache forever)
const bufferSize = get_buffer_size();   // Always 65536
```

**Buffer Lifecycle:**
1. Host writes Lua code to buffer
2. Host calls `compute(ptr, len)`
3. WASM executes code, may overwrite buffer with results
4. Host reads results from buffer
5. Buffer ready for reuse (synchronous operation)

**Important:**  
Data in buffer is ONLY valid until next `compute()` call. Copy results immediately.

---

### Type Encoding

Results are encoded with a type tag followed by data:

| Type | Tag | Format | Example |
|------|-----|--------|---------|
| nil | `0x00` | 1 byte | `00` |
| false | `0x01` | 1 byte | `01` |
| true | `0x02` | 1 byte | `02` |
| integer | `0x03` | 1 + 8 bytes (i64 LE) | `03 2A000000 00000000` (42) |
| float | `0x04` | 1 + 8 bytes (f64 LE) | `04 ...` (IEEE 754) |
| string | `0x05` | 1 + 4 + N bytes | `05 05000000 48656C6C6F` ("Hello") |
| function | `0x06` | 1 + 4 + N bytes | `06 ...` (Lua bytecode) |

**Success Response Format:**
```
[0..3]     uint32_t output_len (little-endian)
[4..4+M]   UTF-8 captured output (from print statements)
[4+M..]    Type tag + encoded return value
```

**Example:**
```
Input: "print('Hi'); return 42"
Output: 
  03000000           // output_len = 3
  486921             // "Hi!" (UTF-8)
  03                 // type = integer
  2A00000000000000   // 42 as i64 LE
```

---

### Error Protocol

**Negative Return Values:**  
When `compute()` returns < 0, the buffer contains a UTF-8 error message.

**Error Length Formula:**
```
errorLen = (-returnValue) - 1
```

**Examples:**
- Return `-1` → 0 bytes error (empty message)
- Return `-25` → 24 bytes error message
- Return `-100` → 99 bytes error message

**Error Message Format:**  
Plain UTF-8 text (no type tags), human-readable

**Example:**
```javascript
const result = compute(bufPtr, codeLen);
if (result < 0) {
  const errorLen = (-result) - 1;
  const errorBytes = new Uint8Array(memory.buffer, bufPtr, errorLen);
  const errorMsg = new TextDecoder().decode(errorBytes);
  console.error('Lua Error:', errorMsg);
  // Example: "Lua Error: attempt to call a nil value"
}
```

---

## Integration Examples

### Rust + wasmtime

```rust
use wasmtime::*;
use std::collections::HashMap;

fn main() -> Result<()> {
    // Storage for external tables
    let tables: HashMap<u32, HashMap<String, Vec<u8>>> = HashMap::new();
    
    // Load WASM
    let engine = Engine::default();
    let module = Module::from_file(&engine, "web/lua.wasm")?;
    
    // Define host functions
    let mut linker = Linker::new(&engine);
    linker.func_wrap("env", "js_ext_table_set", 
        |caller: Caller<'_>, tid: i32, kp: i32, kl: i32, vp: i32, vl: i32| -> i32 {
            // Implementation details in examples/wasm-integration/rust-example/
            0
        })?;
    
    // Create instance
    let mut store = Store::new(&engine, ());
    let instance = linker.instantiate(&mut store, &module)?;
    
    // Initialize
    let init = instance.get_typed_func::<(), i32>(&mut store, "init")?;
    init.call(&mut store, ())?;
    
    // Execute Lua
    let compute = instance.get_typed_func::<(i32, i32), i32>(&mut store, "compute")?;
    let get_buffer_ptr = instance.get_typed_func::<(), i32>(&mut store, "get_buffer_ptr")?;
    
    let buf_ptr = get_buffer_ptr.call(&mut store, ())?;
    let code = b"return 2 + 2";
    
    let memory = instance.get_memory(&mut store, "memory").unwrap();
    memory.write(&mut store, buf_ptr as usize, code)?;
    
    let result_len = compute.call(&mut store, (buf_ptr, code.len() as i32))?;
    println!("Result length: {}", result_len);
    
    Ok(())
}
```

**Full Example:** `examples/wasm-integration/rust-example/`

---

### C + WAMR

```c
#include "wasm_runtime_common.h"

// External table storage
typedef struct {
    char* key;
    uint8_t* value;
    size_t value_len;
} Entry;

int32_t js_ext_table_set(wasm_exec_env_t exec_env, uint32_t table_id,
                          uint32_t key_ptr, uint32_t key_len,
                          uint32_t val_ptr, uint32_t val_len) {
    wasm_module_inst_t module_inst = wasm_runtime_get_module_inst(exec_env);
    
    // Validate and get native addresses
    if (!wasm_runtime_validate_app_addr(module_inst, key_ptr, key_len))
        return -1;
    
    uint8_t* key = wasm_runtime_addr_app_to_native(module_inst, key_ptr);
    uint8_t* val = wasm_runtime_addr_app_to_native(module_inst, val_ptr);
    
    // Store in hash table (implementation details in C example)
    store_table_entry(table_id, key, key_len, val, val_len);
    
    return 0;
}

int main() {
    // Initialize WAMR
    wasm_runtime_init();
    
    // Load module
    uint8_t* wasm_buf = read_wasm_file("web/lua.wasm");
    wasm_module_t module = wasm_runtime_load(wasm_buf, wasm_size, ...);
    
    // Register host functions
    NativeSymbol native_symbols[] = {
        {"js_ext_table_set", js_ext_table_set, "(iiiii)i", NULL},
        // ... other functions
    };
    wasm_runtime_register_natives("env", native_symbols, ...);
    
    // Instantiate and run
    wasm_module_inst_t inst = wasm_runtime_instantiate(module, ...);
    wasm_function_inst_t init_func = wasm_runtime_lookup_function(inst, "init");
    wasm_runtime_call_wasm(exec_env, init_func, 0, NULL);
    
    return 0;
}
```

**Full Example:** `examples/wasm-integration/c-example/`

---

### Go + wazero

```go
package main

import (
    "context"
    "github.com/tetratelabs/wazero"
    "github.com/tetratelabs/wazero/api"
)

func main() {
    ctx := context.Background()
    
    // Create runtime
    r := wazero.NewRuntime(ctx)
    defer r.Close(ctx)
    
    // External table storage
    tables := make(map[uint32]map[string][]byte)
    
    // Define host functions
    _, err := r.NewHostModuleBuilder("env").
        NewFunctionBuilder().
        WithFunc(func(ctx context.Context, m api.Module, 
                     tid, kp, kl, vp, vl uint32) uint32 {
            // Read key from memory
            key, ok := m.Memory().Read(kp, kl)
            if !ok { return 0xFFFFFFFF } // -1
            
            // Read value
            val, ok := m.Memory().Read(vp, vl)
            if !ok { return 0xFFFFFFFF }
            
            // Store
            if tables[tid] == nil {
                tables[tid] = make(map[string][]byte)
            }
            tables[tid][string(key)] = append([]byte{}, val...)
            return 0
        }).
        Export("js_ext_table_set").
        Instantiate(ctx)
    
    // Load and instantiate lua.wasm
    wasmBytes, _ := os.ReadFile("web/lua.wasm")
    mod, _ := r.Instantiate(ctx, wasmBytes)
    
    // Call init
    init := mod.ExportedFunction("init")
    result, _ := init.Call(ctx)
    
    fmt.Println("Init result:", result[0])
}
```

**Full Example:** `examples/wasm-integration/go-example/`

---

### Node.js (Bare WASM)

```javascript
const fs = require('fs');

// External table storage
const externalTables = new Map();

// Host functions
const imports = {
  env: {
    js_ext_table_set: (tid, kp, kl, vp, vl) => {
      if (!externalTables.has(tid)) {
        externalTables.set(tid, new Map());
      }
      const table = externalTables.get(tid);
      const key = new TextDecoder().decode(
        new Uint8Array(memory.buffer, kp, kl)
      );
      const value = new Uint8Array(memory.buffer, vp, vl);
      table.set(key, new Uint8Array(value));
      return 0;
    },
    // ... other 4 functions
  }
};

// Load and instantiate
const wasmBuffer = fs.readFileSync('web/lua.wasm');
const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
const { memory, init, compute, get_buffer_ptr } = instance.exports;

// Initialize
if (init() !== 0) throw new Error('Init failed');

// Execute
const bufPtr = get_buffer_ptr();
const code = Buffer.from('return 2 + 2');
Buffer.from(memory.buffer, bufPtr, code.length).set(code);

const result = compute(bufPtr, code.length);
console.log('Result:', result);
```

**Full Example:** `examples/wasm-integration/nodejs-example/`

---

## Error Handling

**Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| `init() returns -1` | Out of memory | Check WASM memory limits |
| `compute() returns -2` | Lua syntax error | Validate Lua code syntax |
| `compute() returns <-2` | Lua runtime error | Check error message in buffer |
| Host function returns -1 | Storage failure | Check table implementation |

**Best Practices:**
1. Always check return values
2. Read error messages from buffer
3. Implement proper logging in host functions
4. Validate all pointers and lengths
5. Handle out-of-memory gracefully

---

## Best Practices

### Initialization
```javascript
// ✓ Good: Check init result
if (init() !== 0) throw new Error('Init failed');

// ✗ Bad: Ignore init result
init();
```

### Buffer Management
```javascript
// ✓ Good: Copy results immediately
const result = compute(ptr, len);
const resultCopy = new Uint8Array(memory.buffer, ptr, result);
const data = new Uint8Array(resultCopy); // Deep copy

// ✗ Bad: Reference buffer directly
const result = compute(ptr, len);
const data = new Uint8Array(memory.buffer, ptr, result);
// data becomes invalid after next compute()
```

### External Table Storage
```javascript
// ✓ Good: Preserve binary values
table.set(key, new Uint8Array(value));

// ✗ Bad: Decode values
table.set(key, new TextDecoder().decode(value)); // Breaks function bytecode
```

---

## Performance Guide

**Buffer Reuse:** Buffer is reused automatically. No allocation overhead.

**Memory Patterns:**
- Keep external tables in RAM for fast access
- Use IndexedDB for persistence, RAM for runtime
- Batch multiple compute() calls when possible

**Benchmarking:**
```javascript
console.time('Lua execution');
for (let i = 0; i < 1000; i++) {
  compute(ptr, len);
}
console.timeEnd('Lua execution'); // ~10-50ms for simple code
```

---

## Migration Notes

**v1.x → v2.0:**
- `Memory` renamed to `_home` (backward compatible alias available)
- New `set_memory_alias_enabled()` function
- Same WASM exports and imports
- Binary format unchanged

**Enable Legacy Support:**
```javascript
set_memory_alias_enabled(1); // Enable Memory alias
// Now both _home and Memory work in Lua
```

---

## FAQ

**Q: Can I use lua.wasm in the browser?**  
A: Yes! Use the JavaScript wrapper (web/lua-api.js) for easier integration.

**Q: Do I need to implement all 5 host functions?**  
A: Yes, all are required. Return -1 from unimplemented functions.

**Q: Can I run multiple Lua VMs?**  
A: Not in one WASM instance (global state). Instantiate multiple WASM modules.

**Q: Is it thread-safe?**  
A: No. Use separate WASM instances per thread.

**Q: How do I persist state?**  
A: Implement external table storage with persistent backend (IndexedDB, SQLite, files).

**Q: What's the maximum code size?**  
A: 64KB per compute() call. Split large scripts.

**Q: Can I call C functions from Lua?**  
A: Not directly. Use host functions or extend the WASM build.

---

## Appendices

### Appendix A: Complete Function Index

| Function | Type | Purpose |
|----------|------|---------|
| `init()` | Export | Initialize Lua VM |
| `compute(ptr, len)` | Export | Execute Lua code |
| `get_buffer_ptr()` | Export | Get I/O buffer address |
| `get_buffer_size()` | Export | Get buffer size (65536) |
| `get_memory_stats(ptr)` | Export | Write memory stats |
| `run_gc()` | Export | Trigger GC (no-op) |
| `attach_memory_table(id)` | Export | Restore _home table |
| `get_memory_table_id()` | Export | Get current _home ID |
| `sync_external_table_counter(id)` | Export | Sync table IDs |
| `set_memory_alias_enabled(en)` | Export | Toggle Memory alias |
| `lua_alloc(...)` | Export | Internal allocator |
| `js_ext_table_set(...)` | Import | Store key-value |
| `js_ext_table_get(...)` | Import | Retrieve value |
| `js_ext_table_delete(...)` | Import | Remove entry |
| `js_ext_table_size(id)` | Import | Get entry count |
| `js_ext_table_keys(...)` | Import | List keys |

### Appendix B: Error Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `-1` | Generic error |
| `<-1` | Error with message (length = -code - 1) |

### Appendix C: Memory Map

```
WASM Linear Memory (2 MB)
├─ 0x000000 - I/O Buffer (64 KB)
├─ 0x010000 - Heap (2 MB - 64 KB)
└─ 0x200000 - End
```

### Appendix D: Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | Oct 2025 | Memory → _home, set_memory_alias_enabled() |
| 1.0.0 | - | Initial release |

---

## License

MIT License - See LICENSE file for details.

## Contributing

For documentation improvements:
1. Submit issues at GitHub repository
2. Include version number and specific section
3. Provide corrections or suggestions

## References

- Source Code: `src/main.zig`
- High-Level API: `docs/API_REFERENCE.md`
- Examples: `examples/wasm-integration/`
- Lua Manual: https://www.lua.org/manual/5.4/

---

**End of Document**  
Version 2.0.0 | Last Updated: October 2025
