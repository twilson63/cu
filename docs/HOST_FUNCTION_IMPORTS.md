# Host Function Imports for lua.wasm

This document describes all required host function imports that must be provided when instantiating the `lua.wasm` module. These functions form the bridge between the WASM Lua runtime and external JavaScript storage.

## Overview

The lua.wasm module requires **5 host functions** to be provided in the `env` import namespace. These functions enable external table storage, allowing Lua tables to persist outside of WASM linear memory and survive across sessions.

**Import Namespace:** `env`

**Required Imports:**
1. `js_ext_table_set` - Store a key-value pair
2. `js_ext_table_get` - Retrieve a value by key
3. `js_ext_table_delete` - Remove a key-value pair
4. `js_ext_table_size` - Get table entry count
5. `js_ext_table_keys` - List all table keys

## Data Flow

All data is exchanged via WASM linear memory using pointer+length pairs:
- WASM passes data to host by providing a pointer and length
- Host reads from WASM memory at the specified location
- Host writes results back to WASM memory at provided locations

**Key Serialization:** Keys are UTF-8 encoded strings (for string keys) or decimal number representations (for numeric keys).

**Value Serialization:** Values use a binary format defined in `src/serializer.zig`:
- Type byte (1 byte) followed by type-specific data
- Supports: nil, boolean, integer, float, string, functions
- Function bytecode is preserved as raw binary data

---

## Function: js_ext_table_set

Store a key-value pair in an external table.

### Signature (Zig)
```zig
extern fn js_ext_table_set(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize,
    val_ptr: [*]const u8,
    val_len: usize
) c_int;
```

### Signature (WebAssembly)
```
(func $js_ext_table_set (param i32 i32 i32 i32 i32) (result i32))
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table_id` | `u32` (i32) | Unique identifier for the external table (1+) |
| `key_ptr` | `[*]const u8` (i32) | Pointer to key data in WASM memory |
| `key_len` | `usize` (i32) | Length of key data in bytes |
| `val_ptr` | `[*]const u8` (i32) | Pointer to serialized value in WASM memory |
| `val_len` | `usize` (i32) | Length of serialized value in bytes |

### Return Values

| Value | Meaning |
|-------|---------|
| `0` | Success - key-value pair stored |
| `-1` | Failure - storage error occurred |

### Expected Behavior

1. **Table Creation:** If `table_id` doesn't exist, create a new storage container (e.g., `Map` or object)
2. **Key Extraction:** Read `key_len` bytes from WASM memory starting at `key_ptr`, decode as UTF-8 string
3. **Value Extraction:** Read `val_len` bytes from WASM memory starting at `val_ptr` as raw binary data
4. **Storage:** Store the value bytes (as `Uint8Array` or similar) under the decoded key
5. **Value Preservation:** MUST preserve raw binary data exactly - do not decode or convert values

### When Called

- When Lua code assigns a value to an external table: `_home.mykey = "value"`
- When storing function bytecode for persistence
- During table initialization and restoration

### Error Handling

Return `-1` if:
- Memory access fails (invalid pointer or length)
- Storage backend throws an exception
- Out of memory condition

### Reference Implementation (JavaScript)

```javascript
js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
  try {
    // Ensure table exists (create if needed)
    const table = ensureExternalTable(table_id);
    
    // Decode key from WASM memory
    const key = new TextDecoder().decode(
      wasmMemory.slice(key_ptr, key_ptr + key_len)
    );
    
    // Extract value bytes (preserve as binary - do NOT decode)
    const valueBytes = wasmMemory.slice(val_ptr, val_ptr + val_len);
    const valueCopy = new Uint8Array(valueBytes); // Make a copy
    
    // Store value
    table.set(key, valueCopy);
    return 0;
  } catch (e) {
    console.error('js_ext_table_set error:', e);
    return -1;
  }
}
```

### Common Pitfalls

- **DO NOT** decode value bytes as strings - they contain binary serialized data
- **DO** make a copy of value bytes before storing (WASM memory can be reallocated)
- **DO** handle Unicode keys correctly (use TextDecoder, not simple byte conversion)
- **DO** create the table lazily if it doesn't exist

---

