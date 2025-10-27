# Project Request Protocol: _io External Table for Structured Data I/O

## Project Overview

### Problem Statement

The current Compute Unit (CU) architecture has a critical limitation: all input and output data must pass through a 64KB I/O buffer in WASM linear memory. This creates several problems:

1. **Size Constraints**: Cannot process datasets larger than 64KB
2. **Serialization Overhead**: Must serialize/deserialize all data through strings or primitives
3. **Type Loss**: Complex Lua tables cannot be returned to the host
4. **Memory Pressure**: All data must fit in WASM memory simultaneously
5. **Stack Growth**: Large inputs/outputs require growing the WASM stack

### Proposed Solution

Implement a standardized `_io` external table that serves as a structured input/output channel between the host (JavaScript) and the CU (Lua). This table would work alongside `_home` (persistent storage) to provide:

- **`_home`**: Persistent memory/storage across sessions
- **`_io`**: Transient input/output channel for each compute call

### Goals

1. Enable passing arbitrarily large structured data to Lua
2. Enable receiving arbitrarily large structured data from Lua
3. Bypass the 64KB I/O buffer limitation
4. Preserve type information (tables, arrays, nested structures)
5. Maintain backwards compatibility with existing code
6. Enable lazy loading/streaming for memory efficiency

### Non-Goals

- Replacing the existing I/O buffer (still needed for simple returns)
- Changing the `_home` table behavior
- Modifying the core serialization protocol
- Real-time streaming during execution (batch I/O only)

## Technical Requirements

### Functional Requirements

**FR1**: Create `_io` external table during CU initialization
- Must be globally accessible as `_G._io`
- Must have a stable table ID
- Must survive across multiple compute() calls within same session

**FR2**: Host API for writing input data
```javascript
cu.setInput(data)  // Write structured data to _io.input
cu.setInputField(key, value)  // Write specific field
```

**FR3**: Host API for reading output data
```javascript
cu.getOutput()  // Read entire _io.output
cu.getOutputField(key)  // Read specific field
```

**FR4**: Host API for clearing I/O state
```javascript
cu.clearIo()  // Reset _io table between calls
```

**FR5**: Lua access to input/output
```lua
local data = _io.input  -- Read input from host
_io.output = result     -- Write output to host
_io.meta = metadata     -- Optional metadata
```

**FR6**: Support for nested structures
- Tables within tables
- Arrays of objects
- Mixed type values
- Preserve type information through binary protocol

**FR7**: Lazy loading capability
- Don't load entire input into WASM memory
- Load values on-demand as accessed
- Enable garbage collection of accessed values

### Non-Functional Requirements

**NFR1**: Performance
- Zero-copy access where possible
- Minimal serialization overhead
- No degradation for small datasets

**NFR2**: Memory Efficiency
- Support datasets larger than WASM memory
- Incremental processing capability
- Efficient garbage collection

**NFR3**: Backwards Compatibility
- Existing code continues to work
- Optional feature - can be ignored
- No breaking changes to API

**NFR4**: Developer Experience
- Clear, intuitive API
- Comprehensive documentation
- Example code and patterns

**NFR5**: Reliability
- Proper error handling
- Validation of data types
- Clear error messages

## Proposed Solutions

### Solution 1: Simple _io Table with Eager Loading

**Description**: Create `_io` as a standard external table with three sub-tables: `input`, `output`, and `meta`. All data is loaded into external storage when set, and fully accessed when read.

**Architecture**:
```javascript
// Host side
const ioTableId = getIoTableId();
externalTables.set(ioTableId, new Map([
  ['input', serializeValue(inputData)],
  ['output', null],
  ['meta', null]
]));
```

```lua
-- Lua side
_io.input  -- Accesses entire input table
_io.output = result  -- Stores entire output table
```

**Implementation Steps**:
1. Create `_io` table during `init()`
2. Expose table ID to JavaScript
3. Add helper functions: `setInput()`, `getOutput()`, `clearIo()`
4. Document usage patterns

**Pros**:
- ✅ Simple to implement
- ✅ Easy to understand
- ✅ Minimal code changes
- ✅ Backwards compatible
- ✅ Leverages existing external table infrastructure

**Cons**:
- ❌ Not truly lazy - loads entire structure when accessed
- ❌ No automatic GC of accessed values
- ❌ Still memory-constrained for very large datasets
- ❌ No streaming capability

