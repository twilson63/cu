# API Reference

## JavaScript API

### Module: cu-api.js

The main interface for interacting with the Cu WASM module.

#### Functions

##### `load(options)`
Loads and instantiates the Lua WebAssembly module.

**Parameters:**
- `options.autoRestore` (boolean, default `true`): Preload persisted tables and metadata before initialization

**Returns:** `Promise<boolean>` - Success status

**Example:**
```javascript
import cu from './cu-api.js';
await cu.load({ autoRestore: true });
```

##### `init()`
Initializes the Lua VM and guarantees `_G._home` points to the active external table (reattached automatically when persisted state exists). Must be called after `load()`.

**Returns:** `number` - 0 on success, -1 on failure

**Example:**
```javascript
const result = cu.init();
if (result === 0) {
    console.log('Lua VM initialized successfully');
}
```

**Note:** For backward compatibility, `_G.Memory` is provided as an alias to `_G._home` but using `_home` is recommended for new code.

##### `compute(code)`
Executes Lua code and returns the serialized result.

**Parameters:**
- `code` (string): Lua code to execute

**Returns:** `number` - Number of bytes in result buffer (negative on error)

**Example:**
```javascript
const resultBytes = cu.compute('return 1 + 1');
const { output, result } = cu.readResult(cu.getBufferPtr(), resultBytes);
console.log(result); // 2
```

##### `readResult(ptr, len)`
Deserializes the result from the buffer.

**Parameters:**
- `ptr` (number): Buffer pointer
- `len` (number): Number of bytes to read

**Returns:** `{ output: string, result: any }` - Deserialized result

##### `saveState()`
Serializes all external tables and metadata (including `homeTableId` and `nextTableId`) to IndexedDB.

**Returns:** `Promise<boolean>` - Success status

##### `loadState()`
Reloads external tables and metadata from IndexedDB, reattaching `_G._home` (and its alias `_G.Memory` for backward compatibility) and resynchronizing Zig table counters.

**Returns:** `Promise<boolean>` - Success status

##### `getTableInfo()`
Returns information about current external tables.

**Returns:** `{ tableCount: number, homeTableId: number|null, nextTableId: number, tables: Array }`

##### `getMemoryTableId()`
**Deprecated:** Use `getHomeTableId()` instead. Returns the numeric identifier backing the home table for debugging and tooling.

**Returns:** `number|null` - Persisted table ID or `null` if uninitialized

##### `getHomeTableId()`
Returns the numeric identifier backing `_G._home` (the persistent home table) for debugging and tooling.

**Returns:** `number|null` - Home table ID or `null` if uninitialized

---

### _io External Table API

The `_io` external table provides a structured input/output channel for exchanging large datasets between JavaScript and Lua, bypassing the 64KB I/O buffer limitation.

#### Functions

##### `getIoTableId()`
Returns the numeric identifier for the `_io` external table.

**Returns:** `number|null` - Table ID or `null` if not initialized

**Example:**
```javascript
const ioId = cu.getIoTableId();
console.log('_io table ID:', ioId);
```

**Use Case:** Debugging, tooling, advanced integrations

---

##### `setInput(data)`
Sets the input data that will be accessible as `_io.input` in Lua.

**Parameters:**
- `data` (any): JavaScript value to pass to Lua. Supported types:
  - Primitives: `null`, `boolean`, `number`, `string`
  - Objects: Plain JavaScript objects (converted to external tables)
  - Arrays: JavaScript arrays (converted to external tables with numeric keys)
  - Nested structures: Objects and arrays can be nested arbitrarily

**Returns:** `void`

**Example:**
```javascript
// Simple object
cu.setInput({
  message: "Hello",
  value: 42,
  flag: true
});

// Nested structure
cu.setInput({
  user: {
    name: "Alice",
    address: {
      city: "NYC",
      zip: "10001"
    }
  },
  items: [
    { id: 1, name: "Item 1" },
    { id: 2, name: "Item 2" }
  ]
});

// Large datasets (beyond 64KB)
cu.setInput({
  data: new Array(100000).fill(0).map((_, i) => ({ id: i, value: Math.random() }))
});
```

**Notes:**
- Replaces any previous input data
- Data is available immediately in the next `compute()` call
- Large datasets are supported (well beyond 64KB)
- Circular references are not supported

---

##### `getOutput()`
Retrieves the output data set by Lua via `_io.output`.

**Returns:** `any` - JavaScript value, matching the structure set in Lua

**Example:**
```javascript
cu.compute(`
  _io.output = {
    result = "processed",
    count = 10,
    items = {1, 2, 3}
  }