## Function: js_ext_table_get

Retrieve a value by key from an external table.

### Signature (Zig)
```zig
extern fn js_ext_table_get(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize,
    val_ptr: [*]u8,
    max_len: usize
) c_int;
```

### Signature (WebAssembly)
```
(func $js_ext_table_get (param i32 i32 i32 i32 i32) (result i32))
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table_id` | `u32` (i32) | Table identifier to query |
| `key_ptr` | `[*]const u8` (i32) | Pointer to key data in WASM memory |
| `key_len` | `usize` (i32) | Length of key data in bytes |
| `val_ptr` | `[*]u8` (i32) | Pointer to destination buffer in WASM memory |
| `max_len` | `usize` (i32) | Maximum bytes that can be written to destination buffer |

### Return Values

| Value | Meaning |
|-------|---------|
| `> 0` | Success - number of bytes written to `val_ptr` |
| `-1` | Failure - table doesn't exist, key not found, value too large, or error |

### Expected Behavior

1. **Table Lookup:** Find the table with `table_id` (return -1 if not found)
2. **Key Extraction:** Read `key_len` bytes from `key_ptr`, decode as UTF-8
3. **Value Lookup:** Find the value for the decoded key (return -1 if not found)
4. **Size Check:** If value length > `max_len`, return -1 (buffer too small)
5. **Value Copy:** Copy value bytes to WASM memory starting at `val_ptr`
6. **Return Length:** Return actual number of bytes written

### When Called

- When Lua code reads from an external table: `local x = _home.mykey`
- During table iteration
- When deserializing persisted state

### Error Handling

Return `-1` if:
- `table_id` doesn't exist
- Key is not found in table
- Value length exceeds `max_len` (buffer overflow protection)
- Memory access fails
- Storage backend throws an exception

### Reference Implementation (JavaScript)

```javascript
js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
  try {
    const table = externalTables.get(table_id);
    if (!table) return -1; // Table doesn't exist
    
    // Decode key
    const key = new TextDecoder().decode(
      wasmMemory.slice(key_ptr, key_ptr + key_len)
    );
    
    const value = table.get(key);
    if (value === undefined) return -1; // Key not found
    
    // Handle binary data (Uint8Array) or legacy string data
    let valueBytes;
    if (value instanceof Uint8Array) {
      valueBytes = value;
    } else if (typeof value === 'string') {
      // Legacy support for old string values
      valueBytes = new TextEncoder().encode(value);
    } else {
      return -1;
    }
    
    // Buffer overflow check
    if (valueBytes.length > max_len) return -1;
    
    // Copy to WASM memory
    for (let i = 0; i < valueBytes.length; i++) {
      wasmMemory[val_ptr + i] = valueBytes[i];
    }
    
    return valueBytes.length;
  } catch (e) {
    console.error('js_ext_table_get error:', e);
    return -1;
  }
}
```

### Common Pitfalls

- **DO** check buffer size before writing (prevent buffer overflows)
- **DO** return -1 for missing keys (not 0, which could indicate empty value)
- **DO** support legacy string values for backward compatibility if needed
- **DO NOT** modify the stored value during retrieval

---

## Function: js_ext_table_delete

Remove a key-value pair from an external table.

### Signature (Zig)
```zig
extern fn js_ext_table_delete(
    table_id: u32,
    key_ptr: [*]const u8,
    key_len: usize
) c_int;
```

### Signature (WebAssembly)
```
(func $js_ext_table_delete (param i32 i32 i32) (result i32))
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table_id` | `u32` (i32) | Table identifier |
| `key_ptr` | `[*]const u8` (i32) | Pointer to key data in WASM memory |
| `key_len` | `usize` (i32) | Length of key data in bytes |

### Return Values