**Complexity**: Low (2-3 days)

---

### Solution 2: Lazy-Loading _io with Proxy Metatables

**Description**: Implement `_io.input` and `_io.output` as proxy tables with metatables that lazy-load values from external storage only when accessed. Uses `__index` and `__newindex` metamethods.

**Architecture**:
```lua
-- Lua side (internal implementation)
local io_input_mt = {
  __index = function(t, key)
    -- Lazy load from external storage
    return ext_table_get_io_value("input", key)
  end
}

_io.input = setmetatable({}, io_input_mt)
```

```javascript
// Host side
const ioStorage = {
  input: new Map(),  // Stores serialized values
  output: new Map(),
  meta: new Map()
};

// Only accessed values are deserialized
function getIoValue(section, key) {
  return ioStorage[section].get(key);
}
```

**Implementation Steps**:
1. Create specialized metatables for `_io.input` and `_io.output`
2. Implement lazy `__index` and `__newindex` handlers
3. Add reference counting/GC hints
4. Create JavaScript storage manager
5. Add streaming access patterns

**Pros**:
- ✅ True lazy loading - only loads accessed values
- ✅ Better memory efficiency
- ✅ Enables processing datasets larger than WASM memory
- ✅ Can GC values after processing
- ✅ Supports streaming patterns

**Cons**:
- ❌ More complex implementation
- ❌ Metatable overhead on every access
- ❌ Harder to debug
- ❌ Requires careful memory management
- ❌ Nested table access requires special handling

**Complexity**: Medium-High (5-7 days)

---

### Solution 3: Hybrid Approach with Smart Caching

**Description**: Combine Solution 1 and 2 - use simple external table for small datasets (< 1MB), automatically switch to lazy-loading proxy for large datasets. Best of both worlds.

**Architecture**:
```javascript
// Host side
class IoManager {
  setInput(data) {
    const size = estimateSize(data);
    
    if (size < EAGER_THRESHOLD) {
      // Use simple external table (Solution 1)
      this.useEagerMode(data);
    } else {
      // Use lazy proxy (Solution 2)
      this.useLazyMode(data);
    }
  }
}
```

```lua
-- Lua side (transparent to user)
_io.input.userId  -- Works same way regardless of mode
```

**Implementation Steps**:
1. Implement Solution 1 (simple mode)
2. Add size estimation logic
3. Implement lazy-loading proxy for large data
4. Add mode switching logic
5. Create unified API that works for both modes
6. Add configuration for threshold tuning

**Pros**:
- ✅ Optimal for all data sizes
- ✅ Simple for common cases
- ✅ Scales to large datasets
- ✅ Transparent to users
- ✅ Can tune performance via thresholds
- ✅ Better developer experience

**Cons**:
- ❌ Most complex implementation
- ❌ Two code paths to maintain
- ❌ Threshold tuning may be application-specific
- ❌ Potential edge cases at mode boundary

**Complexity**: High (7-10 days)

---

## Solution Comparison Matrix

| Criteria | Solution 1 (Simple) | Solution 2 (Lazy) | Solution 3 (Hybrid) |
|----------|---------------------|-------------------|---------------------|
| Implementation Time | 2-3 days | 5-7 days | 7-10 days |
| Memory Efficiency | Medium | High | High |
| Performance (small data) | Excellent | Good | Excellent |
| Performance (large data) | Poor | Excellent | Excellent |
| Code Complexity | Low | Medium-High | High |
| Maintainability | High | Medium | Medium |
| Developer Experience | Excellent | Good | Excellent |
| Backwards Compatibility | Full | Full | Full |
| Scalability | Limited | Excellent | Excellent |
| Edge Cases | Few | Many | Some |

## Recommended Solution

**Solution 1: Simple _io Table with Eager Loading**

### Rationale

While Solution 3 (Hybrid) offers the best technical capabilities, **Solution 1 is recommended** for the initial implementation because:

1. **MVP First**: Get core functionality working and gather real-world usage data
2. **Immediate Value**: Solves the 64KB limitation for most use cases (datasets up to several MB)
3. **Low Risk**: Simple implementation reduces bugs and edge cases
4. **Fast Delivery**: Can ship in days rather than weeks
5. **Iterative Path**: Can upgrade to Solution 2 or 3 based on actual user needs
6. **Proven Pattern**: Uses existing external table infrastructure that's battle-tested

