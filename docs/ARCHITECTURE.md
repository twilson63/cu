# System Architecture - Cu WASM Persistent

Complete technical documentation of the Cu WASM persistent system architecture, design decisions, and data flows.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow](#data-flow)
4. [Memory Layout](#memory-layout)
5. [Module Initialization](#module-initialization)
6. [Design Decisions](#design-decisions)
7. [Performance Considerations](#performance-considerations)

## System Overview

The Cu WASM persistent system consists of:

```
┌─────────────────────────────────────────┐
│       Browser / JavaScript Runtime      │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │   Web Interface / Application     │  │
│  └──────────────┬────────────────────┘  │
│                 │                        │
│        ┌────────┴────────┐              │
│        │ WASM Boundary   │              │
│        └────────┬────────┘              │
│                 ▼                        │
│  ┌───────────────────────────────────┐  │
│  │   WASM Memory (2MB)               │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Lua State & Heap (~1.5MB)   │  │  │
│  │  ├─────────────────────────────┤  │  │
│  │  │ IO Buffer (64KB)            │  │  │
│  │  └─────────────────────────────┘  │  │
│  └────┬──────────────────────────────┘  │
│       │                                  │
│       ▼                                  │
│  ┌───────────────────────────────────┐  │
│  │  Exported Functions               │  │
│  │  - init()                         │  │
│  │  - eval()                         │  │
│  │  - get_memory_stats()             │  │
│  └───────────────────────────────────┘  │
│       ▲                                  │
│       │                                  │
│       └────────────────────────┬────────┘
│                                │
│  ┌────────────────────────────┴────────┐
│  │ Imported Functions (Host Functions) │
│  │ - js_ext_table_set()                │
│  │ - js_ext_table_get()                │
│  │ - js_ext_table_delete()             │
│  │ - js_ext_table_size()               │
│  │ - js_ext_table_keys()               │
│  └─────────────────────────────────────┘
```

## Component Architecture

### Core Components

#### 1. Lua Runtime (lua.zig)

Wraps the Lua C library with Zig bindings.

**Responsibilities:**
- Provide type-safe Lua function wrappers
- Manage Lua state lifecycle
- Handle stack operations
- Provide library initialization

**Key Functions:**
- `lua.newstate()` - Create Lua state
- `lua.openlibs(L)` - Load standard libraries
- `lua.dostring(L, code)` - Execute code
- `lua.pushlstring()`, `lua.pushinteger()`, etc. - Push values
- `lua.tolstring()`, `lua.tointeger()`, etc. - Pop values

#### 2. Serializer (serializer.zig)

Handles value serialization and deserialization.

**Responsibilities:**
- Encode Lua values to binary format
- Decode binary format to Lua values
- Handle all supported types
- Prevent buffer overflows

**Type Support:**
- nil (1 byte)
- boolean (2 bytes)
- integer (9 bytes: type + i64)
- float (9 bytes: type + f64)
- string (5+ bytes: type + u32 length + data)

**Key Functions:**
- `serialize_value(L, idx, buffer, max_len)` - Encode value
- `deserialize_value(L, buffer, len)` - Decode value

#### 3. External Table Manager (ext_table.zig)

Manages persistent external tables.

**Responsibilities:**
- Create external table Lua objects
- Handle table operations (__index, __newindex, __len)
- Coordinate with JavaScript storage
- Manage table IDs

**Key Functions:**
- `setup_ext_table_library(L)` - Register ext.table() function
- `ext_table_new_impl()` - Create new table
- `ext_table_index_impl()` - Get value from table
- `ext_table_newindex_impl()` - Set value in table
- `ext_table_len_impl()` - Get table size

#### 4. Error Handler (error.zig)

Captures and formats error information.

**Responsibilities:**
- Capture Lua error messages
- Classify error types
- Format errors for JavaScript
- Maintain error state

**Error Types:**
- Compilation error (syntax error)
- Runtime error (execution error)
- Serialization error (data error)

**Key Functions:**
- `capture_lua_error(L, code)` - Capture error
- `format_error_to_buffer()` - Format for output
- `clear_error_state()` - Reset error state

#### 5. Output Capture (output.zig)

Captures print() output.

**Responsibilities:**
- Override print() function
- Buffer output text
- Handle overflow
- Format multiple types

**Key Functions:**
- `custom_print(L)` - Replacement print function
- `push_output(data)` - Add to output buffer
- `reset_output()` - Clear buffer
- `get_output_ptr()`, `get_output_len()` - Retrieve output

#### 6. Result Encoder (result.zig)

Encodes evaluation results.

**Responsibilities:**
- Combine output and return value
- Serialize return values
- Write output length prefix
- Handle buffer limits

**Output Format:**
```
[4 bytes: output length][output data][return value]
```

### Memory Layout

```
WASM Memory: 2MB (2097152 bytes)

0x000000  ┌──────────────────────┐
          │  Lua State (global)   │
          │  (internal Lua heap)  │
          │  (~1.5MB)             │
          │                       │
0x180000  ├──────────────────────┤
          │  IO Buffer            │
          │  64 KB                │
          │  ┌──────────────────┐ │
          │  │ Input/Output     │ │
          │  │ (shared)         │ │
          │  └──────────────────┘ │
0x1C0000  ├──────────────────────┤
          │  Stack space         │
          │  Reserved            │
0x200000  └──────────────────────┘
```

**Buffer Usage:**
- Bytes 0-65535 (64KB): IO Buffer
  - Input: Lua code to execute
  - Output: Results and error messages
  - Shared by serializer for temporary storage

**Lua Heap:**
- Bytes 65536-2097151: Lua state
- Managed by Lua's garbage collector
- ~1.5MB available

### JavaScript Integration

**Host Functions (imported by WASM):**

```javascript
// Store value in external table
js_ext_table_set(tableId, keyPtr, keyLen, valPtr, valLen) -> c_int

// Retrieve value from external table
js_ext_table_get(tableId, keyPtr, keyLen, valPtr, maxLen) -> c_int

// Delete key from external table
js_ext_table_delete(tableId, keyPtr, keyLen) -> c_int

// Get number of entries in table
js_ext_table_size(tableId) -> usize

// Get all keys from table
js_ext_table_keys(tableId, bufPtr, maxLen) -> c_int
```

**Implementation (JavaScript):**

```javascript
class LuaPersistent {
    externalTables = new Map();  // tableId -> Map(keyStr -> value)
    
    // Each external table stores:
    // - Key: base64-encoded key bytes
    // - Value: serialized Zig value
}
```

## Data Flow

### Evaluation Flow

```
1. JavaScript calls lua.eval(code)
   │
   ├─ Write code to IO buffer
   ├─ Call eval(inputLen)
   │
2. WASM: eval()
   │
   ├─ Check Lua state initialized
   ├─ Reset error/output state
   ├─ Parse null-terminated code string
   ├─ Call lua.dostring(L, code)
   │
3. Lua execution
   │
   ├─ Parse code (compile)
   ├─ Execute code
   ├─ Capture output (print overrides call custom_print)
   ├─ Leave return value on stack
   │
4. WASM: result encoding
   │
   ├─ Encode output length (4 bytes)
   ├─ Copy output to buffer
   ├─ Serialize stack top value
   ├─ Return total length
   │
5. JavaScript: parse result
   │
   ├─ Read output length
   ├─ Extract output bytes
   ├─ Deserialize return value
   └─ Return {value, output}
```

### External Table Storage Flow

**Writing to external table:**

```
Lua code:  t["key"] = value
   │
   ▼
ext_table_newindex_impl()  (C function)
   │
   ├─ Get table ID from __ext_table_id
   ├─ Serialize key to buffer (part 1)
   ├─ Serialize value to buffer (part 2)
   │
   ▼
js_ext_table_set() (imported)
   │
   ├─ Create or access JavaScript Map for table
   ├─ Base64 encode key bytes
   ├─ Store serialized value
   └─ Return status
```

**Reading from external table:**

```
Lua code:  value = t["key"]
   │
   ▼
ext_table_index_impl()  (C function)
   │
   ├─ Get table ID from __ext_table_id
   ├─ Serialize key to buffer
   │
   ▼
js_ext_table_get() (imported)
   │
   ├─ Access JavaScript Map for table
   ├─ Base64 decode key
   ├─ Retrieve serialized value
   ├─ Copy to value buffer
   └─ Return length
   │
   ▼
deserialize_value()
   │
   └─ Decode binary to Lua value
```

### Error Flow

```
Invalid code execution
   │
   ▼
lua.dostring() returns error code
   │
   ▼
capture_lua_error()
   │
   ├─ Get error message from stack
   ├─ Classify error type
   ├─ Store in error buffer
   │
   ▼
format_error_to_buffer()
   │
   └─ Copy error to output buffer
   │
   ▼
Return negative value (error marker)
   │
   ▼
JavaScript detects error
   │
   └─ getLastError() returns message
```

## Module Initialization

### Initialization Sequence

```
1. Load WASM file
   └─ Create WebAssembly.Instance
   
2. Call init()
   │
   ├─ Create Lua state (lua.newstate)
   ├─ Load standard libraries (lua.openlibs)
   ├─ Initialize error handler (init_error_state)
   ├─ Initialize output capture (init_output_capture)
   ├─ Initialize external table system (init_ext_table)
   ├─ Register ext.table library (setup_ext_table_library)
   ├─ Override print function (setup_print_override)
   │
   └─ Return 0 (success)

3. Ready for eval() calls
```

### Global State

Maintained in WASM memory:

```zig
var global_lua_state: ?*lua.lua_State = null;
var lua_memory_used: usize = 0;
var io_buffer: [64*1024]u8 = undefined;
var heap: [2*1024*1024]u8 = undefined;
```

## Design Decisions

### 1. Static Memory Allocation

**Decision:** All buffers and heap are statically allocated in WASM memory.

**Rationale:**
- Deterministic memory usage
- No dynamic allocation overhead
- Easier to reason about buffer overflows
- WASM MVP doesn't require dynamic allocation

**Trade-off:** Fixed memory size (2MB) vs. flexible allocation

### 2. External Table Approach

**Decision:** Store table data in JavaScript, not Lua heap.

**Rationale:**
- Persist data across eval() calls
- JavaScript Maps are efficient
- No Lua serialization/deserialization overhead for table pairs
- Clean separation of concerns

**Trade-off:** Extra FFI overhead vs. easier persistence

### 3. Single Global Lua State

**Decision:** Maintain one Lua state across all eval() calls.

**Rationale:**
- Preserve variable state between evals
- Efficient resource usage
- Simpler API

**Trade-off:** No isolation between eval() calls; state must be manually reset

### 4. Fixed IO Buffer

**Decision:** Single 64KB buffer for input/output/serialization.

**Rationale:**
- Simple buffer management
- Matches typical eval() sizes
- Reduces memory fragmentation

**Trade-off:** Limited to 64KB for code/output/data

### 5. Type-Tagged Serialization

**Decision:** Use 1-byte type tag for each serialized value.

**Rationale:**
- Distinguishes types without metadata
- Minimal overhead (1 byte)
- Extensible for future types

**Trade-off:** Cannot serialize nested structures

### 6. Zig Implementation

**Decision:** Write WASM module in Zig, C Lua library as-is.

**Rationale:**
- Memory safety (Zig prevents buffer overflows)
- Better FFI integration
- Compiles to small WASM binary

**Trade-off:** Zig ecosystem smaller than Rust

## Performance Considerations

### Serialization Overhead

Each external table operation requires:
1. Serialize key (variable, usually 10-30 bytes)
2. Serialize value (variable, 1-65KB)
3. Cross WASM boundary (FFI cost ~1µs)
4. JavaScript Map operation (FFI cost ~1µs)

**Total per operation:** 1-5µs typically

### Optimization Techniques

**1. Batch operations:**
```lua
-- Slow: 1000 FFI calls
for i = 1, 1000 do
    t["key_" .. i] = i
end

-- Fast: 100 FFI calls
local batch = {}
for i = 1, 10 do
    batch[i] = i
end
for j = 1, 100 do
    for i = 1, 10 do
        t["key_" .. (j-1)*10 + i] = batch[i]
    end
end
```

**2. Cache table references:**
```lua
-- Slow
ext.table()["key"] = 1
ext.table()["key"] = 2

-- Fast
local t = ext.table()
t["key"] = 1
t["key"] = 2
```

**3. Minimize serialization:**
- Store small values (integers better than strings)
- Avoid large tables (each operation serializes all data)

### Memory Pressure Points

1. **Output buffer overflow** (63KB limit)
2. **Lua heap exhaustion** (~1.5MB)
3. **External table storage** (JavaScript side)

**Monitoring:**
```javascript
const stats = lua.getMemoryStats();
if (stats.lua_memory_used > 1_000_000) {
    console.warn('Memory usage high');
    lua.gc();
}
```

### Garbage Collection

Lua's built-in GC runs automatically:
- Threshold: ~1MB heap
- Duration: ~10-50ms for full collection
- Can be manually triggered: `lua.gc()`

**Not covered by GC:**
- External table entries (JavaScript Maps persist)
- Output buffer

### Concurrency

WASM execution is **NOT concurrent**:
- Each eval() is synchronous
- No threading or async within WASM
- JavaScript can parallelize multiple instances

**Safe concurrent access:**
```javascript
const lua1 = new LuaPersistent();
const lua2 = new LuaPersistent();

await lua1.load('lua.wasm');
await lua2.load('lua.wasm');

// Each has independent state
```

## Summary

The architecture provides:

✓ **Simplicity:** Single Lua state, straightforward FFI
✓ **Efficiency:** Minimal overhead, good performance
✓ **Safety:** Memory-safe Zig implementation
✓ **Flexibility:** External tables for persistence

Key limitations:

✗ Fixed memory (2MB)
✗ No advanced Lua features (debugging, coroutines)
✗ Limited table serialization
✗ Synchronous execution

For detailed documentation:
- [README_LUA.md](README_LUA.md) - Lua API reference
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) - Implementation details
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