`);

const output = cu.getOutput();
console.log(output);
// {
//   result: "processed",
//   count: 10,
//   items: [1, 2, 3]
// }
```

**Notes:**
- Returns `null` if `_io.output` was not set
- Converts Lua tables to JavaScript objects/arrays
- Preserves type information

---

##### `setInputField(key, value)`
Sets a specific field in the `_io.input` table without replacing the entire input.

**Parameters:**
- `key` (string): Field name
- `value` (any): Value to set

**Returns:** `void`

**Example:**
```javascript
// Set individual fields
cu.setInputField('userId', 123);
cu.setInputField('action', 'update');
cu.setInputField('params', { limit: 10 });

// In Lua:
// _io.input.userId == 123
// _io.input.action == "update"
// _io.input.params.limit == 10
```

**Notes:**
- Useful for incremental input construction
- More efficient than replacing entire input for large datasets
- Creates the input table if it doesn't exist

---

##### `getOutputField(key)`
Retrieves a specific field from `_io.output` without deserializing the entire output.

**Parameters:**
- `key` (string): Field name to retrieve

**Returns:** `any` - Value of the field, or `null` if not set

**Example:**
```javascript
cu.compute(`
  _io.output = {
    status = "ok",
    data = { huge = "dataset" },
    timestamp = 1234567890
  }
`);

// Get only what you need
const status = cu.getOutputField('status');
console.log(status); // "ok"
```

**Notes:**
- More efficient than `getOutput()` when you only need specific fields
- Returns `null` for non-existent fields

---

##### `setMetadata(meta)`
Sets metadata in `_io.meta` for tracking and debugging purposes.

**Parameters:**
- `meta` (object): Metadata object

**Returns:** `void`

**Example:**
```javascript
cu.setMetadata({
  requestId: 'req-12345',
  timestamp: Date.now(),
  version: '1.0.0'
});

cu.compute(`
  print("Request ID: " .. _io.meta.requestId)
  -- Process data
`);
```

**Notes:**
- Metadata is separate from input/output
- Useful for request tracking, logging, and debugging
- Not cleared by `clearIo()`

---

##### `clearIo()`
Clears all data in the `_io` table (input, output, and metadata).

**Returns:** `void`

**Example:**
```javascript
// Set some data
cu.setInput({ data: "test" });
cu.compute(`_io.output = { result = "done" }`);

// Clear everything
cu.clearIo();

// _io.input, _io.output, and _io.meta are now nil
```

**Notes:**
- Call before each new request to avoid data leakage
- Resets the `_io` table to a clean state
- Does not affect other external tables like `_home`

---

### IoWrapper Class

High-level wrapper for `_io` table operations, providing convenient methods for common patterns.

**Import:**
```javascript
import { IoWrapper } from './io-wrapper.js';
```

#### Constructor

##### `new IoWrapper()`
Creates a new IoWrapper instance.

**Example:**
```javascript
const io = new IoWrapper();
```

---

#### Methods

##### `computeWithIo(code, inputData, options)`
Execute Lua code with structured input/output via the `_io` table.

This method handles the full lifecycle of an `_io`-based compute operation:
1. Optionally clear previous I/O state
2. Set structured input data to `_io.input`
3. Set metadata to `_io.meta`
4. Execute the Lua code
5. Retrieve output from `_io.output`

**Parameters:**
- `code` (string): Lua code to execute (can access `_io.input`, write to `_io.output`)
- `inputData` (any, optional): Structured input data (objects, arrays, primitives) or `null`
- `options` (object, optional): Configuration options
  - `clearBefore` (boolean): Clear I/O state before execution (default: `true`)
  - `metadata` (object): Additional metadata to attach to `_io.meta`

**Returns:** `Promise<Object>` - Result object with:
- `returnValue` (any): Value returned by the Lua code
- `output` (any): Data from `_io.output`
- `metadata` (object): Metadata object

**Example:**
```javascript
const result = await io.computeWithIo(`
  local user = _io.input.user
  _io.output = {
    fullName = user.firstName .. " " .. user.lastName,
    isAdult = user.age >= 18
  }
`, {
  user: { firstName: "Alice", lastName: "Smith", age: 30 }
});

console.log(result.output.fullName); // "Alice Smith"
console.log(result.output.isAdult);  // true
```

---

##### `processStream(code, dataStream, options)`
Stream processing pattern for large datasets.

Processes a large dataset in batches by repeatedly calling `computeWithIo`. Each batch is provided with metadata about its position in the stream.

**Parameters:**
- `code` (string): Lua code to execute for each batch
- `dataStream` (array): Array of items to process
- `options` (object, optional): Configuration options
  - `batchSize` (number): Number of items per batch (default: `100`)