| Value | Meaning |
|-------|---------|
| `0` | Success - key deleted (or didn't exist) |
| `-1` | Failure - table doesn't exist or error occurred |

### Expected Behavior

1. **Table Lookup:** Find the table with `table_id` (return -1 if not found)
2. **Key Extraction:** Read `key_len` bytes from `key_ptr`, decode as UTF-8
3. **Deletion:** Remove the key-value pair from the table
4. **Idempotent:** Deleting a non-existent key is not an error (return 0)

### When Called

- When Lua code sets a table value to `nil`: `_home.mykey = nil`
- During table cleanup operations
- When clearing persisted state

### Error Handling

Return `-1` if:
- `table_id` doesn't exist
- Memory access fails
- Storage backend throws an exception

**Note:** Deleting a non-existent key should return `0` (success), not `-1`.

### Reference Implementation (JavaScript)

```javascript
js_ext_table_delete: (table_id, key_ptr, key_len) => {
  try {
    const table = externalTables.get(table_id);
    if (!table) return -1; // Table doesn't exist
    
    // Decode key
    const key = new TextDecoder().decode(
      wasmMemory.slice(key_ptr, key_ptr + key_len)
    );
    
    // Delete key (idempotent - doesn't error if key missing)
    table.delete(key);
    return 0;
  } catch (e) {
    console.error('js_ext_table_delete error:', e);
    return -1;
  }
}
```

### Common Pitfalls

- **DO** return 0 for successful deletion even if key didn't exist
- **DO NOT** throw errors for missing keys (deletion is idempotent)

---

## Function: js_ext_table_size

Get the number of key-value pairs in an external table.

### Signature (Zig)
```zig
extern fn js_ext_table_size(table_id: u32) usize;
```

### Signature (WebAssembly)
```
(func $js_ext_table_size (param i32) (result i32))
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table_id` | `u32` (i32) | Table identifier |

### Return Values

| Value | Meaning |
|-------|---------|
| `>= 0` | Number of entries in the table |
| `0` | Empty table or table doesn't exist |

### Expected Behavior

1. **Table Lookup:** Find the table with `table_id`
2. **Count Entries:** Return the number of key-value pairs
3. **Missing Table:** Return 0 if table doesn't exist (not an error)

### When Called

- When Lua code uses the length operator: `#_home`
- During debugging and introspection
- For optimization decisions

### Error Handling

Return `0` if:
- `table_id` doesn't exist (treated as empty table)
- Table is actually empty
- Storage backend throws an exception (fallback to 0)

**Note:** This function cannot distinguish between an empty table and a non-existent table. Both return 0.

### Reference Implementation (JavaScript)

```javascript
js_ext_table_size: (table_id) => {
  const table = externalTables.get(table_id);
  return table ? table.size : 0;
}
```

### Common Pitfalls

- **DO** return 0 for non-existent tables (not throw an error)
- **DO** ensure the count is accurate and up-to-date

---

## Function: js_ext_table_keys

Get a newline-separated list of all keys in an external table.

### Signature (Zig)
```zig
extern fn js_ext_table_keys(
    table_id: u32,
    buf_ptr: [*]u8,
    max_len: usize
) c_int;
```

### Signature (WebAssembly)
```
(func $js_ext_table_keys (param i32 i32 i32) (result i32))
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `table_id` | `u32` (i32) | Table identifier |
| `buf_ptr` | `[*]u8` (i32) | Pointer to destination buffer in WASM memory |
| `max_len` | `usize` (i32) | Maximum bytes that can be written to buffer |

### Return Values

| Value | Meaning |
|-------|---------|
| `>= 0` | Success - number of bytes written to buffer |
| `-1` | Failure - table doesn't exist, buffer too small, or error |

### Expected Behavior

1. **Table Lookup:** Find the table with `table_id` (return -1 if not found)
2. **Key Collection:** Get all keys from the table
3. **Formatting:** Join keys with newline characters (`\n`)
4. **Encoding:** Encode the result as UTF-8
5. **Size Check:** If encoded length > `max_len`, return -1
6. **Copy:** Write encoded bytes to WASM memory at `buf_ptr`
7. **Return Length:** Return actual bytes written

### When Called

- When iterating over external tables with `pairs()` or `ipairs()`
- For debugging and inspection
- During serialization of table state

### Output Format

Keys are joined with newline (`\n`) characters. For example, if a table has keys `"name"`, `"score"`, and `"level"`, the output buffer would contain:

```
name\nscore\nlevel
```

**Empty Tables:** If the table has no keys, return 0 (not -1) with an empty buffer.

### Error Handling

Return `-1` if:
- `table_id` doesn't exist
- Encoded keys string exceeds `max_len` (buffer too small)
- Memory access fails
- Storage backend throws an exception

**Exception:** Return `0` (not -1) for empty tables with zero keys.

### Reference Implementation (JavaScript)

```javascript
js_ext_table_keys: (table_id, buf_ptr, max_len) => {
  try {
    const table = externalTables.get(table_id);
    if (!table) return -1; // Table doesn't exist
    
    // Join all keys with newlines
    const keys = Array.from(table.keys()).join('\n');
    const keysBytes = new TextEncoder().encode(keys);
    
    // Buffer overflow check
    if (keysBytes.length > max_len) return -1;
    
    // Copy to WASM memory
    for (let i = 0; i < keysBytes.length; i++) {
      wasmMemory[buf_ptr + i] = keysBytes[i];
    }
    
    return keysBytes.length;
  } catch (e) {
    console.error('js_ext_table_keys error:', e);
    return -1;
  }
}
```

### Common Pitfalls

- **DO** return 0 (not -1) for empty tables
- **DO** check buffer size before writing
- **DO** use newline (`\n`) as delimiter (not null bytes or other separators)
- **DO** handle Unicode keys correctly
- **DO NOT** include trailing newline after the last key

---

## Memory Management

### WASM Linear Memory

All host functions access WASM linear memory through the `memory` export. The reference implementation typically stores this as a `Uint8Array` view:

```javascript
wasmMemory = new Uint8Array(wasmInstance.exports.memory.buffer);
```

**Important:** Memory can be reallocated (grown) by WASM, so always use fresh views or check memory validity.

### Buffer Sizes

The WASM module uses a shared I/O buffer of **64KB** (`IO_BUFFER_SIZE = 64 * 1024`). The buffer is partitioned for different operations:

- **Key buffer:** First 1/4 of buffer (16KB)
- **Value buffer:** Second 1/4 of buffer (16KB)
- **Remaining:** Used for other I/O operations

Host functions must respect `max_len` parameters to prevent buffer overflows.

### Data Copying

When storing data from WASM memory (in `set` operations):
- **DO** make a copy of the data before storing
- **DO NOT** store direct references to WASM memory (it can be reallocated)

```javascript
// CORRECT: Copy data
const valueCopy = new Uint8Array(wasmMemory.slice(val_ptr, val_ptr + val_len));
table.set(key, valueCopy);

// WRONG: Direct reference (will break on memory reallocation)
const directRef = wasmMemory.subarray(val_ptr, val_ptr + val_len);
table.set(key, directRef); // BAD!
```

---

## Table ID Management

### ID Allocation

- Table IDs start at `1` (not 0)
- ID `0` is reserved/invalid
- The WASM module maintains a counter: `external_table_counter` (starts at 1)
- Each new table increments the counter

### Special Table IDs

- **Home Table (`_home`):** A special table created at initialization that serves as the primary persistent storage. Its ID is tracked separately as `memory_table_id` (in WASM) and `homeTableId` (in JavaScript).
- **Legacy Alias:** The home table was previously called `Memory` for backward compatibility.

### ID Synchronization

The host should track the next available ID and synchronize with WASM:

```javascript
let nextTableId = 1;

// After loading persisted state
if (wasmInstance.exports.sync_external_table_counter) {
  wasmInstance.exports.sync_external_table_counter(nextTableId);
}
```

### Table Lifecycle

1. **Creation:** WASM calls `js_ext_table_set` with a new ID
2. **Host Creates:** Host lazily creates table on first access
3. **Usage:** WASM performs get/set/delete operations
4. **Persistence:** Host serializes tables to IndexedDB
5. **Restoration:** Host restores tables on next load
6. **Reattachment:** WASM reattaches to persisted table IDs

---

## Persistence Integration

The reference implementation (`web/cu-api.js`) integrates with IndexedDB through `lua-persistence.js`:

### Saving State

```javascript
export async function saveState() {
  const metadata = {
    homeTableId,
    nextTableId,
    savedAt: new Date().toISOString()
  };
  await persistence.saveTables(externalTables, metadata);
}
```

### Loading State

```javascript
export async function loadState() {
  const { tables, metadata } = await persistence.loadTables();
  
  // Restore tables
  externalTables.clear();
  for (const [id, entries] of tables) {
    const table = ensureExternalTable(Number(id));
    for (const [key, value] of entries) {
      table.set(key, value);
    }
  }
  
  // Restore metadata
  homeTableId = metadata.homeTableId;
  nextTableId = metadata.nextTableId;
  
  // Sync with WASM
  if (wasmInstance.exports.sync_external_table_counter) {
    wasmInstance.exports.sync_external_table_counter(nextTableId);
  }
  if (homeTableId && wasmInstance.exports.attach_memory_table) {
    wasmInstance.exports.attach_memory_table(homeTableId);
  }
}
```

---

## Complete Example

Here's a minimal working implementation of all host functions:

```javascript
// Storage for external tables
const externalTables = new Map();
let nextTableId = 1;
let wasmMemory = null;

function ensureExternalTable(tableId) {
  const id = Number(tableId);
  if (!externalTables.has(id)) {
    externalTables.set(id, new Map());
  }
  if (id >= nextTableId) {
    nextTableId = id + 1;
  }
  return externalTables.get(id);
}

// WebAssembly imports
const imports = {
  env: {
    js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
      try {
        const table = ensureExternalTable(table_id);
        const key = new TextDecoder().decode(
          wasmMemory.slice(key_ptr, key_ptr + key_len)
        );
        const valueBytes = wasmMemory.slice(val_ptr, val_ptr + val_len);
        const valueCopy = new Uint8Array(valueBytes);
        table.set(key, valueCopy);
        return 0;
      } catch (e) {
        console.error('js_ext_table_set error:', e);
        return -1;
      }
    },

    js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
      try {
        const table = externalTables.get(table_id);
        if (!table) return -1;
        
        const key = new TextDecoder().decode(
          wasmMemory.slice(key_ptr, key_ptr + key_len)
        );
        const value = table.get(key);
        if (value === undefined) return -1;
        
        const valueBytes = value instanceof Uint8Array 
          ? value 
          : new TextEncoder().encode(String(value));
        
        if (valueBytes.length > max_len) return -1;
        
        for (let i = 0; i < valueBytes.length; i++) {
          wasmMemory[val_ptr + i] = valueBytes[i];
        }
        
        return valueBytes.length;
      } catch (e) {
        console.error('js_ext_table_get error:', e);
        return -1;
      }
    },

    js_ext_table_delete: (table_id, key_ptr, key_len) => {
      try {
        const table = externalTables.get(table_id);
        if (!table) return -1;
        
        const key = new TextDecoder().decode(
          wasmMemory.slice(key_ptr, key_ptr + key_len)
        );
        table.delete(key);
        return 0;
      } catch (e) {
        console.error('js_ext_table_delete error:', e);
        return -1;
      }
    },

    js_ext_table_size: (table_id) => {
      const table = externalTables.get(table_id);
      return table ? table.size : 0;
    },

    js_ext_table_keys: (table_id, buf_ptr, max_len) => {
      try {
        const table = externalTables.get(table_id);
        if (!table) return -1;
        
        const keys = Array.from(table.keys()).join('\n');
        const keysBytes = new TextEncoder().encode(keys);
        
        if (keysBytes.length > max_len) return -1;
        
        for (let i = 0; i < keysBytes.length; i++) {
          wasmMemory[buf_ptr + i] = keysBytes[i];
        }
        
        return keysBytes.length;
      } catch (e) {
        console.error('js_ext_table_keys error:', e);
        return -1;
      }
    }
  }
};