### When to Upgrade

Consider implementing Solution 2 or 3 if users report:
- Regular processing of datasets > 10MB
- Memory pressure / OOM errors
- Need for true streaming operations
- Performance issues with current approach

### Phase 2 Enhancement

After Solution 1 is stable, can add lazy-loading as an opt-in feature:
```javascript
cu.setInput(data, { lazy: true });  // Explicitly request lazy mode
```

This gives users the choice while maintaining simple defaults.

## Implementation Plan

### Phase 1: Core Implementation (Solution 1)

#### Step 1: WASM/Zig Changes
**Files**: `src/main.zig`, `src/ext_table.zig`

```zig
// src/main.zig
var io_table_id: u32 = 0;

export fn init() c_int {
    // ... existing init code ...
    
    // Create _io table
    io_table_id = ext_table.create_table(L);
    lua.setglobal(L, "_io");
    
    return 0;
}

export fn get_io_table_id() u32 {
    return io_table_id;
}

export fn clear_io_table() void {
    if (global_lua_state == null) return;
    const L = global_lua_state.?;
    
    // Clear _io.input, _io.output, _io.meta
    lua.getglobal(L, "_io");
    lua.pushnil(L);
    lua.setfield(L, -2, "input");
    lua.pushnil(L);
    lua.setfield(L, -2, "output");
    lua.pushnil(L);
    lua.setfield(L, -2, "meta");
    lua.pop(L, 1);
}
```

**Tasks**:
- [x] Add `io_table_id` global variable
- [x] Create `_io` table in `init()`
- [x] Export `get_io_table_id()`
- [x] Export `clear_io_table()`
- [x] Add to exports list in `build.sh`

**Time**: 1 day

---

#### Step 2: JavaScript API
**Files**: `web/lua-api.js`

```javascript
// Add to lua-api.js
let ioTableId = null;

export function getIoTableId() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  
  if (ioTableId === null) {
    ioTableId = wasmInstance.exports.get_io_table_id();
  }
  
  return ioTableId;
}

export function setInput(data) {
  const tableId = getIoTableId();
  
  // Serialize and set _io.input
  const serialized = serializeObject(data);
  setTableValue(tableId, 'input', serialized);
}

export function getOutput() {
  const tableId = getIoTableId();
  
  // Get _io.output
  const serialized = getTableValue(tableId, 'output');
  return deserializeObject(serialized);
}

export function setMetadata(meta) {
  const tableId = getIoTableId();
  const serialized = serializeObject(meta);
  setTableValue(tableId, 'meta', serialized);
}

export function clearIo() {
  if (!wasmInstance) return;
  wasmInstance.exports.clear_io_table();
}

// Helper to serialize JavaScript objects to Lua-compatible format
function serializeObject(obj) {
  if (obj === null || obj === undefined) {
    return new Uint8Array([0x00]); // nil
  }
  
  if (typeof obj === 'boolean') {
    return new Uint8Array([0x01, obj ? 1 : 0]);
  }
  
  if (typeof obj === 'number') {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, 0x02); // integer type
    view.setBigInt64(1, BigInt(Math.floor(obj)), true);
    return new Uint8Array(buffer);
  }
  
  if (typeof obj === 'string') {
    const encoder = new TextEncoder();
    const strBytes = encoder.encode(obj);
    const buffer = new ArrayBuffer(5 + strBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, 0x04); // string type
    view.setUint32(1, strBytes.length, true);
    new Uint8Array(buffer).set(strBytes, 5);
    return new Uint8Array(buffer);
  }
  
  if (Array.isArray(obj)) {
    // Create external table for array
    const arrayTableId = createExternalTable();
    obj.forEach((item, index) => {
      const serialized = serializeObject(item);
      setTableValue(arrayTableId, String(index + 1), serialized);
    });
    
    // Return table reference
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, arrayTableId, true);
    return new Uint8Array(buffer);
  }
  
  if (typeof obj === 'object') {
    // Create external table for object
    const objTableId = createExternalTable();
    for (const [key, value] of Object.entries(obj)) {
      const serialized = serializeObject(value);
      setTableValue(objTableId, key, serialized);
    }
    
    // Return table reference
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, objTableId, true);
    return new Uint8Array(buffer);
  }
  
  return new Uint8Array([0x00]); // fallback to nil
}

function deserializeObject(buffer) {
  // Inverse of serializeObject
  // ... implementation
}

// Export new functions
export default {
  // ... existing exports ...
  getIoTableId,
  setInput,
  getOutput,
  setMetadata,
  clearIo
};
```

