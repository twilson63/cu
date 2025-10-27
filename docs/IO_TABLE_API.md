# _io External Table API Reference

## Table of Contents

1. [Overview](#overview)
2. [Motivation](#motivation)
3. [Quick Start](#quick-start)
4. [JavaScript API Reference](#javascript-api-reference)
5. [Lua API Reference](#lua-api-reference)
6. [Usage Patterns](#usage-patterns)
7. [Performance Considerations](#performance-considerations)
8. [Best Practices](#best-practices)
9. [Comparison with Current Approach](#comparison-with-current-approach)
10. [Advanced Topics](#advanced-topics)

---

## Overview

The `_io` external table provides a **structured input/output channel** between JavaScript (the host) and Lua (the Compute Unit). It enables passing complex data structures that exceed the 64KB I/O buffer limitation while preserving type information.

### Key Features

- **Large Dataset Support**: Process datasets larger than 64KB
- **Type Preservation**: Maintain JavaScript types (objects, arrays, null, boolean, numbers, strings)
- **Nested Structures**: Support for deeply nested objects and arrays
- **Backwards Compatible**: Works alongside existing APIs without breaking changes
- **Persistent Across Calls**: The `_io` table persists across multiple `compute()` calls within the same session

### Architecture

```
JavaScript Host              WASM/Lua Compute Unit
┌─────────────────┐         ┌──────────────────┐
│                 │         │                  │
│  setInput(data) │────────>│  _io.input       │
│                 │         │                  │
│  compute(code)  │────────>│  [Execute Lua]   │
│                 │         │                  │
│  getOutput()    │<────────│  _io.output      │
│                 │         │                  │
└─────────────────┘         └──────────────────┘
```

---

## Motivation

### The Problem

The current Compute Unit architecture requires all input and output to pass through a 64KB I/O buffer in WASM linear memory. This creates several limitations:

1. **Size Constraints**: Cannot process datasets larger than 64KB
2. **Serialization Overhead**: Must serialize/deserialize complex data through strings or primitives
3. **Type Loss**: Complex JavaScript objects cannot be returned as-is
4. **Memory Pressure**: All data must fit in WASM memory simultaneously

### The Solution

The `_io` external table solves these problems by:

- **Bypassing the Buffer**: Data is stored in JavaScript external tables, not the WASM buffer
- **Structured Storage**: Complex objects and arrays are preserved as nested external tables
- **Type Safety**: Type information is maintained through the binary serialization protocol
- **Scalability**: Can handle datasets many times larger than WASM memory

### Use Cases

- Processing large datasets (analytics, batch operations)
- Complex API request/response patterns
- Multi-step data pipelines
- Structured logging and metrics collection
- Data transformation workflows

---

## Quick Start

### Basic Input/Output

```javascript
import lua from './lua-api.js';

// Initialize
await lua.loadLuaWasm();
lua.init();

// Set input data
lua.setInput({
  user: {
    id: 123,
    name: "Alice",
    age: 30
  }
});

// Execute Lua code that uses _io
const resultBytes = lua.compute(`
  local user = _io.input.user
  local greeting = "Hello, " .. user.name
  
  _io.output = {
    message = greeting,
    isAdult = user.age >= 18,
    userId = user.id
  }
  
  return "success"
`);

// Get structured output
const output = lua.getOutput();
console.log(output);
// {
//   message: "Hello, Alice",
//   isAdult: true,
//   userId: 123
// }
```

### Processing Arrays

```javascript
// Set array input
lua.setInput({
  numbers: [1, 2, 3, 4, 5]
});

lua.compute(`
  local sum = 0
  for i, n in ipairs(_io.input.numbers) do
    sum = sum + n
  end
  
  _io.output = { sum = sum, count = #_io.input.numbers }
`);

const result = lua.getOutput();
console.log(result);
// { sum: 15, count: 5 }
```

---

## JavaScript API Reference

### getIoTableId()

Returns the numeric identifier for the `_io` external table.

**Returns:** `number|null` - The table ID, or `null` if not initialized

**Example:**
```javascript
const ioId = lua.getIoTableId();
console.log('_io table ID:', ioId);
```

**Use Case:** Debugging, tooling, advanced integrations

---

### setInput(data)

Sets the input data that will be accessible as `_io.input` in Lua.

**Parameters:**
- `data` (any): JavaScript value to pass to Lua. Can be:
  - Primitives: `null`, `boolean`, `number`, `string`
  - Objects: Plain JavaScript objects (converted to external tables)
  - Arrays: JavaScript arrays (converted to external tables with numeric keys)
  - Nested structures: Objects and arrays can be nested arbitrarily

**Returns:** `void`

**Example:**
```javascript
// Simple object
lua.setInput({
  message: "Hello",
  value: 42,
  flag: true
});

// Nested structure
lua.setInput({
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

// Primitives
lua.setInput("simple string");
lua.setInput(42);
lua.setInput(true);
lua.setInput(null);
```

**Notes:**
- Replaces any previous input data
- Data is available immediately in the next `compute()` call
- Large datasets are supported (well beyond 64KB)
- Circular references are not supported

---

### getOutput()

Retrieves the output data set by Lua via `_io.output`.

**Returns:** `any` - JavaScript value, matching the structure set in Lua

**Example:**
```javascript
lua.compute(`
  _io.output = {
    result = "processed",
    count = 10,
    items = {1, 2, 3}
  }
`);

const output = lua.getOutput();
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

### setInputField(key, value)

Sets a specific field in the `_io.input` table without replacing the entire input.

**Parameters:**
- `key` (string): Field name
- `value` (any): Value to set

**Returns:** `void`

**Example:**
```javascript
// Set individual fields
lua.setInputField('userId', 123);
lua.setInputField('action', 'update');
lua.setInputField('params', { limit: 10 });

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

### getOutputField(key)

Retrieves a specific field from `_io.output` without deserializing the entire output.

**Parameters:**
- `key` (string): Field name to retrieve

**Returns:** `any` - Value of the field, or `null` if not set

**Example:**
```javascript
lua.compute(`
  _io.output = {
    status = "ok",
    data = { huge = "dataset" },
    timestamp = 1234567890
  }
`);

// Get only what you need
const status = lua.getOutputField('status');
console.log(status); // "ok"
```

**Notes:**
- More efficient than `getOutput()` when you only need specific fields
- Returns `null` for non-existent fields

---

### setMetadata(meta)

Sets metadata in `_io.meta` for tracking and debugging purposes.

**Parameters:**
- `meta` (object): Metadata object

**Returns:** `void`

**Example:**
```javascript
lua.setMetadata({
  requestId: 'req-12345',
  timestamp: Date.now(),
  version: '1.0.0'
});

lua.compute(`
  print("Request ID: " .. _io.meta.requestId)
  -- Process data
`);
```

**Notes:**
- Metadata is separate from input/output
- Useful for request tracking, logging, and debugging
- Not cleared by `clearIo()`

---

### clearIo()

Clears all data in the `_io` table (input, output, and metadata).

**Returns:** `void`

**Example:**
```javascript
// Set some data
lua.setInput({ data: "test" });
lua.compute(`_io.output = { result = "done" }`);

// Clear everything
lua.clearIo();

// _io.input, _io.output, and _io.meta are now nil
```

**Notes:**
- Call before each new request to avoid data leakage
- Resets the `_io` table to a clean state
- Does not affect other external tables like `_home`

---

## Lua API Reference

### _io.input

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

### _io.output

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

### _io.meta

Metadata field for request tracking and debugging.

**Type:** External table

**Example:**
```lua
-- Access metadata
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

## Usage Patterns

### Pattern 1: Request/Response

**Use Case:** API-like request/response pattern

```javascript
// JavaScript
lua.setInput({
  method: 'calculateStats',
  params: {
    dataset: [1, 2, 3, 4, 5]
  }
});

lua.compute(`
  local method = _io.input.method
  local params = _io.input.params
  
  if method == "calculateStats" then
    local sum = 0
    local count = #params.dataset
    for i, v in ipairs(params.dataset) do
      sum = sum + v
    end
    
    _io.output = {
      sum = sum,
      average = sum / count,
      count = count
    }
  else
    _io.output = { error = "Unknown method" }
  end
`);

const response = lua.getOutput();
console.log(response);
// { sum: 15, average: 3, count: 5 }
```

---

### Pattern 2: Batch Processing

**Use Case:** Process large arrays in batches

```javascript
const largeDataset = new Array(100000).fill(0).map((_, i) => ({
  id: i,
  value: Math.random() * 100
}));

lua.setInput({ items: largeDataset });

lua.compute(`
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
`);

const stats = lua.getOutput();
console.log(stats);
// { count: 100000, sum: 5000000, min: 0.01, max: 99.99, average: 50 }
```

---

### Pattern 3: Data Transformation Pipeline

**Use Case:** Multi-step data transformation

```javascript
// Step 1: Filter
lua.setInput({ items: rawData });
lua.compute(`
  local filtered = ext.table()
  local count = 0
  for i, item in ipairs(_io.input.items) do
    if item.active then
      count = count + 1
      filtered[count] = item
    end
  end
  _io.output = { items = filtered }
`);

const filtered = lua.getOutput();

// Step 2: Transform
lua.setInput(filtered);
lua.compute(`
  local transformed = ext.table()
  for i, item in ipairs(_io.input.items) do
    transformed[i] = {
      id = item.id,
      fullName = item.firstName .. " " .. item.lastName,
      age = item.age
    }
  end
  _io.output = { items = transformed }
`);

const result = lua.getOutput();
```

---

### Pattern 4: Aggregation and Grouping

**Use Case:** Group and aggregate data

```javascript
lua.setInput({
  transactions: [
    { userId: 1, amount: 100 },
    { userId: 2, amount: 50 },
    { userId: 1, amount: 75 },
    { userId: 2, amount: 125 }
  ]
});

lua.compute(`
  local byUser = {}
  
  for i, tx in ipairs(_io.input.transactions) do
    local userId = tx.userId
    if not byUser[userId] then
      byUser[userId] = { userId = userId, total = 0, count = 0 }
    end
    byUser[userId].total = byUser[userId].total + tx.amount
    byUser[userId].count = byUser[userId].count + 1
  end
  
  -- Convert to array
  local result = ext.table()
  for userId, data in pairs(byUser) do
    result[#result + 1] = data
  end
  
  _io.output = { groups = result }
`);

const aggregated = lua.getOutput();
// {
//   groups: [
//     { userId: 1, total: 175, count: 2 },
//     { userId: 2, total: 175, count: 2 }
//   ]
// }
```

---

### Pattern 5: Incremental Field Updates

**Use Case:** Update specific fields without replacing entire input

```javascript
// Initial setup
lua.setInput({
  config: {
    maxItems: 100,
    timeout: 30
  }
});

// Later, update just one field
lua.setInputField('currentUser', {
  id: 123,
  name: 'Alice'
});

lua.compute(`
  -- Both config and currentUser are available
  print("Max items: " .. _io.input.config.maxItems)
  print("Current user: " .. _io.input.currentUser.name)
`);
```

---

### Pattern 6: Error Handling

**Use Case:** Structured error responses

```javascript
lua.setInput({
  operation: 'divide',
  a: 10,
  b: 0
});

lua.compute(`
  local success, result = pcall(function()
    if _io.input.b == 0 then
      error("Division by zero")
    end
    return _io.input.a / _io.input.b
  end)
  
  if success then
    _io.output = {
      status = "ok",
      result = result
    }
  else
    _io.output = {
      status = "error",
      error = result,
      code = "MATH_ERROR"
    }
  end
`);

const response = lua.getOutput();
if (response.status === "error") {
  console.error('Error:', response.error);
}
```

---

## Performance Considerations

### Memory Usage

**External Tables are Stored in JavaScript**

- External tables live in JavaScript heap, not WASM linear memory
- WASM only holds references (table IDs), not the actual data
- This allows processing datasets much larger than WASM memory

**Example:**
```javascript
// This 10MB dataset lives in JavaScript memory
const largeDataset = new Array(1000000).fill(0).map((_, i) => ({
  id: i,
  value: Math.random()
}));

lua.setInput({ items: largeDataset });

// Lua can process it incrementally without loading everything into WASM
lua.compute(`
  local count = 0
  for i, item in ipairs(_io.input.items) do
    count = count + 1
    -- Only one item at a time is in WASM memory
  end
  _io.output = { processed = count }
`);
```

### Serialization Overhead

**Type-Based Costs:**

| Type | Serialization Cost | Notes |
|------|-------------------|-------|
| Primitives (null, boolean, number, string) | Very Low | Direct binary encoding |
| Flat objects | Low | One-time table creation |
| Nested objects | Medium | Recursive table creation |
| Large arrays | Medium | Linear with array size |

**Optimization Tips:**

1. **Reuse External Tables**: Don't recreate tables unnecessarily
   ```javascript
   // Good: Reuse the _io table
   lua.setInput({ data: newData });
   
   // Avoid: Creating new tables for each field
   for (let i = 0; i < 1000; i++) {
     lua.setInputField(`item_${i}`, data[i]);
   }
   ```

2. **Batch Updates**: Set entire objects instead of individual fields
   ```javascript
   // Good: Single update
   lua.setInput({ user: { name: 'Alice', age: 30 } });
   
   // Less efficient: Multiple updates
   lua.setInputField('user.name', 'Alice');
   lua.setInputField('user.age', 30);
   ```

3. **Lazy Access in Lua**: Only access data you need
   ```lua
   -- Good: Only access required fields
   local userId = _io.input.user.id
   
   -- Avoid: Accessing entire nested structure unnecessarily
   local entireUser = _io.input.user
   local allFields = {}
   for k, v in pairs(entireUser) do
     allFields[k] = v
   end
   ```

### Benchmarks

**Small Data (< 1KB):**
- Overhead vs direct buffer: < 5%
- Use either approach based on convenience

**Medium Data (1KB - 1MB):**
- Significant improvement over buffer limitations
- _io table recommended for structured data

**Large Data (> 1MB):**
- Only viable option (buffer is 64KB max)
- Can handle 10MB+ datasets efficiently

---

## Best Practices

### 1. Clear State Between Requests

```javascript
// Always clear before new request
lua.clearIo();
lua.setInput(newData);
lua.compute(code);
const result = lua.getOutput();
```

**Why:** Prevents data leakage between requests and ensures clean state.

---

### 2. Validate Input in Lua

```lua
-- Check input exists and has expected structure
if not _io.input or not _io.input.user then
  _io.output = { error = "Missing user data" }
  return
end

if type(_io.input.user.id) ~= "number" then
  _io.output = { error = "Invalid user ID" }
  return
end

-- Process valid input
local userId = _io.input.user.id
```

**Why:** Graceful error handling prevents cryptic runtime errors.

---

### 3. Use Meaningful Structure

```javascript
// Good: Descriptive structure
lua.setInput({
  request: {
    method: 'processOrders',
    params: {
      userId: 123,
      orders: [...]
    }
  },
  context: {
    timestamp: Date.now(),
    version: '1.0'
  }
});

// Avoid: Flat, ambiguous structure
lua.setInput({
  m: 'processOrders',
  u: 123,
  o: [...],
  t: Date.now()
});
```

**Why:** Clear structure improves maintainability and debugging.

---

### 4. Handle Null and Undefined

```javascript
// JavaScript: null and undefined both become nil
lua.setInput({
  value: null,
  missing: undefined
});
```

```lua
-- Lua: Both are nil
if _io.input.value == nil then
  print("value is nil")
end

if _io.input.missing == nil then
  print("missing is nil")
end
```

**Why:** Understand type conversions to avoid unexpected behavior.

---

### 5. Use Type Guards

```lua
-- Check types before operations
local value = _io.input.value

if type(value) == "number" then
  return value * 2
elseif type(value) == "string" then
  return string.upper(value)
elseif type(value) == "table" then
  return #value
else
  return "unknown type"
end
```

**Why:** Lua is dynamically typed; explicit checks prevent errors.

---

### 6. Combine with _home for Persistence

```lua
-- Use _io for request data
local items = _io.input.items

-- Use _home for persistent state
if not _home.processedCount then
  _home.processedCount = 0
end

-- Process and update persistent state
for i, item in ipairs(items) do
  -- Process item
  _home.processedCount = _home.processedCount + 1
end

-- Return current state
_io.output = {
  processed = #items,
  totalProcessed = _home.processedCount
}
```

**Why:** Leverage both transient (_io) and persistent (_home) storage effectively.

---

### 7. Add Request Metadata

```javascript
lua.setMetadata({
  requestId: crypto.randomUUID(),
  timestamp: Date.now(),
  userId: currentUser.id
});

lua.setInput({ data: requestData });

lua.compute(`
  -- Log request
  print("Request ID: " .. _io.meta.requestId)
  
  -- Process with context
  local result = processData(_io.input.data, _io.meta.userId)
  
  _io.output = result
`);
```

**Why:** Request tracking improves debugging and observability.

---

## Comparison with Current Approach

### Current Approach: I/O Buffer

**Limited to 64KB, string-based**

```javascript
// OLD: Limited to small data
const code = `
  local data = {1, 2, 3, 4, 5}
  local sum = 0
  for i, v in ipairs(data) do
    sum = sum + v
  end
  return sum
`;
const result = lua.compute(code);
// Works, but data is hardcoded in Lua
```

**Limitations:**
- Data hardcoded in Lua string
- Cannot pass dynamic datasets
- String size limited to 64KB
- Type information lost on return

---

### New Approach: _io Table

**No size limit, structured data**

```javascript
// NEW: Dynamic data, any size
lua.setInput({
  data: [1, 2, 3, 4, 5] // Can be 100,000 items!
});

const code = `
  local data = _io.input.data
  local sum = 0
  for i, v in ipairs(data) do
    sum = sum + v
  end
  _io.output = {
    sum = sum,
    count = #data,
    average = sum / #data
  }
`;

lua.compute(code);
const result = lua.getOutput();
// { sum: 15, count: 5, average: 3 }
```

**Benefits:**
- Data passed dynamically from JavaScript
- No size limitations
- Rich return types (objects, arrays, nested structures)
- Type preservation

---

### Migration Example

**Before (_io table):**

```javascript
// ❌ Limited approach
const smallData = [1, 2, 3];
const code = `
  local data = {${smallData.join(',')}}
  local sum = 0
  for i, v in ipairs(data) do
    sum = sum + v
  end
  return tostring(sum)
`;
const result = lua.compute(code);
const sum = parseInt(result); // "6"
```

**After (with _io table):**

```javascript
// ✅ Better approach
const largeData = new Array(100000).fill(0).map((_, i) => i + 1);
lua.setInput({ data: largeData });

const code = `
  local data = _io.input.data
  local sum = 0
  for i, v in ipairs(data) do
    sum = sum + v
  end
  _io.output = { sum = sum, count = #data }
`;

lua.compute(code);
const result = lua.getOutput();
// { sum: 5000050000, count: 100000 }
```

---

## Advanced Topics

### Working with Large Arrays

**Iterating efficiently:**

```lua
-- Process 1 million items
local items = _io.input.items
local processed = 0

for i = 1, #items do
  -- Process each item
  local item = items[i]
  -- ... do work ...
  processed = processed + 1
  
  -- Optional: Report progress every 10000 items
  if processed % 10000 == 0 then
    print("Processed: " .. processed)
  end
end

_io.output = { processed = processed }
```

### Nested Table Access

**Deep nesting is supported:**

```javascript
lua.setInput({
  level1: {
    level2: {
      level3: {
        level4: {
          value: "deep value"
        }
      }
    }
  }
});
```

```lua
local deep = _io.input.level1.level2.level3.level4.value
print(deep) -- "deep value"
```

**Note:** Each level is an external table lookup. For very deep structures, consider flattening.

### Type Conversions

**JavaScript to Lua:**

| JavaScript | Lua |
|-----------|-----|
| `null` | `nil` |
| `undefined` | `nil` |
| `true` / `false` | `true` / `false` |
| `123` | `123` (number) |
| `"hello"` | `"hello"` (string) |
| `{a: 1, b: 2}` | External table |
| `[1, 2, 3]` | External table (numeric keys) |

**Lua to JavaScript:**

| Lua | JavaScript |
|-----|-----------|
| `nil` | `null` |
| `true` / `false` | `true` / `false` |
| `123` | `123` |
| `"hello"` | `"hello"` |
| External table | Object or Array |

### Debugging Tips

**1. Inspect table IDs:**

```javascript
const ioId = lua.getIoTableId();
console.log('_io table ID:', ioId);

const tableInfo = lua.getTableInfo();
console.log('All tables:', tableInfo);
```

**2. Log input/output:**

```lua
-- Log input structure
print("Input type: " .. type(_io.input))
for k, v in pairs(_io.input) do
  print("  " .. k .. " = " .. tostring(v))
end

-- Log output before returning
print("Output:", tostring(_io.output))
```

**3. Validate data flow:**

```javascript
// Before compute
console.log('Setting input:', JSON.stringify(inputData, null, 2));
lua.setInput(inputData);

// After compute
const output = lua.getOutput();
console.log('Got output:', JSON.stringify(output, null, 2));
```

---

## Summary

The `_io` external table provides a powerful, scalable way to exchange structured data between JavaScript and Lua. It removes the 64KB buffer limitation while preserving type information and enabling complex data processing workflows.

**Key Takeaways:**

- Use `setInput()` to pass data to Lua as `_io.input`
- Use `getOutput()` to retrieve data from `_io.output`
- Call `clearIo()` between requests to prevent data leakage
- Combine with `_home` for persistent state across sessions
- Handle errors gracefully with validation and type checks
- Leverage external tables for datasets larger than WASM memory

**Next Steps:**

- Read [API_REFERENCE.md](API_REFERENCE.md) for complete API documentation
- See [QUICK_START.md](QUICK_START.md) for getting started
- Check [examples/](../examples/) for more code samples
- Review [PERFORMANCE_GUIDE.md](PERFORMANCE_GUIDE.md) for optimization tips