// Instantiate WASM
async function loadWasm() {
  const response = await fetch('./lua.wasm');
  const buffer = await response.arrayBuffer();
  const module = new WebAssembly.Module(buffer);
  const instance = new WebAssembly.Instance(module, imports);
  
  wasmMemory = new Uint8Array(instance.exports.memory.buffer);
  
  return instance;
}
```

---

## Testing Host Functions

### Unit Tests

Test each function in isolation:

```javascript
// Test set/get round-trip
js_ext_table_set(1, keyPtr, keyLen, valPtr, valLen);
const result = js_ext_table_get(1, keyPtr, keyLen, outPtr, maxLen);
assert(result > 0);

// Test deletion
js_ext_table_delete(1, keyPtr, keyLen);
const result2 = js_ext_table_get(1, keyPtr, keyLen, outPtr, maxLen);
assert(result2 === -1); // Key should not exist

// Test size
const size = js_ext_table_size(1);
assert(size === 0); // After deletion

// Test keys listing
js_ext_table_set(1, key1Ptr, key1Len, val1Ptr, val1Len);
js_ext_table_set(1, key2Ptr, key2Len, val2Ptr, val2Len);
const keysLen = js_ext_table_keys(1, bufPtr, maxLen);
assert(keysLen > 0);
```

### Integration Tests

Test with actual Lua code:

```lua
-- Test basic operations
_home.test = "value"
assert(_home.test == "value")