**Tasks**:
- [x] Add `getIoTableId()` function
- [x] Implement `setInput(data)`
- [x] Implement `getOutput()`
- [x] Implement `setMetadata(meta)`
- [x] Implement `clearIo()`
- [x] Add `serializeObject()` helper
- [x] Add `deserializeObject()` helper
- [x] Handle nested tables/arrays
- [x] Update exports

**Time**: 1.5 days

---

#### Step 3: Enhanced Serialization
**Files**: `src/serializer.zig`

Add support for table references in serialization:

```zig
pub const SerializationType = enum(u8) {
    nil = 0x00,
    boolean = 0x01,
    integer = 0x02,
    float = 0x03,
    string = 0x04,
    function_bytecode = 0x05,
    function_ref = 0x06,
    table_ref = 0x07,  // NEW: Reference to external table
};

pub fn serialize_value(L: *lua.lua_State, stack_index: c_int, buffer: [*]u8, max_len: usize) SerializationError!usize {
    // ... existing code ...
    
    // Add table reference handling
    if (lua.istable(L, stack_index)) {
        // Check if it's an external table
        lua.getfield(L, stack_index, "__ext_table_id");
        if (!lua.isnil(L, -1)) {
            // It's an external table - serialize as reference
            const table_id = lua.tointeger(L, -1);
            lua.pop(L, 1);
            
            if (max_len < 5) return SerializationError.BufferTooSmall;
            buffer[0] = @intFromEnum(SerializationType.table_ref);
            const id_u32: u32 = @intCast(table_id);
            const id_bytes = std.mem.asBytes(&id_u32);
            @memcpy(buffer[1..5], id_bytes);
            return 5;
        }
        lua.pop(L, 1);
        
        // Regular table - return error or convert to external
        return SerializationError.TypeMismatch;
    }
    
    // ... rest of code ...
}

pub fn deserialize_value(L: *lua.lua_State, buffer: [*]const u8, len: usize) SerializationError!void {
    // ... existing code ...
    
    // Add table reference handling
    if (value_type == SerializationType.table_ref) {
        if (len < 5) return SerializationError.InvalidFormat;
        
        const table_id = std.mem.bytesToValue(u32, buffer[1..5]);
        
        // Attach the external table
        ext_table.attach_table(L, table_id);
        return;
    }
    
    // ... rest of code ...
}
```

**Tasks**:
- [x] Add `table_ref` to SerializationType enum
- [x] Implement table reference serialization
- [x] Implement table reference deserialization
- [x] Add `ext_table.attach_table()` for reconstruction
- [x] Update tests

**Time**: 0.5 days

---

#### Step 4: High-Level Wrapper API
**Files**: `web/io-wrapper.js` (new file)

```javascript
/**
 * High-level wrapper for _io table operations
 * Provides convenient API for common patterns
 */
import * as lua from './lua-api.js';

export class IoWrapper {
  /**
   * Execute Lua code with structured input/output
   */
  async computeWithIo(code, inputData = null, options = {}) {
    const { clearBefore = true, metadata = {} } = options;
    
    // Clear previous I/O state
    if (clearBefore) {
      lua.clearIo();
    }
    
    // Set input if provided
    if (inputData !== null) {
      lua.setInput(inputData);
    }
    
    // Set metadata
    if (Object.keys(metadata).length > 0) {
      lua.setMetadata({
        ...metadata,
        timestamp: Date.now(),
        requestId: this.generateRequestId()
      });
    }
    
    // Execute code
    const resultBytes = await lua.compute(code);
    const result = lua.readResult(lua.getBufferPtr(), resultBytes);
    
    // Get output
    const output = lua.getOutput();
    
    return {
      returnValue: result.value,
      output: output,
      metadata: metadata
    };
  }
  
  /**
   * Stream processing pattern
   */
  async processStream(code, dataStream, options = {}) {
    const { batchSize = 100 } = options;
    const results = [];
    
    for (let i = 0; i < dataStream.length; i += batchSize) {
      const batch = dataStream.slice(i, i + batchSize);
      
      const result = await this.computeWithIo(code, {
        batch: batch,
        batchIndex: Math.floor(i / batchSize),
        hasMore: i + batchSize < dataStream.length
      });
      
      results.push(result.output);
    }
    
    return results;
  }
  
  /**
   * Request/response pattern
   */
  async request(method, params = {}) {
    return this.computeWithIo(`
      -- Standard request handler
      local method = _io.input.method
      local params = _io.input.params
      
      -- Route to handler
      if _G[method] then
        _io.output = _G[method](params)
      else
        _io.output = {
          error = "Unknown method: " .. method
        }
      end
    `, {
      method: method,
      params: params
    });
  }
  
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default IoWrapper;
```