**Returns:** `Promise<Array>` - Array of output results from each batch

**Example:**
```javascript
const largeDataset = new Array(10000).fill(0).map((_, i) => ({
  id: i,
  value: Math.random()
}));

const results = await io.processStream(`
  local batch = _io.input.batch
  local results = {}
  
  for i, item in ipairs(batch) do
    results[i] = {
      id = item.id,
      processed = true,
      result = item.value * 2
    }
  end
  
  _io.output = {
    results = results,
    batchIndex = _io.input.batchIndex
  }
`, largeDataset, { batchSize: 1000 });

console.log(`Processed ${results.length} batches`);
```

---

##### `request(method, params)`
Request/response pattern for RPC-style API calls.

Provides a standardized way to call Lua functions by method name. The Lua code should define global functions that can be called by name.

**Parameters:**
- `method` (string): Name of the Lua function to call
- `params` (object, optional): Parameters to pass to the function (default: `{}`)

**Returns:** `Promise<Object>` - Result from `computeWithIo`

**Example:**
```javascript
// First, set up Lua handler functions:
await cu.compute(`
  function calculateStats(params)
    local sum = 0
    for _, v in ipairs(params.data) do
      sum = sum + v
    end
    return {
      sum = sum,
      count = #params.data,
      average = sum / #params.data
    }
  end
`);

// Then call via request:
const result = await io.request('calculateStats', {
  data: [1, 2, 3, 4, 5]
});

console.log(result.output);
// { sum: 15, count: 5, average: 3 }
```

**Error Handling:**
```javascript
const result = await io.request('unknownMethod', {});
console.log(result.output.error);
// "Unknown method: unknownMethod"
```

---

## Lua API

### Module: ext

External table functionality accessible from Lua. The runtime exposes persistent globals for external tables:

- **`_G._home`**: Persistent storage that survives save/load cycles (recommended for persistent data)
- **`_G._io`**: Transient I/O table for structured input/output between JavaScript and Lua
- **`_G.Memory`**: Backward compatibility alias to `_G._home` (deprecated, use `_home` instead)

---

### _io Table (Lua Side)

The `_io` table provides structured I/O capabilities accessible from Lua. It is automatically created during initialization and persists across multiple `compute()` calls within the same session (but is cleared between sessions).

#### Fields

##### `_io.input`
Read-only access to input data set by the host via `setInput()`.

**Type:** External table or primitive value

**Example:**
```lua
-- Access simple values
local message = _io.input.message
local count = _io.input.count

-- Access nested structures
local userName = _io.input.user.name
local city = _io.input.user.address.city

-- Iterate arrays
for i, item in ipairs(_io.input.items) do
  print(i, item.name)
end

-- Check for existence
if _io.input.optionalField ~= nil then
  print("Field exists")
end
```

**Notes:**
- Available immediately after `setInput()` is called from JavaScript
- Returns `nil` if no input was set
- External tables support standard Lua table operations

---

##### `_io.output`
Write-only access to output data that will be retrieved by the host via `getOutput()`.

**Type:** External table (assigned by Lua)

**Example:**
```lua
-- Set simple output
_io.output = {
  status = "ok",
  message = "Processing complete"
}

-- Set nested output
_io.output = {
  results = {
    processed = 100,
    errors = 0
  },
  items = {
    {id = 1, status = "done"},
    {id = 2, status = "done"}
  }
}

-- Build output incrementally
local result = ext.table()
result.count = 0
for i, item in ipairs(_io.input.items) do
  result.count = result.count + 1
end
_io.output = result
```

**Notes:**
- Must be assigned a table or primitive value
- Replaces previous output when reassigned
- Can assign multiple times; last assignment wins

---

##### `_io.meta`
Metadata field for request tracking and debugging.

**Type:** External table

**Example:**
```lua
-- Access metadata set by host
print("Request ID: " .. _io.meta.requestId)
print("Version: " .. _io.meta.version)

-- Add runtime metadata
_io.meta.executionTime = os.clock()
_io.meta.itemsProcessed = 100
```

**Notes:**
- Set by host via `setMetadata()`
- Can be modified from Lua
- Useful for logging and debugging

---

### _home Table (Lua Side)

**Backward Compatibility:** `_G.Memory` is provided as an alias to `_G._home` for existing code, but using `_home` is recommended for new code as it better represents the concept of a persistent home for your data.

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
const result = cu.compute('invalid syntax');
if (result < 0) {
    const errorMsg = cu.readBuffer(cu.getBufferPtr(), -result);
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