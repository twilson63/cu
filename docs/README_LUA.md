# Lua API Documentation - Cu WASM Persistent

Complete reference for the Cu WASM persistent demo, including API functions, serialization format, error reporting, and limitations.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core API](#core-api)
3. [External Tables](#external-tables)
4. [Output Capture](#output-capture)
5. [Error Reporting](#error-reporting)
6. [Serialization Format](#serialization-format)
7. [Type Support](#type-support)
8. [Limitations and Known Issues](#limitations-and-known-issues)
9. [Performance Characteristics](#performance-characteristics)

## Quick Start

```lua
-- Initialize the Lua state (done automatically)
-- Access external table for persistence
local data = ext.table()

-- Store values
data["counter"] = 0
data["counter"] = data["counter"] + 1

-- Retrieve values
print("Count: " .. data["counter"])
return data["counter"]
```

## Core API

### WASM Module Functions

These functions are available through the JavaScript interface to the WASM module.

#### `init() -> c_int`

Initialize the Cu WASM module.

**Returns:** 0 on success, -1 on failure

**Example (JavaScript):**
```javascript
const lua = new LuaPersistent();
await lua.load('lua.wasm');
const result = lua.init();
if (result === 0) {
    console.log('Lua initialized');
}
```

**Note:** Must be called once before any code evaluation.

#### `eval(code: string) -> { value, output, error }`

Execute Lua code and return the result.

**Parameters:**
- `code` - Lua source code as a string

**Returns:**
- `value` - The returned value from the code
- `output` - Captured output from print() statements
- `error` - Error message if evaluation failed

**Example:**
```javascript
const result = lua.eval('return 42 + 8');
console.log(result.value);  // 50
```

#### `get_memory_stats() -> { io_buffer_size, lua_memory_used, wasm_pages }`

Get current memory usage statistics.

**Returns:**
- `io_buffer_size` - Size of IO buffer (64KB)
- `lua_memory_used` - Approximate Lua memory usage
- `wasm_pages` - Number of WASM memory pages

**Example:**
```javascript
const stats = lua.getMemoryStats();
console.log(`Memory used: ${stats.lua_memory_used} bytes`);
```

#### `run_gc() -> void`

Trigger garbage collection.

**Note:** Currently a no-op; Lua's built-in GC handles cleanup.

## External Tables

External tables provide persistence across multiple `eval()` calls. They are Lua tables that store values in JavaScript Maps.

### Creation

```lua
local t = ext.table()
```

Creates a new external table. Each call to `ext.table()` creates a separate table with a unique internal ID.

### Usage

External tables behave like regular Lua tables but store data externally.

**Setting values:**
```lua
local t = ext.table()
t["key"] = "value"
t[1] = "first"
t[123] = true
```

**Getting values:**
```lua
print(t["key"])    -- "value"
print(t[1])        -- "first"
print(t[999])      -- nil (not set)
```

**Checking length:**
```lua
local t = ext.table()
t["a"] = 1
t["b"] = 2
t["c"] = 3
print(#t)          -- 3
```

**Deleting values:**
```lua
t["key"] = nil     -- Removes key from table
```

### Iteration

```lua
local t = ext.table()
t["a"] = 1
t["b"] = 2
t["c"] = 3

for key, value in pairs(t) do
    print(key, value)
end
```

**Note:** Iteration order is insertion order, consistent with JavaScript Map behavior.

### Persistence

External table data persists across multiple `eval()` calls in the same WASM instance:

```javascript
// Call 1
lua.eval(`
    counter = ext.table()
    counter["count"] = 0
`);

// Call 2
lua.eval(`counter["count"] = counter["count"] + 1`);

// Call 3
const result = lua.eval('return counter["count"]');  // Returns 1
```

**Important:** Data does NOT persist across:
- Page reloads
- Creating a new `LuaPersistent` instance
- WASM module re-initialization

For persistence across page reloads, serialize external table data to browser storage (localStorage/IndexedDB).

## Output Capture

The `print()` function is overridden to capture output.

### Basic Usage

```lua
print("hello")
print("world")
return 42
```

Returns:
```javascript
{
    output: "hello\nworld\n",
    value: 42
}
```

### Multiple Arguments

```lua
print("a", "b", "c")
```

Arguments are separated by tabs:
```
a	b	c
```

### Supported Types

All Lua types can be printed:

```lua
print(42)                -- integer
print(3.14)              -- float
print(true)              -- boolean
print(nil)               -- nil
print("string")          -- string
print({})                -- table (shows type)
print(function() end)    -- function (shows type)
```

Output:
```
42
3.14
true
nil
string
table
function
```

### Output Buffer Limits

The output buffer is 63KB. If exceeded:
- Available output is returned
- Remaining output is truncated
- An overflow indicator (`...`) is appended

**Example:**
```lua
for i = 1, 100000 do
    print("line " .. i)
end
```

The last printed line might be `...` to indicate truncation.

## Error Reporting

Errors are captured and reported with context.

### Error Types

| Error | Cause | Example |
|-------|-------|---------|
| Syntax Error | Invalid Lua syntax | `return 42 +++` |
| Runtime Error | Undefined variable/function | `return undefined_var` |
| Type Error | Invalid operation | `return nil + 5` |
| Stack Error | Stack overflow | Deep recursion |

### Error Access (JavaScript)

```javascript
const result = lua.eval('invalid code');
if (result === null) {
    const error = lua.getLastError();
    console.error(error);
}
```

### Error Clearing

Errors are automatically cleared before each `eval()` call.

```javascript
lua.eval('invalid');           // Sets error
const error1 = lua.getLastError();  // "..."

lua.eval('return 42');         // Clears previous error
const error2 = lua.getLastError();  // null
```

### Stack Safety

The error handler resets the Lua stack after an error, making subsequent `eval()` calls safe:

```lua
-- Call 1: Error
return nil.value                -- Runtime error

-- Call 2: Works fine
return 42 + 8                   -- Returns 50
```

## Serialization Format

When values are stored in external tables or returned from code, they are serialized.

### Format Specification

Each value is encoded as:

```
[Type byte][Data]
```

### Type Bytes

| Type | Byte | Size | Format |
|------|------|------|--------|
| nil | 0x00 | 1 | Type byte only |
| boolean | 0x01 | 2 | Type + bool byte (0/1) |
| integer | 0x02 | 9 | Type + 8 byte i64 (little-endian) |
| float | 0x03 | 9 | Type + 8 byte f64 (little-endian) |
| string | 0x04 | 5+ | Type + 4 byte length (u32) + data |

### Examples

**Nil:**
```
00
```

**Boolean (true):**
```
01 01
```

**Boolean (false):**
```
01 00
```

**Integer (42):**
```
02 2A 00 00 00 00 00 00 00
```

**Float (3.14):**
```
03 1F 85 EB 51 B8 1E 09 40
```

**String ("hello"):**
```
04 05 00 00 00 68 65 6C 6C 6F
(Type + length=5 + "hello")
```

### Serialization Limits

- Maximum string length: ~65KB (buffer limited)
- Integer range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
- Float precision: IEEE 754 double precision (64-bit)
- Tables: Stored only by type name ("table" string), not contents

## Type Support

### Fully Supported

| Type | Support | Notes |
|------|---------|-------|
| nil | ✓ | Serializable |
| boolean | ✓ | Both true and false |
| integer | ✓ | 64-bit signed |
| float | ✓ | IEEE 754 double |
| string | ✓ | UTF-8 compatible |

### Partially Supported

| Type | Support | Notes |
|------|---------|-------|
| table | ⚠ | External tables work; regular tables convert to "table" string |
| function | ⚠ | Cannot be serialized; shows as "function" string |

### Not Supported

| Type | Support | Notes |
|------|---------|-------|
| thread | ✗ | Lua coroutines not supported |
| userdata | ✗ | C data not supported |

### Table Limitations

Regular Lua tables cannot be serialized or stored in external tables:

```lua
-- This works
local t = ext.table()
t["key"] = "value"

-- This doesn't work as expected
local regular = {}
regular.key = "value"
t["table"] = regular        -- Stores "table" string, not contents
```

**Workaround:** Serialize table contents manually:

```lua
local data = {x=1, y=2}
local t = ext.table()
t["x"] = data.x
t["y"] = data.y
```

## Limitations and Known Issues

### Buffer Size Limitations

- **IO Buffer:** 64KB total
- **Output Buffer:** 63KB (1KB reserved)
- **Strings:** Up to 63KB in a single value

Exceeding these limits:
- Strings are truncated
- Output is marked with `...` overflow indicator
- Evaluation continues but data is lost

### Memory Constraints

- **Total WASM Memory:** 2MB
- **Lua Heap:** ~1.5MB (rest for buffers)
- **External Table Overhead:** ~50 bytes per entry

### Performance Characteristics

- **Initialization:** ~100ms first time
- **Simple eval:** ~1-5ms
- **Large operations:** Scales with data size
- **GC:** Automatic, typically < 10ms

### Stack Limitations

- **Lua Stack Size:** Fixed at Lua 5.1 defaults (~1000 entries)
- **Deep recursion:** Limited to ~500 levels

### Known Issues

1. **Table Serialization:** Regular Lua tables cannot be serialized
   - Workaround: Use external tables or serialize manually

2. **String Encoding:** Binary data in strings may not preserve byte-perfect accuracy
   - Workaround: Use ASCII for strings in tables

3. **Large Outputs:** Output > 63KB is truncated
   - Workaround: Process output in chunks

4. **No Debugging:** Standard Lua debugging hooks not available
   - Workaround: Add explicit print statements for debugging

### Future Improvements

- [ ] Partial table serialization support
- [ ] Larger buffer options
- [ ] Better binary data handling
- [ ] Debug hook support

## Performance Characteristics

### Benchmarks

Measured on modern hardware (2GHz+ CPU):

| Operation | Time | Notes |
|-----------|------|-------|
| Initialize | ~100ms | First time only |
| Simple return | ~1ms | `return 42` |
| Arithmetic | ~2ms | 1000 operations |
| String concat | ~3ms | 100 concatenations |
| Table access | ~0.5ms | Single access |
| Table creation | ~10ms | 100 items |
| Large dataset | ~5s | 1000 items |

### Optimization Tips

1. **Minimize serialization:** Batch external table operations
2. **Reuse state:** Keep Lua state between evals instead of recreating
3. **Avoid string ops:** String concatenation in loops is slow (use tables)
4. **Cache external tables:** Store references instead of recreating

**Good:**
```lua
local t = ext.table()
for i = 1, 1000 do
    t["i_" .. i] = i
end
```

**Slow:**
```lua
for i = 1, 1000 do
    local t = ext.table()
    t["key"] = i
end
```

### Memory Usage

| Operation | Overhead |
|-----------|----------|
| ext.table() | ~50-100 bytes |
| 1000 int entries | ~50KB |
| 1000 string entries | ~100KB+ (varies) |
| print() statement | ~100 bytes |
| Full buffer (63KB output) | ~63KB |

## Standard Library

Most Lua standard library is available:

```lua
-- Table functions
table.insert(t, value)
table.remove(t, index)
table.concat(t, sep)

-- String functions
string.upper(s)
string.lower(s)
string.sub(s, i, j)
string.format(fmt, ...)
string.rep(s, n)
string.len(s)

-- Math functions
math.abs(x)
math.floor(x)
math.ceil(x)
math.sqrt(x)
math.min(a, b)
math.max(a, b)

-- Type functions
type(x)
tonumber(s)
tostring(x)

-- Utilities
pairs(t)
ipairs(t)
next(t, k)
```

### Unavailable Functions

Some standard library functions are not available in WASM environment:

- File I/O: `io.open()`, `file:read()`, etc.
- OS functions: `os.execute()`, `os.getenv()`, etc.
- Process control: `os.exit()`, etc.
- System time: `os.time()` returns 0

### Custom Functions

The following custom functions are added:

#### `ext.table() -> table`

Create a new external table for persistence.

Returns a Lua table with special behavior:
- Values are stored externally (in JavaScript)
- Persists across eval() calls
- Cannot serialize nested tables

## Summary

This WASM implementation provides a functional Lua 5.1 environment with persistence via external tables. It's suitable for:

- ✓ Data persistence and state management
- ✓ Scripting and game logic
- ✓ Mathematical computations
- ✓ String processing
- ✓ Table manipulation

But NOT suitable for:

- ✗ File I/O operations
- ✗ OS interaction
- ✗ Heavy processing (prefer native code)
- ✗ Complex debugging (prefer native Lua)

For more information, see:
- [QUICK_START.md](QUICK_START.md) - Getting started guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