**Tasks**:
- [x] Create `IoWrapper` class
- [x] Implement `computeWithIo()` method
- [x] Implement `processStream()` pattern
- [x] Implement `request()` pattern
- [x] Add request ID generation
- [x] Add comprehensive JSDoc

**Time**: 1 day

---

### Phase 2: Documentation & Examples

#### Step 5: API Documentation
**Files**: `docs/IO_TABLE_API.md` (new)

Create comprehensive documentation covering:
- Overview and motivation
- API reference for all functions
- Usage patterns and examples
- Performance considerations
- Best practices
- Migration guide from current approach

**Time**: 1 day

---

#### Step 6: Example Code
**Files**: `examples/io-table-examples.js` (new)

```javascript
// Example 1: Basic input/output
import { IoWrapper } from '../web/io-wrapper.js';

const io = new IoWrapper();

const result = await io.computeWithIo(`
  local user = _io.input.user
  local processed = {
    id = user.id,
    fullName = user.firstName .. " " .. user.lastName,
    age = user.age,
    isAdult = user.age >= 18
  }
  _io.output = processed
`, {
  user: {
    id: 123,
    firstName: "Alice",
    lastName: "Smith",
    age: 30
  }
});

console.log(result.output);
// { id: 123, fullName: "Alice Smith", age: 30, isAdult: true }

// Example 2: Large dataset processing
const largeDataset = new Array(100000).fill(0).map((_, i) => ({
  id: i,
  value: Math.random() * 100
}));

await io.computeWithIo(`
  local items = _io.input.items
  local stats = {
    count = #items,
    sum = 0,
    min = math.huge,
    max = -math.huge
  }
  
  for i = 1, #items do
    local value = items[i].value
    stats.sum = stats.sum + value
    stats.min = math.min(stats.min, value)
    stats.max = math.max(stats.max, value)
  end
  
  stats.average = stats.sum / stats.count
  _io.output = stats
`, { items: largeDataset });

// Example 3: Streaming pattern
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

// Example 4: Request/response API
await io.request('calculateStats', {
  dataset: [1, 2, 3, 4, 5]
});
```

**Time**: 0.5 days

---

#### Step 7: Tests
**Files**: `tests/io-table.test.js` (new)

