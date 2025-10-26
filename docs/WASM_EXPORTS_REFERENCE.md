# WASM Exports Reference

Complete API documentation for all exported functions in `lua.wasm`.

## Table of Contents
- [Overview](#overview)
- [Type Mappings](#type-mappings)
- [Exported Functions](#exported-functions)
  - [init()](#init)
  - [compute()](#compute)
  - [get_buffer_ptr()](#get_buffer_ptr)
  - [get_buffer_size()](#get_buffer_size)
  - [get_memory_stats()](#get_memory_stats)
  - [run_gc()](#run_gc)
  - [attach_memory_table()](#attach_memory_table)
  - [get_memory_table_id()](#get_memory_table_id)
  - [sync_external_table_counter()](#sync_external_table_counter)
  - [set_memory_alias_enabled()](#set_memory_alias_enabled)
  - [lua_alloc()](#lua_alloc)
- [Data Structures](#data-structures)
- [JavaScript Bridge Functions](#javascript-bridge-functions)
- [Usage Examples](#usage-examples)

---

## Overview

The lua.wasm module is compiled from Zig source code targeting `wasm32-freestanding`. It provides a Lua 5.4 runtime with external table persistence capabilities, allowing Lua state to be stored in JavaScript memory.

**Build Configuration:**
- Target: `wasm32-freestanding`
- Optimization: `ReleaseFast`
- Entry: None (`-fno-entry`)
- Total WASM Memory: 2 MB (2,097,152 bytes)
- I/O Buffer Size: 64 KB (65,536 bytes)

---

## Type Mappings

WASM types map to Zig and JavaScript as follows:

| WASM Type | Zig Type | JavaScript Type | Description |
|-----------|----------|-----------------|-------------|
| `i32` | `i32`, `c_int` | `number` | 32-bit signed integer |
| `i32` (ptr) | `[*]u8`, `*T` | `number` | Memory address/pointer |
| `i64` | `i64`, `usize` | `BigInt` or `number` | 64-bit integer (size_t) |
| `f64` | `f64` | `number` | 64-bit float |
| `void` | `void` | `undefined` | No return value |

**Note:** Pointers are represented as i32 offsets into linear WASM memory.

---

## Exported Functions

### init()

Initialize the Lua VM and set up the runtime environment.

**Signature:**
```wasm
(func (export "init") (result i32))
```

**Zig Declaration:**
```zig
export fn init() i32
```

**Parameters:** None

**Return Value:**
- `0` - Success
- `-1` - Failure (Lua state creation failed)

**Description:**

Initializes the Lua 5.4 runtime with:
1. Custom memory allocator (using `lua_alloc`)
2. Standard Lua libraries
3. External table persistence system
4. Custom print function (captures output to buffer)
5. Global `_home` table for persistence (and optional legacy `Memory` alias)

**Error Conditions:**
- Returns `-1` if Lua state cannot be created (out of memory)
- If already initialized, returns `0` (idempotent)

**Memory Safety:**
- Creates global Lua state stored in `global_lua_state`
- Allocates from fixed 2 MB heap
- Thread-safe: No (maintains global state)

**Usage Example:**
```javascript
const result = wasmInstance.exports.init();
if (result !== 0) {
  throw new Error('Failed to initialize Lua VM');
}
```

**Notes:**
- Must be called before any other Lua operations
- Can only be called once per WASM instance
- Sets up the `_home` global table with ID 1 by default

---

### compute()

Execute Lua code and return the result.

**Signature:**
```wasm
(func (export "compute") (param i32 i32) (result i32))
```

**Zig Declaration:**
```zig
export fn compute(code_ptr: usize, code_len: usize) i32
```

**Parameters:**
- `code_ptr` (i32) - Pointer to Lua code string in WASM memory (typically the I/O buffer)
- `code_len` (i32/usize) - Length of the code string in bytes

**Return Value:**
- **Positive value** - Success: Number of bytes written to buffer (result data)
- **Negative value** - Error: `-(error_length + 1)` where error_length is the error message length
- `0` - Empty code or no result

**Description:**

Executes Lua code using `luaL_dostring` and writes the result to the I/O buffer. The buffer format is:

**Success Format:**
```
[0-3]    - Output length (u32 little-endian)
[4-...]  - Captured print() output (if any)
[...]    - Serialized return value
```

**Error Format:**
```
[0-...]  - Error message as UTF-8 string
```

**Error Conditions:**
- `code_len > IO_BUFFER_SIZE` (64 KB) - Returns `-1`
- `code_len == 0` - Returns `0`
- Lua state not initialized - Returns `-1` with error message in buffer
- Lua compilation error - Returns negative value, buffer contains error
- Lua runtime error - Returns negative value, buffer contains error
- Lua memory error - Returns negative value, buffer contains error

**Memory Safety:**
- Reads from I/O buffer (assumes caller wrote code there)
- Writes result to same I/O buffer (overwrites input)
- Clears Lua stack on completion
- Null-terminates code string internally

**Usage Example:**
```javascript
const code = 'return 1 + 1';
const encoder = new TextEncoder();
const codeBytes = encoder.encode(code);

// Write code to buffer
const bufPtr = wasmInstance.exports.get_buffer_ptr();
const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
memory.set(codeBytes, bufPtr);

// Execute
const resultLen = wasmInstance.exports.compute(bufPtr, codeBytes.length);

if (resultLen < 0) {
  // Error
  const errorLen = Math.abs(resultLen) - 1;
  const errorBytes = memory.slice(bufPtr, bufPtr + errorLen);
  const error = new TextDecoder().decode(errorBytes);
  console.error('Lua error:', error);
} else if (resultLen > 0) {
  // Success - parse result
  const resultBytes = memory.slice(bufPtr, bufPtr + resultLen);
  // Parse result format (see deserializer)
}
```

**Notes:**
- Input code must be UTF-8 encoded Lua source
- Does not preserve code in buffer (overwrites with result)
- Captures `print()` output to buffer
- Clears previous output before execution

---

### get_buffer_ptr()

Get the memory address of the shared I/O buffer.

**Signature:**
```wasm
(func (export "get_buffer_ptr") (result i32))
```

**Zig Declaration:**
```zig
export fn get_buffer_ptr() [*]u8
```

**Parameters:** None

**Return Value:**
- Memory address (i32 pointer) to the start of the 64 KB I/O buffer

**Description:**

Returns a pointer to the global `io_buffer` array, which is used for:
- Writing Lua code to execute
- Reading execution results
- External table serialization/deserialization
- Error messages

**Memory Safety:**
- Buffer is 64 KB (65,536 bytes)
- Buffer is 16-byte aligned
- Valid for lifetime of WASM instance
- Thread-safe for reads (writes require synchronization)

**Usage Example:**
```javascript
const bufferPtr = wasmInstance.exports.get_buffer_ptr();
const bufferSize = wasmInstance.exports.get_buffer_size();
const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
const buffer = memory.subarray(bufferPtr, bufferPtr + bufferSize);

// Write to buffer
const data = new TextEncoder().encode('Hello');
buffer.set(data);
```

**Notes:**
- Buffer address is constant for the WASM instance lifetime
- Buffer is shared across all operations (not thread-safe)
- First 4 bytes of result contain output length (u32 little-endian)

---

### get_buffer_size()

Get the size of the shared I/O buffer.

**Signature:**
```wasm
(func (export "get_buffer_size") (result i32))
```

**Zig Declaration:**
```zig
export fn get_buffer_size() usize
```

**Parameters:** None

**Return Value:**
- `65536` (64 KB) - The size of the I/O buffer in bytes

**Description:**

Returns the constant `IO_BUFFER_SIZE` value (64 KB). This is the maximum size for:
- Lua code input
- Serialized results
- Error messages
- External table keys/values (split into quarters for operations)

**Memory Safety:**
- Value is constant
- Read-only operation

**Usage Example:**
```javascript
const maxCodeSize = wasmInstance.exports.get_buffer_size();
console.log(`Maximum Lua code size: ${maxCodeSize} bytes`);

if (luaCode.length > maxCodeSize) {
  throw new Error(`Code too large: ${luaCode.length} > ${maxCodeSize}`);
}
```

---

### get_memory_stats()

Retrieve memory usage statistics.

**Signature:**
```wasm
(func (export "get_memory_stats") (param i32))
```

**Zig Declaration:**
```zig
export fn get_memory_stats(stats_ptr: *MemoryStats) void
```

**Parameters:**
- `stats_ptr` (i32) - Pointer to a `MemoryStats` structure in WASM memory (12 bytes)

**Return Value:** None (writes to memory at `stats_ptr`)

**Description:**

Writes memory statistics to the provided memory location. The structure contains:

```c
struct MemoryStats {
  usize io_buffer_size;  // Bytes 0-7: Always 65536 (64 KB)
  usize lua_memory_used; // Bytes 8-15: Currently unused (always 0)
  usize wasm_pages;      // Bytes 16-23: Number of WASM pages (always 32)
}
```

**Note:** `usize` is 32-bit (4 bytes) in wasm32, not 64-bit.

**Corrected Structure:**
```c
struct MemoryStats {
  u32 io_buffer_size;    // Bytes 0-3: Always 65536
  u32 lua_memory_used;   // Bytes 4-7: Always 0 (not tracked)
  u32 wasm_pages;        // Bytes 8-11: Always 32 (2MB / 64KB)
}
```

**Total size:** 12 bytes (3 × u32)

**Error Conditions:** None

**Memory Safety:**
- Caller must allocate at least 12 bytes at `stats_ptr`
- Writes are within bounds (12 bytes)
- No validation of pointer address

**Usage Example:**
```javascript
// Allocate space in WASM memory for stats (12 bytes)
const statsPtr = wasmInstance.exports.get_buffer_ptr(); // Use buffer temporarily
wasmInstance.exports.get_memory_stats(statsPtr);

const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
const statsView = new DataView(memory.buffer, statsPtr, 12);

const ioBufferSize = statsView.getUint32(0, true);   // Little-endian
const luaMemoryUsed = statsView.getUint32(4, true);
const wasmPages = statsView.getUint32(8, true);

console.log('Memory Stats:', {
  ioBufferSize,      // 65536
  luaMemoryUsed,     // 0 (not tracked)
  wasmPages,         // 32
  totalMemory: wasmPages * 65536  // 2,097,152 bytes (2 MB)
});
```

**Notes:**
- `lua_memory_used` is currently not tracked (always 0)
- WASM pages are fixed at compile time (32 pages = 2 MB)
- Each WASM page is 64 KB (65,536 bytes)

---

### run_gc()

Run the Lua garbage collector.

**Signature:**
```wasm
(func (export "run_gc"))
```

**Zig Declaration:**
```zig
export fn run_gc() void
```

**Parameters:** None

**Return Value:** None

**Description:**

**Currently a no-op stub.** This function is exported but does not perform any operation. Originally intended to trigger Lua's garbage collector, but not implemented.

**Error Conditions:** None

**Memory Safety:** Safe (does nothing)

**Usage Example:**
```javascript
wasmInstance.exports.run_gc(); // Does nothing currently
```

**Notes:**
- Lua's GC runs automatically as needed
- May be implemented in future versions
- Safe to call but has no effect

---

### attach_memory_table()

Attach an existing external table as the global `_home` table.

**Signature:**
```wasm
(func (export "attach_memory_table") (param i32))
```

**Zig Declaration:**
```zig
export fn attach_memory_table(table_id: u32) void
```

**Parameters:**
- `table_id` (u32) - ID of the external table to attach

**Return Value:** None

**Description:**

Attaches a previously created external table as the global `_home` table (and optionally `Memory` for backward compatibility). This is used for restoring persisted state.

**Behavior:**
1. Creates a new Lua table with metatable for external storage
2. Sets it as global `_home`
3. If `enable_memory_alias` is true, also sets it as global `Memory`
4. Updates internal `memory_table_id` to the provided ID
5. Synchronizes the external table counter if needed

**Error Conditions:**
- If `global_lua_state` is null, silently returns
- If `table_id` is 0, silently returns

**Memory Safety:**
- Does not validate that table_id exists in JavaScript
- Safe to call multiple times (replaces existing table)

**Usage Example:**
```javascript
// Restore from persistence
const savedTableId = 5; // Retrieved from storage

// Attach the table
wasmInstance.exports.attach_memory_table(savedTableId);

// Verify
const currentId = wasmInstance.exports.get_memory_table_id();
console.log('Attached table ID:', currentId); // 5
```

**Notes:**
- Used during state restoration
- The table must exist in JavaScript's external table storage
- If the ID is higher than the current counter, it updates the counter
- Creates Lua global variables `_home` and optionally `Memory`

---

### get_memory_table_id()

Get the ID of the current global `_home` table.

**Signature:**
```wasm
(func (export "get_memory_table_id") (result i32))
```

**Zig Declaration:**
```zig
export fn get_memory_table_id() u32
```

**Parameters:** None

**Return Value:**
- `u32` - The ID of the current `_home` table (0 if not set)

**Description:**

Returns the ID of the external table currently attached as the global `_home` table. This ID is set during:
- Initial `init()` call (creates table with ID 1)
- `attach_memory_table()` call (uses provided ID)

**Error Conditions:** None (returns 0 if not initialized)

**Memory Safety:** Safe (read-only global variable)

**Usage Example:**
```javascript
const tableId = wasmInstance.exports.get_memory_table_id();
console.log('Current _home table ID:', tableId);

// Use for persistence
const state = {
  homeTableId: tableId,
  tables: serializeTables() // Include this table
};
```

**Notes:**
- Returns 0 if `init()` has not been called
- Typically returns 1 after initial `init()`
- Can return different value after `attach_memory_table()`

---

### sync_external_table_counter()

Synchronize the external table ID counter with a hint value.

**Signature:**
```wasm
(func (export "sync_external_table_counter") (param i32))
```

**Zig Declaration:**
```zig
export fn sync_external_table_counter(next_id: u32) void
```

**Parameters:**
- `next_id` (u32) - Suggested next table ID

**Return Value:** None

**Description:**

Updates the internal `external_table_counter` to ensure new tables don't conflict with existing ones. If `next_id` is greater than the current counter, the counter is updated to `next_id`.

**Behavior:**
```zig
if (next_id > external_table_counter) {
    external_table_counter = next_id;
}
```

**Error Conditions:** None

**Memory Safety:** Safe (updates global counter)

**Usage Example:**
```javascript
// After restoring tables from persistence
const maxTableId = Math.max(...externalTables.keys());
const nextId = maxTableId + 1;

// Sync the counter so new tables don't conflict
wasmInstance.exports.sync_external_table_counter(nextId);

// Now when Lua creates new tables, they'll use IDs >= nextId
```

**Notes:**
- Used during state restoration to prevent ID conflicts
- Counter only increases, never decreases
- Essential for proper persistence restoration

---

### set_memory_alias_enabled()

Enable or disable the legacy `Memory` global alias.

**Signature:**
```wasm
(func (export "set_memory_alias_enabled") (param i32))
```

**Zig Declaration:**
```zig
export fn set_memory_alias_enabled(enabled: c_int) void
```

**Parameters:**
- `enabled` (c_int) - `0` to disable, non-zero to enable

**Return Value:** None

**Description:**

Controls whether the `_home` table is also aliased as `Memory` for backward compatibility.

**Behavior:**
- **Enabled (default):** Both `_home` and `Memory` globals reference the same table
- **Disabled:** Only `_home` exists; `Memory` is undefined

**Affects:**
- `init()` - Whether to create the `Memory` alias initially
- `attach_memory_table()` - Whether to set the `Memory` global

**Error Conditions:** None

**Memory Safety:** Safe (updates global flag)

**Usage Example:**
```javascript
// Disable legacy Memory alias (use only _home)
wasmInstance.exports.set_memory_alias_enabled(0);

// Re-initialize or re-attach to apply
wasmInstance.exports.init();

// Now in Lua:
// _home.foo = 'bar'  -- Works
// Memory.foo = 'bar' -- Error: attempt to index a nil value (global 'Memory')
```

**Notes:**
- Default is enabled (backward compatible)
- Set before calling `init()` or `attach_memory_table()` to take effect
- Purely for backward compatibility; new code should use `_home`

---

### lua_alloc()

Custom memory allocator for Lua VM.

**Signature:**
```wasm
(func (export "lua_alloc") (param i32 i32 i32 i32) (result i32))
```

**Zig Declaration:**
```zig
export fn lua_alloc(ud: ?*anyopaque, ptr: ?*anyopaque, osize: usize, nsize: usize) ?*anyopaque
```

**Parameters:**
- `ud` (i32) - User data (unused, always null)
- `ptr` (i32) - Pointer to existing allocation (or null for new allocation)
- `osize` (i32/usize) - Old size of allocation (unused)
- `nsize` (i32/usize) - New size requested

**Return Value:**
- Pointer (i32) to allocated memory, or `null` (0) on failure

**Description:**

Custom allocator function used by the Lua VM for all memory operations. Follows Lua's allocator contract:

**Behavior:**
- **Allocation:** `ptr == null, nsize > 0` → Allocate `nsize` bytes
- **Free:** `nsize == 0` → Free memory at `ptr`, return null
- **Reallocation:** `ptr != null, nsize > 0` → Resize allocation to `nsize`

**Implementation:**
```zig
if (nsize == 0) {
    lua_free(ptr);
    return null;
}
return lua_realloc(ptr, nsize);
```

**Error Conditions:**
- Returns null if allocation fails (out of memory)

**Memory Safety:**
- All Lua memory goes through this function
- Uses libc-stubs allocator (dlmalloc-based)
- Allocates from fixed 2 MB heap

**Usage Example:**

Not typically called directly from JavaScript. Used internally by Lua:

```c
// Lua internally calls:
void* mem = lua_alloc(NULL, NULL, 0, 1024);  // Allocate 1 KB
mem = lua_alloc(NULL, mem, 1024, 2048);      // Resize to 2 KB
lua_alloc(NULL, mem, 2048, 0);                // Free
```

**Notes:**
- Exported but not intended for direct JavaScript use
- Critical for Lua VM operation
- `osize` parameter is ignored (not used for validation)

---

## Data Structures

### MemoryStats

Memory statistics structure returned by `get_memory_stats()`.

**Zig Definition:**
```zig
pub const MemoryStats = extern struct {
    io_buffer_size: usize,    // u32 in wasm32
    lua_memory_used: usize,   // u32 in wasm32
    wasm_pages: usize,        // u32 in wasm32
};
```

**Binary Layout (12 bytes):**
```
Offset | Type | Field            | Value
-------|------|------------------|--------
0-3    | u32  | io_buffer_size   | 65536 (64 KB)
4-7    | u32  | lua_memory_used  | 0 (not tracked)
8-11   | u32  | wasm_pages       | 32 (2 MB / 64 KB)
```

**JavaScript Reading:**
```javascript
const view = new DataView(memory.buffer, statsPtr, 12);
const stats = {
  ioBufferSize: view.getUint32(0, true),   // Little-endian
  luaMemoryUsed: view.getUint32(4, true),
  wasmPages: view.getUint32(8, true)
};
```

---

## JavaScript Bridge Functions

The WASM module expects these functions to be provided in the import object under the `env` namespace:

### js_ext_table_set

Store a value in an external table.

**Signature:**
```c
extern fn js_ext_table_set(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize,
    val_ptr: [*]const u8,
    val_len: usize
) c_int;
```

**Parameters:**
- `table_id` - ID of the table
- `key_ptr` - Pointer to key bytes
- `key_len` - Length of key
- `val_ptr` - Pointer to serialized value bytes
- `val_len` - Length of value

**Return:** `0` on success, `-1` on error

---

### js_ext_table_get

Retrieve a value from an external table.

**Signature:**
```c
extern fn js_ext_table_get(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize,
    val_ptr: [*]u8,
    max_len: usize
) c_int;
```

**Parameters:**
- `table_id` - ID of the table
- `key_ptr` - Pointer to key bytes
- `key_len` - Length of key
- `val_ptr` - Pointer to buffer for value (output)
- `max_len` - Maximum buffer size

**Return:** 
- Positive: Number of bytes written
- `-1`: Not found or error

---

### js_ext_table_delete

Delete a key from an external table.

**Signature:**
```c
extern fn js_ext_table_delete(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize
) c_int;
```

**Return:** `0` on success, `-1` on error

---

### js_ext_table_size

Get the number of entries in an external table.

**Signature:**
```c
extern fn js_ext_table_size(table_id: u32) usize;
```

**Return:** Number of entries

---

### js_ext_table_keys

Get all keys from an external table.

**Signature:**
```c
extern fn js_ext_table_keys(
    table_id: u32,
    buf_ptr: [*]u8,
    max_len: usize
) c_int;
```

**Return:** 
- Positive: Number of bytes written
- `-1`: Error or buffer too small

---

## Usage Examples

### Complete Initialization and Execution

```javascript
// 1. Load WASM module
const response = await fetch('./lua.wasm');
const wasmBuffer = await response.arrayBuffer();

// 2. Create import object with external table handlers
const imports = {
  env: {
    js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
      // Store serialized value in JavaScript Map
      const table = getOrCreateTable(tableId);
      const key = readString(keyPtr, keyLen);
      const value = readBytes(valPtr, valLen); // Keep as Uint8Array
      table.set(key, value);
      return 0;
    },
    js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
      const table = tables.get(tableId);
      if (!table) return -1;
      
      const key = readString(keyPtr, keyLen);
      const value = table.get(key);
      if (!value) return -1;
      
      if (value.length > maxLen) return -1;
      writeBytes(valPtr, value);
      return value.length;
    },
    // ... other handlers
  }
};

// 3. Instantiate
const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
const memory = new Uint8Array(instance.exports.memory.buffer);

// 4. Initialize Lua
const initResult = instance.exports.init();
if (initResult !== 0) {
  throw new Error('Lua initialization failed');
}

// 5. Get buffer info
const bufPtr = instance.exports.get_buffer_ptr();
const bufSize = instance.exports.get_buffer_size();

// 6. Execute Lua code
const code = `
  _home.counter = (_home.counter or 0) + 1
  print('Count:', _home.counter)
  return _home.counter
`;

const encoder = new TextEncoder();
const codeBytes = encoder.encode(code);
memory.set(codeBytes, bufPtr);

const resultLen = instance.exports.compute(bufPtr, codeBytes.length);

if (resultLen < 0) {
  // Error
  const errorLen = Math.abs(resultLen) - 1;
  const errorMsg = new TextDecoder().decode(
    memory.slice(bufPtr, bufPtr + errorLen)
  );
  console.error('Lua error:', errorMsg);
} else {
  // Success - parse result
  const resultBytes = memory.slice(bufPtr, bufPtr + resultLen);
  const result = deserializeResult(resultBytes);
  console.log('Result:', result);
}

// 7. Get memory stats
instance.exports.get_memory_stats(bufPtr);
const statsView = new DataView(memory.buffer, bufPtr, 12);
console.log('Memory stats:', {
  bufferSize: statsView.getUint32(0, true),
  luaMemory: statsView.getUint32(4, true),
  wasmPages: statsView.getUint32(8, true)
});
```

### State Persistence and Restoration

```javascript
// Save state
async function saveState() {
  const homeId = instance.exports.get_memory_table_id();
  
  const state = {
    homeTableId: homeId,
    nextTableId: maxTableId + 1,
    tables: Array.from(externalTables.entries()).map(([id, table]) => ({
      id,
      entries: Array.from(table.entries())
    }))
  };
  
  await indexedDB.put('lua-state', state);
}

// Restore state
async function restoreState() {
  const state = await indexedDB.get('lua-state');
  if (!state) return false;
  
  // Recreate tables
  externalTables.clear();
  for (const { id, entries } of state.tables) {
    const table = new Map(entries);
    externalTables.set(id, table);
  }
  
  // Initialize Lua
  instance.exports.init();
  
  // Attach the home table
  if (state.homeTableId) {
    instance.exports.attach_memory_table(state.homeTableId);
  }
  
  // Sync counter
  if (state.nextTableId) {
    instance.exports.sync_external_table_counter(state.nextTableId);
  }
  
  return true;
}
```

---

## Build Information

Generated by: `zig build-exe` with exports defined in `build.sh`

**Export Definitions (from build.sh):**
```bash
--export=init
--export=compute
--export=get_buffer_ptr
--export=get_buffer_size
--export=get_memory_stats
--export=run_gc
--export=attach_memory_table
--export=get_memory_table_id
--export=sync_external_table_counter
--export=set_memory_alias_enabled
```

Note: `lua_alloc` is exported via the `export` keyword in Zig source, not in build.sh.

**Source Files:**
- `src/main.zig` - Main exports and initialization
- `src/ext_table.zig` - External table implementation
- `src/serializer.zig` - Value serialization
- `src/result.zig` - Result encoding
- `src/output.zig` - Output capture
- `src/error.zig` - Error handling
- `src/libc-stubs.zig` - Memory allocator

---

## Version Information

This documentation corresponds to the lua.wasm module as of the current codebase state.

**Lua Version:** 5.4
**Build Target:** wasm32-freestanding
**Zig Compiler:** (version determined by `zig version`)

For the latest updates, see: `docs/CHANGELOG.md`
