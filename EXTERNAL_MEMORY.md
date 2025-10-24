# External Memory Architecture

## Overview

The Lua Persistent WASM module uses a clever external memory model where:
- **Linear WASM Memory**: Stays small (~2MB) - used only for Lua VM state
- **External JavaScript Maps**: Store all user data - can grow unlimited  
- **FFI Bridge**: Transparent connection between Zig and JavaScript

This prevents WASM linear memory from growing while allowing unlimited data storage.

## Architecture Diagram

```
JavaScript Browser
├─ Map<table_id, Map<key, value>>     [External Storage - Unlimited]
│  ├─ table_id=1 → {key1: data1, key2: data2, ...}
│  ├─ table_id=2 → {keyA: dataA, keyB: dataB, ...}
│  └─ table_id=N → {... more data ...}
│
└─ WebAssembly.Memory (2MB)           [Linear Memory - Fixed]
   ├─ IO Buffer (64KB) - code input/output
   ├─ Heap Space - Lua state
   ├─ Stack - local variables  
   └─ Globals - counters, table IDs
```

## External Table API

### Zig Functions (Exported to JavaScript)

```zig
ext_table_new() -> u32
    Create a new external table
    Returns: unique table ID

ext_table_set(table_id, key, key_len, value, val_len) -> c_int
    Store a value in external table
    Returns: 0 on success, <0 on error

ext_table_get(table_id, key, key_len, value, max_len) -> c_int
    Retrieve a value from external table
    Returns: bytes read, -1 if not found

ext_table_delete(table_id, key, key_len) -> c_int
    Delete a key from external table
    Returns: 0 on success

ext_table_size(table_id) -> usize
    Get number of items in table
    Returns: table size

ext_table_keys(table_id, buffer, max_len) -> c_int
    Get all keys from table (for iteration)
    Returns: bytes written, <=0 on error
```

### JavaScript Imports (Callbacks)

```javascript
js_ext_table_set(table_id, key_ptr, key_len, val_ptr, val_len)
    Store in JS Map: maps.get(table_id).set(key_bytes, val_bytes)

js_ext_table_get(table_id, key_ptr, key_len, val_ptr, max_len)
    Retrieve from JS Map: maps.get(table_id).get(key_bytes)

js_ext_table_delete(table_id, key_ptr, key_len)
    Delete from JS Map: maps.get(table_id).delete(key_bytes)

js_ext_table_size(table_id)
    Get table size: maps.get(table_id).size

js_ext_table_keys(table_id, buf_ptr, max_len)
    List all keys: maps.get(table_id).keys()
```

## Usage from Lua

### Creating External Tables

```lua
-- Get or create external table
local data = ext.table()  -- Creates new table with ID
local users = ext.table()

-- Store data (serialized through WASM)
data["key1"] = "value1"
data["counter"] = 42
data["nested"] = {x=1, y=2}

-- Retrieve data
print(data["key1"])  -- "value1"
print(data["counter"])  -- 42

-- Delete data
data["key1"] = nil  -- Deletes the key

-- Iterate (through keys)
for k in pairs(data) do
    print(k .. " = " .. tostring(data[k]))
end
```

## Serialization Format

Values are type-tagged bytes:

```
Nil:     0x00
Boolean: 0x01 + 0x00|0x01
Integer: 0x02 + 8 bytes (i64, little-endian)
Number:  0x03 + 8 bytes (f64, little-endian)  
String:  0x04 + 4 bytes (len) + string bytes
```

## Memory Efficiency

### Traditional Lua in WASM
```
Lua VM Code:     ~2MB
User Data:       Stored in heap
Total Memory:    Linear grows with data size
Problem:         WASM max memory limits hit quickly
```

### External Table Approach
```
WASM Linear Memory:  ~2MB (fixed)
├─ Lua VM
├─ IO Buffer  
└─ Heap (small)

JavaScript Maps:     Unlimited size
└─ User data (external)

Total:              Lua VM (2MB) + Data (∞ from JS)
Benefit:            No WASM memory limit
```

## Storage Limits

### Without External Tables
- Max data: ~4MB WASM memory
- Problem: Runs out quickly

### With External Tables
- Lua VM: 2MB (fixed)
- Data: Limited by browser
  - Chrome: ~1-2GB available
  - Firefox: ~1-2GB available
  - Safari: ~256MB-1GB
- Real limit: Practical browser performance

## Implementation Status

### ✅ Completed
- [x] Zig FFI bridge (`ext_table_*` functions)
- [x] JavaScript import callbacks (`js_ext_table_*`)
- [x] Serialization format (type-tagged bytes)
- [x] External table ID generation
- [x] Memory layout design

### 🔄 Pending
- [ ] Lua C binding for `ext` table creation
- [ ] Implement `ext.table()` in Lua
- [ ] Full serialization/deserialization in Lua
- [ ] Persistence to localStorage
- [ ] Testing with large datasets (1000+ items)

## Testing & Validation

###Quick Test (JavaScript)
```javascript
const mod = await loadWasm();

// Create external table
const tableId = mod.ext_table_new();

// Store a value
const key = "test_key";
const value = "test_value";
mod.ext_table_set(tableId, key, key.length, value, value.length);

// Retrieve it
const buffer = new Uint8Array(256);
const len = mod.ext_table_get(tableId, key, key.length, buffer, buffer.length);
const result = new TextDecoder().decode(buffer.slice(0, len));
console.log(result);  // "test_value"
```

### Integration Test (Lua)
```lua
-- Create external storage
local users = ext.table()

-- Store 10000 items
for i = 1, 10000 do
    users["user_" .. i] = "data_" .. i
end

-- Check size
print("Total users: " .. ext.table_size(users))  -- 10000

-- Memory is external, not in WASM heap
```

## Architecture Benefits

1. **Unlimited Data**: Store GB of data without hitting WASM limits
2. **Fixed Memory**: WASM always uses ~2MB regardless of data size
3. **Transparent**: Lua code works naturally, doesn't know data is external
4. **Fast Access**: JavaScript Map has O(1) lookup performance
5. **Persistence**: Easy to save/load Maps to localStorage or IndexedDB

## Next Steps

1. **Connect Lua**: Bind Lua C API to Zig FFI functions
2. **Add Serialization**: Implement proper Lua value serialization
3. **Implement ext.table()**: Make Lua table creation work
4. **Test at Scale**: Verify 1M+ item handling
5. **Add Persistence**: Save/restore from browser storage

---

This architecture allows Lua to be used in the browser without memory limitations while keeping the WASM module size minimal.