```javascript
import { test, expect } from '@playwright/test';
import lua from '../web/lua-api.js';

test.describe('_io External Table', () => {
  test.beforeEach(async () => {
    await lua.loadLuaWasm();
    lua.init();
  });
  
  test('_io table exists', async () => {
    const result = await lua.compute('return type(_io)');
    expect(result).toBe('table');
  });
  
  test('can set and get input', async () => {
    lua.setInput({ message: 'hello', value: 42 });
    
    await lua.compute(`
      _io.output = {
        receivedMessage = _io.input.message,
        receivedValue = _io.input.value
      }
    `);
    
    const output = lua.getOutput();
    expect(output.receivedMessage).toBe('hello');
    expect(output.receivedValue).toBe(42);
  });
  
  test('handles nested structures', async () => {
    lua.setInput({
      user: {
        name: 'Alice',
        address: {
          city: 'NYC',
          zip: '10001'
        }
      }
    });
    
    await lua.compute(`
      _io.output = {
        city = _io.input.user.address.city
      }
    `);
    
    const output = lua.getOutput();
    expect(output.city).toBe('NYC');
  });
  
  test('handles arrays', async () => {
    lua.setInput({
      numbers: [1, 2, 3, 4, 5]
    });
    
    await lua.compute(`
      local sum = 0
      for i, n in ipairs(_io.input.numbers) do
        sum = sum + n
      end
      _io.output = { sum = sum }
    `);
    
    const output = lua.getOutput();
    expect(output.sum).toBe(15);
  });
  
  test('clearIo resets state', async () => {
    lua.setInput({ value: 123 });
    lua.clearIo();
    
    await lua.compute(`
      _io.output = { hasInput = _io.input ~= nil }
    `);
    
    const output = lua.getOutput();
    expect(output.hasInput).toBe(false);
  });
  
  test('handles large datasets', async () => {
    const largeArray = new Array(10000).fill(0).map((_, i) => i);
    lua.setInput({ data: largeArray });
    
    await lua.compute(`
      local count = 0
      for i, v in ipairs(_io.input.data) do
        count = count + 1
      end
      _io.output = { count = count }
    `);
    
    const output = lua.getOutput();
    expect(output.count).toBe(10000);
  });
  
  test('preserves types', async () => {
    lua.setInput({
      nullValue: null,
      boolTrue: true,
      boolFalse: false,
      number: 42,
      string: 'hello'
    });
    
    await lua.compute(`
      _io.output = {
        nullType = type(_io.input.nullValue),
        boolTrueType = type(_io.input.boolTrue),
        numberType = type(_io.input.number),
        stringType = type(_io.input.string),
        boolTrueValue = _io.input.boolTrue,
        boolFalseValue = _io.input.boolFalse
      }
    `);
    
    const output = lua.getOutput();
    expect(output.nullType).toBe('nil');
    expect(output.boolTrueType).toBe('boolean');
    expect(output.numberType).toBe('number');
    expect(output.stringType).toBe('string');
    expect(output.boolTrueValue).toBe(true);
    expect(output.boolFalseValue).toBe(false);
  });
});
```

**Tasks**:
- [x] Create test file
- [x] Test basic input/output
- [x] Test nested structures
- [x] Test arrays
- [x] Test clearIo()
- [x] Test large datasets
- [x] Test type preservation
- [x] Test error cases
- [x] Add performance benchmarks

**Time**: 1 day

---

### Phase 3: Integration & Polish

#### Step 8: Update Build System
**Files**: `build.sh`

```bash
# Add new exports to build
zig build-lib \
  # ... existing flags ...
  -rdynamic \
  --export=init \
  --export=compute \
  --export=get_buffer_ptr \
  --export=get_buffer_size \
  --export=get_memory_stats \
  --export=run_gc \
  --export=get_io_table_id \      # NEW
  --export=clear_io_table \       # NEW
  # ... rest of build
```

**Tasks**:
- [x] Add new exports to build script
- [x] Verify WASM output size
- [x] Test in all browsers

**Time**: 0.5 days

---

#### Step 9: Update Main Documentation
**Files**: `README.md`, `docs/API_REFERENCE.md`

Add sections covering:
- `_io` table overview
- Quick start examples
- Link to detailed IO_TABLE_API.md
- Performance comparison

**Time**: 0.5 days

---

#### Step 10: Create Migration Guide
**Files**: `docs/MIGRATION_TO_IO_TABLE.md` (new)

Help users migrate from current approach to _io table:

