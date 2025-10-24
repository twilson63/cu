# Troubleshooting Guide - Lua WASM Persistent

Common issues, solutions, and debugging techniques.

## Table of Contents

1. [Initialization Issues](#initialization-issues)
2. [Evaluation Issues](#evaluation-issues)
3. [Data Persistence Issues](#data-persistence-issues)
4. [Performance Issues](#performance-issues)
5. [Error Handling Issues](#error-handling-issues)
6. [Browser Compatibility](#browser-compatibility)
7. [Memory Issues](#memory-issues)
8. [FAQ](#faq)

## Initialization Issues

### "WASM module failed to instantiate"

**Symptom:** Error when loading lua.wasm

**Causes:**
1. File not found
2. WASM binary corrupted
3. Browser doesn't support WebAssembly

**Solutions:**
```javascript
// Check if file exists
await fetch('web/lua.wasm').then(r => {
    if (!r.ok) throw new Error('WASM file not found');
});

// Check browser support
if (!window.WebAssembly) {
    console.error('WebAssembly not supported');
}

// Try loading with error details
try {
    const response = await fetch('web/lua.wasm');
    const buffer = await response.arrayBuffer();
    const module = await WebAssembly.instantiate(buffer, imports);
} catch (e) {
    console.error('Failed to instantiate:', e);
}
```

### "init() returned -1"

**Symptom:** Module loaded but initialization failed

**Causes:**
1. Out of memory
2. Lua state creation failed

**Solutions:**
```javascript
const lua = new LuaPersistent();
const result = lua.init();
if (result !== 0) {
    console.error('Lua initialization failed');
    // Check memory stats
    const stats = lua.getMemoryStats();
    console.log('Available memory:', stats.wasm_pages * 65536);
}
```

### "Buffer pointer is null"

**Symptom:** Cannot access IO buffer

**Causes:**
1. Module not initialized
2. get_buffer_ptr() not exported

**Solutions:**
```javascript
// Ensure init() called first
if (!lua.instance) {
    await lua.load('web/lua.wasm');
    lua.init();
}

// Check exports
const instance = lua.instance;
if (!instance.exports.get_buffer_ptr) {
    console.error('get_buffer_ptr not exported');
}
```

## Evaluation Issues

### "eval() returns null but no error"

**Symptom:** Code doesn't execute, no error message

**Causes:**
1. Empty code string
2. Code exceeds buffer size
3. Lua state not initialized

**Solutions:**
```javascript
// Check code length
if (code.length === 0) {
    console.warn('Empty code provided');
}
if (code.length > 65536) {
    console.warn('Code exceeds 64KB buffer');
    // Split code into chunks
    const chunks = code.match(/.{1,32768}/g);
}

// Verify state
if (!lua.instance) {
    await lua.init();
}

// Try simpler code
const test = lua.eval('return 42');
if (test === null) {
    console.error('Even simple code fails');
}
```

### "eval() returns nothing"

**Symptom:** Code executes but result.value is undefined

**Causes:**
1. Code doesn't return a value
2. Return value is nil
3. Deserialization failed

**Solutions:**
```lua
-- WRONG: no return statement
print("hello")

-- RIGHT: explicit return
print("hello")
return 42
```

```javascript
// Check what was returned
const result = lua.eval('print("test"); return 42');
console.log('Output:', result.output);      // "test\n"
console.log('Value:', result.value);        // 42
console.log('Has value:', result.value !== undefined);  // true
console.log('Value is null:', result.value === null);   // false (nil)
```

### "eval() returns nil when expecting value"

**Symptom:** Return value shows as null instead of actual value

**Causes:**
1. No explicit return statement
2. Code returns nil
3. Stack cleared before encoding

**Solutions:**
```lua
-- Check what you're returning
return x   -- Returns the value of x
-- vs
x = value  -- Just assigns, returns nil
```

```javascript
// Distinguish between nil and undefined
const result = lua.eval('return nil');
console.log(result.value === null);        // true (nil)

const result2 = lua.eval('return 42');
console.log(result2.value === null);       // false
console.log(typeof result2.value);         // 'number'
```

### "eval() takes too long"

**Symptom:** Code execution is very slow

**Causes:**
1. Long loop without optimization
2. Large output being processed
3. Heavy serialization

**Solutions:**
```lua
-- SLOW: 1 million iterations
local sum = 0
for i = 1, 1000000 do
    sum = sum + i
end

-- FAST: direct calculation
local sum = 1000000 * 1000001 / 2
```

```lua
-- SLOW: million tiny operations
for i = 1, 1000000 do
    t["key_" .. i] = i
end

-- FAST: batch operations
local batch = {}
for i = 1, 1000 do
    batch[i] = i
end
for j = 1, 1000 do
    for i = 1, 1000 do
        t["key_" .. (j-1)*1000+i] = batch[i]
    end
end
```

## Data Persistence Issues

### "External table loses data after eval()"

**Symptom:** Data stored in ext.table() is gone on next eval()

**Causes:**
1. Variable not properly assigned
2. Scope issues
3. Type check failure

**Solutions:**
```javascript
// WRONG: table goes out of scope
lua.eval(`
    local t = ext.table()
    t["key"] = "value"
`);
lua.eval('return t["key"]');  // Error: t is undefined

// RIGHT: assign to global
lua.eval(`
    data = ext.table()
    data["key"] = "value"
`);
lua.eval('return data["key"]');  // "value"
```

### "External table shows empty"

**Symptom:** ext.table() seems to have no data

**Causes:**
1. Checking wrong table
2. Different ext.table() instance
3. Data type mismatch

**Solutions:**
```lua
-- Check table exists and has data
local t = ext.table()
t["a"] = 1
t["b"] = 2

print("Table size: " .. #t)           -- 2
print("Has 'a': " .. (t["a"] or "missing"))  -- 1

-- Iterate to verify
for k, v in pairs(t) do
    print("Key: " .. k .. ", Value: " .. v)
end
```

```javascript
// Verify operations succeed
const result = lua.eval(`
    local t = ext.table()
    t["key"] = "value"
    print("Stored: " .. (t["key"] or "failed"))
    return #t
`);
console.log('Result:', result);
```

### "Data type changes in external table"

**Symptom:** Stored value has wrong type when retrieved

**Causes:**
1. Serialization mismatch
2. Key confusion (string vs number)
3. Type conversion

**Solutions:**
```lua
-- Be explicit about types
local t = ext.table()
t["count"] = 42          -- Store as integer
print(type(t["count"]))  -- "number"
print(t["count"])        -- 42

-- Avoid accidental conversion
t["42"] = "string"       -- String key
t[42] = "number"         -- Number key (different!)
print(t["42"])           -- "string"
print(t[42])             -- "number"
```

## Performance Issues

### "eval() execution slow for large operations"

**Symptom:** Performance worse than expected

**Causes:**
1. Inefficient Lua code
2. Too many small FFI calls
3. Output buffer exceeded

**Solutions:**
```lua
-- Profile your code
local start = os.time() * 1000
-- ... your code ...
local elapsed = os.time() * 1000 - start
print("Time: " .. elapsed .. "ms")
```

```javascript
// Measure JavaScript side
const start = performance.now();
const result = lua.eval(code);
const elapsed = performance.now() - start;
console.log(`Executed in ${elapsed.toFixed(2)}ms`);
```

### "Memory usage grows constantly"

**Symptom:** Memory stats keep increasing

**Causes:**
1. Memory leak in Lua code
2. Large output buffer
3. External table growth

**Solutions:**
```javascript
// Monitor memory
const before = lua.getMemoryStats();
lua.eval(someCode);
const after = lua.getMemoryStats();
console.log('Memory delta:', after.lua_memory_used - before.lua_memory_used);

// Force garbage collection
lua.gc();
const stats = lua.getMemoryStats();
console.log('After GC:', stats);
```

```lua
-- Check for unintended accumulation
local t = ext.table()
for i = 1, 100000 do
    t["data_" .. i] = "value"
end
print("Table size: " .. #t)  -- 100000

-- If you don't need this data, clear it
for k, v in pairs(t) do
    t[k] = nil
end
```

### "Large output (> 63KB) is truncated"

**Symptom:** Output ends with "..." and is incomplete

**Causes:**
1. Output buffer exceeded (63KB limit)
2. Result encoding overflow

**Solutions:**
```lua
-- WRONG: massive output
for i = 1, 100000 do
    print("Line " .. i)
end

-- RIGHT: split output
local lines = {}
for i = 1, 100000 do
    table.insert(lines, "Line " .. i)
end
local output = table.concat(lines, "\n")
print("First 100 lines:")
print(table.concat(lines, "\n", 1, 100))
```

```javascript
// Alternative: process in chunks
const lines = [];
for (let i = 0; i < 1000; i++) {
    const result = lua.eval(`
        batch = ext.table()
        for j = 1, 100 do
            batch[j] = "line_" .. (${i} * 100 + j)
        end
        return #batch
    `);
    // Process result
}
```

## Error Handling Issues

### "Error message is incomplete or cut off"

**Symptom:** Error message ends abruptly

**Causes:**
1. Error buffer exceeded
2. Binary data in error message
3. Truncation at bad boundary

**Solutions:**
```javascript
const result = lua.eval(badCode);
if (result === null) {
    const error = lua.getLastError();
    console.log('Error length:', error.length);
    console.log('Full error:', error);
    
    // Error might be truncated
    if (error.endsWith('...')) {
        console.warn('Error message was truncated');
    }
}
```

### "Stack is corrupted after error"

**Symptom:** Subsequent evals fail or behave strangely

**Causes:**
1. Old Lua WASM version (should be fixed)
2. Not using current library

**Solutions:**
```javascript
// This should work - stack is auto-cleared
lua.eval('invalid code');
const result = lua.eval('return 42');  // Should still work
console.log(result.value);  // 42
```

### "Code works standalone but fails in application"

**Symptom:** Code works in browser console but not in app

**Causes:**
1. Context or state differences
2. Timing issues
3. Global variables not initialized

**Solutions:**
```javascript
// Test in exact context
const code = `
    -- Your code here
    return 42
`;

// Test initialization
console.log('Lua initialized:', lua.instance !== null);
console.log('Buffer size:', lua.getMemoryStats().io_buffer_size);

// Test with simpler code first
const simple = lua.eval('return 1');
console.log('Simple code works:', simple !== null);

// Then test your code
const result = lua.eval(code);
console.log('Your code result:', result);
```

## Browser Compatibility

### "Code works in Chrome but not in Firefox"

**Symptom:** Browser-specific failure

**Causes:**
1. WebAssembly differences
2. JavaScript API differences
3. Buffer alignment issues

**Solutions:**
```javascript
// Check browser
const isChrome = /Chrome/.test(navigator.userAgent);
const isFirefox = /Firefox/.test(navigator.userAgent);
const isSafari = /Safari/.test(navigator.userAgent);

console.log('Browser:', {isChrome, isFirefox, isSafari});

// Test WASM support
console.log('WASM support:', typeof WebAssembly !== 'undefined');
console.log('SharedArrayBuffer:', typeof SharedArrayBuffer !== 'undefined');
```

### "Memory buffer access throws error"

**Symptom:** Direct memory access fails

**Causes:**
1. Memory not initialized
2. Buffer address out of bounds
3. Browser restrictions

**Solutions:**
```javascript
// Use safe accessor
const buffer = lua.getBuffer();
if (!buffer) {
    console.error('Buffer not available');
}

// Check bounds
const size = lua.getMemoryStats().io_buffer_size;
const offset = 0;
if (offset < 0 || offset >= size) {
    console.error('Offset out of bounds');
}
```

## Memory Issues

### "Out of memory (2MB limit)"

**Symptom:** Execution fails with memory error

**Causes:**
1. Too much data in external tables
2. Large Lua objects
3. Output buffer full

**Solutions:**
```javascript
// Monitor memory before operations
const stats = lua.getMemoryStats();
const available = (stats.wasm_pages * 65536) - stats.lua_memory_used;
console.log(`Available: ${(available / 1024).toFixed(0)}KB`);

if (available < 100000) {  // Less than 100KB
    console.warn('Memory running low');
    lua.gc();
}
```

```lua
-- Batch large operations
local t = ext.table()
local batch_size = 100

for i = 1, 10000 do
    t["item_" .. i] = {id=i, data="x"}
    
    if i % batch_size == 0 then
        print("Stored " .. i .. " items")
        -- Process batch, then clear if needed
    end
end
```

### "Garbage collection doesn't help"

**Symptom:** Memory stays high after gc()

**Causes:**
1. Persistent external tables
2. Large output buffer
3. GC doesn't reclaim everything

**Solutions:**
```javascript
// Clear external tables
lua.eval('t = nil; data = nil');  // Release Lua references
lua.gc();

// Check if it helps
const before = lua.getMemoryStats();
lua.gc();
const after = lua.getMemoryStats();
console.log('GC freed:', before.lua_memory_used - after.lua_memory_used, 'bytes');
```

## FAQ

### Q: How do I debug Lua code?

**A:** Use print() statements:
```lua
print("Debug: x = " .. tostring(x))
print("Type: " .. type(y))
print("Table contents:")
for k, v in pairs(t) do
    print("  " .. k .. " => " .. tostring(v))
end
```

### Q: Can I use coroutines?

**A:** No, coroutines are not supported. Use regular functions instead.

### Q: How do I load files?

**A:** File I/O is not supported. Embed data in code or use external tables to pass data.

### Q: Why is string concatenation slow?

**A:** Each concatenation creates a new string. Use table.concat() instead:
```lua
-- SLOW
local s = ""
for i = 1, 1000 do
    s = s .. "line\n"
end

-- FAST
local lines = {}
for i = 1, 1000 do
    table.insert(lines, "line")
end
local s = table.concat(lines, "\n")
```

### Q: How much data can I store?

**A:** Up to 2MB total WASM memory, shared between Lua heap and external tables. Typical: 1-10MB of external data via Maps.

### Q: Is it thread-safe?

**A:** No. Each LuaPersistent instance is independent. For concurrent use, create separate instances.

## Getting Help

If none of these solutions work:

1. **Check the browser console** for detailed error messages
2. **Verify browser compatibility** (Chrome, Firefox, Safari, Edge)
3. **Try a minimal example** to isolate the issue
4. **Check memory stats** to rule out memory problems
5. **Report the issue** with:
   - Browser and version
   - WASM file size and build date
   - Minimal code to reproduce
   - Browser console output

See [QUICK_START.md](QUICK_START.md) for basic setup help.