_home.test = nil
assert(_home.test == nil)

-- Test table size
_home.a = 1
_home.b = 2
assert(#_home == 2)

-- Test iteration
local count = 0
for k, v in pairs(_home) do
    count = count + 1
end
assert(count == 2)
```

### Edge Cases

- Empty tables
- Large values (near buffer limits)
- Unicode keys with multi-byte characters
- Function persistence (binary bytecode)
- Non-existent table IDs
- Buffer overflow scenarios
- Concurrent access (if applicable)

---

## Alternative Implementations

While the reference implementation uses JavaScript with `Map` storage, host functions can be implemented in any language that can interface with WebAssembly:

### Python (with wasmtime)

```python
from wasmtime import Store, Module, Instance, Func, FuncType

tables = {}

def js_ext_table_set(table_id, key_ptr, key_len, val_ptr, val_len):
    try:
        if table_id not in tables:
            tables[table_id] = {}
        key = memory[key_ptr:key_ptr + key_len].decode('utf-8')
        value = bytes(memory[val_ptr:val_ptr + val_len])
        tables[table_id][key] = value
        return 0
    except:
        return -1

# Define function type and wrap
set_type = FuncType([ValType.i32()] * 5, [ValType.i32()])
set_func = Func(store, set_type, js_ext_table_set)
```

### Rust (with wasmtime)

```rust
use std::collections::HashMap;
use wasmtime::*;

struct TableStore {
    tables: HashMap<u32, HashMap<String, Vec<u8>>>,
}

fn js_ext_table_set(
    mut caller: Caller<'_, TableStore>,
    table_id: u32,
    key_ptr: u32,
    key_len: u32,
    val_ptr: u32,
    val_len: u32,
) -> Result<i32> {
    let memory = caller.get_export("memory")
        .and_then(|e| e.into_memory())
        .ok_or_else(|| anyhow::anyhow!("memory not found"))?;
    
    let data = memory.data(&caller);
    
    let key_bytes = &data[key_ptr as usize..(key_ptr + key_len) as usize];
    let key = String::from_utf8(key_bytes.to_vec())?;
    
    let val_bytes = &data[val_ptr as usize..(val_ptr + val_len) as usize];
    
    let state = caller.data_mut();
    state.tables
        .entry(table_id)
        .or_insert_with(HashMap::new)
        .insert(key, val_bytes.to_vec());
    
    Ok(0)
}
```

---

## Summary

To successfully instantiate and run `lua.wasm`, you must:

1. **Provide all 5 host functions** in the `env` namespace
2. **Access WASM linear memory** correctly using pointer+length parameters
3. **Preserve binary data** exactly (don't decode values)
4. **Handle errors gracefully** by returning appropriate codes
5. **Respect buffer limits** to prevent overflows
6. **Manage table IDs** with proper synchronization
7. **Support persistence** for long-term state storage

The reference implementation in `web/cu-api.js` (lines 127-216) provides a battle-tested example that handles all edge cases and integrates with IndexedDB for persistence.

## See Also

- `web/cu-api.js:127-216` - Reference implementation
- `src/ext_table.zig:8-12` - WASM function declarations
- `src/serializer.zig` - Value serialization format
- `docs/ARCHITECTURE.md` - System architecture overview
- `docs/API_REFERENCE.md` - Public API documentation