```markdown
# Migration Guide: Using _io Table

## Old Pattern (Limited)
```javascript
// ❌ Limited to small data, type loss
const result = await cu.compute(`
  return processData(...)  -- Can't pass large tables
`);
```

## New Pattern (Recommended)
```javascript
// ✅ No size limits, preserves types
cu.setInput({ data: largeDataset });
await cu.compute(`
  local result = processData(_io.input.data)
  _io.output = result
`);
const output = cu.getOutput();
```

**Time**: 0.5 days

---

## Timeline

### Total Estimated Time: 8-9 days

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1 | WASM/Zig Changes | 1 day | - |
| 1 | JavaScript API | 1.5 days | Step 1 |
| 1 | Enhanced Serialization | 0.5 days | Step 1 |
| 1 | High-Level Wrapper | 1 day | Step 2 |
| 2 | API Documentation | 1 day | Step 1-4 |
| 2 | Example Code | 0.5 days | Step 4 |
| 2 | Tests | 1 day | Step 1-4 |
| 3 | Build System | 0.5 days | Step 1 |
| 3 | Main Documentation | 0.5 days | Step 5 |
| 3 | Migration Guide | 0.5 days | Step 5 |

### Milestones

- **Day 3**: Core functionality working (Steps 1-3)
- **Day 5**: High-level API complete (Step 4)
- **Day 7**: Documentation and examples done (Steps 5-6)
- **Day 9**: Tests passing, ready to ship (Steps 7-10)

## Success Criteria

### Functional Success Criteria

**SC1**: `_io` table is accessible from Lua
```lua
assert(type(_io) == "table")
```

**SC2**: Can pass structured input from host to Lua
```javascript
lua.setInput({ user: { name: "Alice", age: 30 } });
// Lua can access _io.input.user.name
```

**SC3**: Can receive structured output from Lua to host
```lua
_io.output = { result: "processed", count: 42 }
```
```javascript
const output = lua.getOutput();
assert(output.result === "processed");
```

**SC4**: Handles datasets larger than 64KB
```javascript
const largeData = new Array(100000).fill({...});
lua.setInput({ data: largeData });
// Should not throw buffer overflow
```

**SC5**: Preserves type information
```javascript
lua.setInput({ flag: true, value: null });
// Lua receives boolean and nil, not strings
```

**SC6**: Backwards compatible
```javascript
// Existing code continues to work
const result = await lua.compute('return 42');
assert(result === 42);
```

### Performance Success Criteria

**SC7**: No performance degradation for small datasets (< 1KB)
- Benchmark: < 5% slower than current approach
- Test: 1000 iterations with 1KB data

**SC8**: Significant improvement for large datasets (> 64KB)
- Benchmark: Can process datasets 100x larger
- Test: Successfully process 6.4MB dataset

**SC9**: Memory efficient for large arrays
- Benchmark: Process 100K items without OOM
- Test: Monitor WASM memory usage stays < 2MB

### Quality Success Criteria

**SC10**: All tests pass
- Unit tests for serialization
- Integration tests for _io operations
- E2E tests with real data

**SC11**: Documentation complete
- API reference
- Usage examples
- Migration guide
- Performance guidelines

**SC12**: Zero breaking changes
- All existing tests pass
- Example code still works
- No API changes to current functions

## Risk Assessment

### High Risk Items

**R1**: Nested table serialization complexity
- **Mitigation**: Extensive testing with deeply nested structures
- **Fallback**: Limit nesting depth initially

**R2**: Memory management with large datasets
- **Mitigation**: Careful garbage collection strategy
- **Fallback**: Document size limits clearly

**R3**: Backwards compatibility
- **Mitigation**: Comprehensive regression testing
- **Fallback**: Feature flag to disable _io

### Medium Risk Items

**R4**: Browser compatibility (especially mobile)
- **Mitigation**: Test on multiple browsers/devices
- **Fallback**: Graceful degradation

**R5**: Performance with many external tables
- **Mitigation**: Performance benchmarks and profiling
- **Fallback**: Document best practices

### Low Risk Items

**R6**: Documentation clarity
- **Mitigation**: User testing with beta users
- **Fallback**: Iterate based on feedback

## Future Enhancements (Out of Scope)

These would be considered in Phase 2 (v2.1) if user feedback demands:

1. **Lazy Loading** (Solution 2): Implement proxy metatables for true lazy access
2. **Streaming API**: Real-time data streaming during execution
3. **Compression**: Automatic compression for large datasets
4. **Binary Streaming**: Direct binary data transfer without serialization
5. **Multi-threading**: Web Worker support for parallel processing
6. **Persistent _io**: Option to persist _io data like _home

## Conclusion

The `_io` external table feature will significantly enhance the CU's capabilities by:

1. Removing the 64KB size limitation
2. Enabling structured data exchange
3. Preserving type information
4. Maintaining backwards compatibility
5. Opening new use cases (data processing pipelines, complex API integrations)

Solution 1 (Simple implementation) provides the best balance of:
- Fast delivery (8-9 days)
- Low complexity (easier to maintain)
- Sufficient capability (handles most use cases)
- Clear upgrade path (to lazy loading if needed)

This implementation will unlock new possibilities for the CU while maintaining the simplicity and reliability that users expect.
