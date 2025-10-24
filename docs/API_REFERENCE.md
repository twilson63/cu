# API Reference

## JavaScript API

### Module: lua-api.js

The main interface for interacting with the Lua WASM module.

#### Functions

##### `loadLuaWasm()`
Loads and initializes the Lua WebAssembly module.

**Returns:** `Promise<boolean>` - Success status

**Example:**
```javascript
import lua from './lua-api.js';
await lua.loadLuaWasm();
```

##### `init()`
Initializes the Lua VM. Must be called after `loadLuaWasm()`.

**Returns:** `number` - 0 on success, -1 on failure

**Example:**
```javascript
const result = lua.init();
if (result === 0) {
    console.log('Lua VM initialized successfully');
}
```

##### `compute(code)`
Executes Lua code and returns the serialized result.

**Parameters:**
- `code` (string): Lua code to execute

**Returns:** `number` - Number of bytes in result buffer (negative on error)

**Example:**
```javascript
const resultBytes = lua.compute('return 1 + 1');
const { output, result } = lua.readResult(lua.getBufferPtr(), resultBytes);
console.log(result); // 2
```

##### `readResult(ptr, len)`
Deserializes the result from the buffer.

**Parameters:**
- `ptr` (number): Buffer pointer
- `len` (number): Number of bytes to read

**Returns:** `{ output: string, result: any }` - Deserialized result

##### `saveState()`
Saves all external tables to IndexedDB.

**Returns:** `Promise<boolean>` - Success status

##### `loadState()`
Loads external tables from IndexedDB.

**Returns:** `Promise<boolean>` - Success status

##### `getTableInfo()`
Returns information about current external tables.

**Returns:** `{ tableCount: number, tables: Array }` - Table information

## Lua API

### Module: ext

External table functionality accessible from Lua.

#### Functions

##### `ext.table()`
Creates a new external table that persists in JavaScript memory.

**Returns:** External table object

**Example:**
```lua
local t = ext.table()
t.name = "My Table"
t[1] = "First item"
```

### External Table Methods

External tables support standard Lua table operations:

- **Index access:** `table[key]`
- **Index assignment:** `table[key] = value`
- **Length operator:** `#table` (for array-like tables)

**Example:**
```lua
local data = ext.table()
data.name = "Alice"
data.score = 100

print(data.name)  -- "Alice"
print(data.score) -- 100

-- Iterate over table
for k, v in pairs(data) do
    print(k, v)
end
```

## WebAssembly Exports

### Functions

#### `memory`
The WebAssembly linear memory.

#### `init() -> i32`
Initialize the Lua VM.

#### `compute(code_len: i32) -> i32`
Execute Lua code. Code should be pre-written to the I/O buffer.

#### `get_buffer_ptr() -> i32`
Get the pointer to the I/O buffer.

#### `get_buffer_size() -> i32`
Get the size of the I/O buffer (65536 bytes).

#### `get_memory_stats(stats_ptr: i32)`
Fill a MemoryStats structure with current memory usage.

#### `run_gc()`
Run garbage collection (currently a no-op).

## Serialization Format

Results are serialized using a type-tagged binary format:

### Format Structure
```
[4 bytes: output length]
[N bytes: captured output]
[1 byte: type tag]
[N bytes: value data]
```

### Type Tags
- `0x00`: nil
- `0x01`: boolean (1 byte: 0 or 1)
- `0x02`: integer (8 bytes: little-endian i64)
- `0x03`: float (8 bytes: little-endian f64)
- `0x04`: string (4 bytes length + data)
- `0x05`: table (placeholder)
- `0x06`: function (placeholder)
- `0xFF`: error

## Memory Layout

### Static Allocations
- **Lua Memory Pool:** 512 KB
- **I/O Buffer:** 64 KB
- **Total Static Memory:** ~1.5 MB

### Buffer Usage
The I/O buffer is used for:
1. Input: Lua code to execute
2. Output: Serialized results
3. External table operations

## Error Handling

Errors are indicated by negative return values from `compute()`:
- The absolute value indicates the error message length
- Error messages are stored in the I/O buffer
- Common errors include syntax errors, runtime errors, and memory errors

**Example:**
```javascript
const result = lua.compute('invalid syntax');
if (result < 0) {
    const errorMsg = lua.readBuffer(lua.getBufferPtr(), -result);
    console.error('Lua error:', errorMsg);
}
```

## Browser Compatibility

- **Chrome/Edge:** 80+
- **Firefox:** 79+
- **Safari:** 13.1+
- **Required Features:** WebAssembly, IndexedDB, TextEncoder/TextDecoder

## Performance Considerations

1. **Buffer Size:** Maximum 64KB for input/output per operation
2. **Memory Usage:** ~1.5MB base + Lua heap allocations
3. **External Tables:** No size limit (stored in JavaScript)
4. **Persistence:** IndexedDB operations are asynchronous

## Security Notes

1. Lua code runs in a sandboxed WASM environment
2. No file system access
3. No network access from Lua
4. External tables are isolated per origin
5. Standard Lua libraries are included but restricted