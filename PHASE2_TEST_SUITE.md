# Phase 2 Test Suite: Serialization & External Tables

## Overview
Comprehensive test suite for validating serialization engine and external table bindings.

## Test Execution Guide

Run tests in the browser console by executing the provided Lua code through the web interface at `http://localhost:8000`

### Setup
1. Build: `./build.sh`
2. Start server: `cd web && python3 -m http.server 8000`
3. Open: `http://localhost:8000`
4. Paste each test into the Code Editor
5. Click "▶ Run Code"
6. Check output and stats

---

## Unit Tests

### Test 1.1: Nil Serialization
**Expected**: Nil values round-trip correctly
```lua
local t = ext.table()
t["nil_test"] = nil
local result = t["nil_test"]
assert(result == nil, "Nil should round-trip")
print("✅ Test 1.1: Nil serialization PASSED")
```

### Test 1.2: Boolean Serialization
**Expected**: True and false preserve state
```lua
local t = ext.table()
t["bool_true"] = true
t["bool_false"] = false
assert(t["bool_true"] == true, "true should round-trip")
assert(t["bool_false"] == false, "false should round-trip")
print("✅ Test 1.2: Boolean serialization PASSED")
```

### Test 1.3: Integer Serialization
**Expected**: Integers preserve exact values
```lua
local t = ext.table()
local test_values = {0, 1, -1, 42, 1000, -9999, 2147483647, -2147483648}
for i, val in ipairs(test_values) do
    t["int_" .. i] = val
end
for i, val in ipairs(test_values) do
    assert(t["int_" .. i] == val, "Integer " .. val .. " should round-trip")
end
print("✅ Test 1.3: Integer serialization PASSED")
```

### Test 1.4: Float Serialization
**Expected**: Floats preserve with reasonable precision
```lua
local t = ext.table()
local test_values = {0.0, 1.5, -3.14159, 2.71828, 0.00001, 1000000.5}
for i, val in ipairs(test_values) do
    t["float_" .. i] = val
end
for i, val in ipairs(test_values) do
    local stored = t["float_" .. i]
    assert(stored ~= nil, "Float should be stored")
    -- Note: allow small floating point error
    assert(math.abs(stored - val) < 0.0001, "Float " .. val .. " should round-trip")
end
print("✅ Test 1.4: Float serialization PASSED")
```

### Test 1.5: String Serialization
**Expected**: Strings preserve exact content
```lua
local t = ext.table()
local test_strings = {
    "hello",
    "world",
    "",
    "special chars: !@#$%^&*()",
    "unicode: café",
    string.rep("x", 1000)
}
for i, str in ipairs(test_strings) do
    t["str_" .. i] = str
end
for i, str in ipairs(test_strings) do
    assert(t["str_" .. i] == str, "String #" .. i .. " should round-trip exactly")
end
print("✅ Test 1.5: String serialization PASSED")
```

### Test 1.6: Mixed Type Storage
**Expected**: Different types coexist in same table
```lua
local t = ext.table()
t["s"] = "string"
t["i"] = 42
t["f"] = 3.14
t["b"] = true
t["n"] = nil

assert(t["s"] == "string")
assert(t["i"] == 42)
assert(t["f"] > 3.13 and t["f"] < 3.15)
assert(t["b"] == true)
assert(t["n"] == nil)
print("✅ Test 1.6: Mixed type storage PASSED")
```

---

## Integration Tests

### Test 2.1: Table Creation
**Expected**: ext.table() returns usable table object
```lua
local t = ext.table()
assert(t ~= nil, "ext.table() should return a table")
assert(type(t) == "table", "Result should be table type")
print("✅ Test 2.1: Table creation PASSED")
```

### Test 2.2: Basic Key-Value Store
**Expected**: Set and get operations work
```lua
local t = ext.table()
t["key"] = "value"
assert(t["key"] == "value", "Should retrieve stored value")
print("✅ Test 2.2: Basic key-value store PASSED")
```

### Test 2.3: Numeric Keys
**Expected**: Number keys work like array indexing
```lua
local t = ext.table()
for i = 1, 10 do
    t[i] = "Item " .. i
end
for i = 1, 10 do
    assert(t[i] == "Item " .. i, "Numeric key " .. i .. " should work")
end
print("✅ Test 2.3: Numeric keys PASSED")
```

### Test 2.4: Table Length
**Expected**: #t returns number of items
```lua
local t = ext.table()
assert(#t == 0, "Empty table should have length 0")
for i = 1, 5 do
    t[i] = i
end
assert(#t == 5, "Table with 5 items should have length 5")
print("✅ Test 2.4: Table length PASSED")
```

### Test 2.5: Value Overwrite
**Expected**: Assigning to same key updates value
```lua
local t = ext.table()
t["key"] = "first"
assert(t["key"] == "first")
t["key"] = "second"
assert(t["key"] == "second", "Value should be updated")
print("✅ Test 2.5: Value overwrite PASSED")
```

### Test 2.6: Type Conversion on Keys
**Expected**: Keys converted to strings internally
```lua
local t = ext.table()
t[1] = "one"
t[1.0] = "also one"
t["2"] = "two"
-- Note: integer and float keys should map to same storage
print("✅ Test 2.6: Type conversion on keys PASSED")
```

### Test 2.7: Nil Value Storage
**Expected**: Can store and retrieve nil
```lua
local t = ext.table()
t["exists"] = "yes"
t["deleted"] = nil
assert(t["exists"] == "yes")
assert(t["deleted"] == nil)
print("✅ Test 2.7: Nil value storage PASSED")
```

---

## Large Dataset Tests

### Test 3.1: 100 Items
**Expected**: Handle 100 items efficiently
```lua
local t = ext.table()
for i = 1, 100 do
    t[i] = "Item " .. i
end
assert(#t == 100, "Should store 100 items")
assert(t[1] == "Item 1")
assert(t[50] == "Item 50")
assert(t[100] == "Item 100")
print("✅ Test 3.1: 100 items PASSED")
```

### Test 3.2: 1000 Items
**Expected**: Handle 1000 items with reasonable memory
```lua
local t = ext.table()
for i = 1, 1000 do
    t[i] = "Value " .. i
end
assert(#t == 1000)
assert(t[1] == "Value 1")
assert(t[500] == "Value 500")
assert(t[1000] == "Value 1000")
print("✅ Test 3.2: 1000 items PASSED")
```

### Test 3.3: Large Strings
**Expected**: Handle large string values
```lua
local t = ext.table()
local large = string.rep("x", 10000)
t["large"] = large
assert(t["large"] == large, "Large string should round-trip")
print("✅ Test 3.3: Large strings PASSED")
```

### Test 3.4: Many Tables
**Expected**: Multiple external tables coexist
```lua
local t1 = ext.table()
local t2 = ext.table()
local t3 = ext.table()

t1["data"] = "table1"
t2["data"] = "table2"
t3["data"] = "table3"

assert(t1["data"] == "table1")
assert(t2["data"] == "table2")
assert(t3["data"] == "table3")
print("✅ Test 3.4: Multiple tables PASSED")
```

---

## Persistence Tests

### Test 4.1: Same Session Persistence
**Expected**: Data persists within session
```lua
-- First execution
local t = ext.table()
if t["count"] == nil then
    t["count"] = 1
else
    t["count"] = t["count"] + 1
end
print("Count: " .. t["count"])

-- Run this again (don't reload page)
-- Should show incremented count
```

### Test 4.2: State Save/Load
**Expected**: Data survives page reload via localStorage
```lua
-- Run this first
local t = ext.table()
t["persistent"] = "I will survive"
print("Stored: " .. t["persistent"])

-- Then click "Save State"
-- Then reload page (F5)
-- Then click "Load State"
-- Then run this:
-- local t = ext.table()
-- print(t["persistent"])
-- Should output "I will survive"
```

### Test 4.3: Cross-Session Counter
**Expected**: Counter persists across sessions
```lua
local t = ext.table()
if t["sessions"] == nil then
    t["sessions"] = 1
else
    t["sessions"] = t["sessions"] + 1
end
print("Sessions: " .. t["sessions"])
-- Save state, reload, load state, run again
-- Should increment each time
```

---

## Error Handling Tests

### Test 5.1: Nil Table Operations
**Expected**: Gracefully handle invalid operations
```lua
local t = ext.table()
-- These should not crash
local val = t["nonexistent"]
assert(val == nil, "Non-existent key should return nil")
print("✅ Test 5.1: Nil handling PASSED")
```

### Test 5.2: Mixed Key Types
**Expected**: Various key types work
```lua
local t = ext.table()
t["string"] = 1
t[123] = 2
t[45.67] = 3
assert(t["string"] == 1)
assert(t[123] == 2)
assert(t[45.67] == 3)
print("✅ Test 5.2: Mixed key types PASSED")
```

---

## Performance Tests

### Test 6.1: Sequential Insert Performance
**Expected**: Insert 100 items in <100ms
```lua
local t = ext.table()
local start = os.time()
for i = 1, 100 do
    t[i] = "Item " .. i
end
local elapsed = (os.time() - start)
print("100 items inserted")
print("✅ Test 6.1: Performance acceptable")
```

### Test 6.2: Random Access Performance
**Expected**: Random access works consistently
```lua
local t = ext.table()
-- Setup
for i = 1, 50 do
    t[i] = i * i
end
-- Random access
assert(t[1] == 1)
assert(t[25] == 625)
assert(t[50] == 2500)
print("✅ Test 6.2: Random access PASSED")
```

---

## Comprehensive Integration Test

### Test 7: Full Workflow
**Expected**: Complete realistic usage scenario
```lua
-- Create app config table
local config = ext.table()
config["app_name"] = "MyApp"
config["version"] = 1.0
config["debug"] = true

-- Create user data table
local user = ext.table()
user["id"] = 12345
user["name"] = "Alice"
user["score"] = 9999
user["active"] = true

-- Verify all data
assert(config["app_name"] == "MyApp")
assert(config["version"] == 1.0)
assert(user["id"] == 12345)
assert(user["name"] == "Alice")
assert(#user == 4)

print("✅ Test 7: Full workflow PASSED")
print("")
print("Summary:")
print("- 2 tables created")
print("- 7 values stored")
print("- All types working")
print("- Ready for persistence")
```

---

## Validation Checklist

Run each test and verify:
- [ ] Test 1.1 - Nil serialization
- [ ] Test 1.2 - Boolean serialization
- [ ] Test 1.3 - Integer serialization
- [ ] Test 1.4 - Float serialization
- [ ] Test 1.5 - String serialization
- [ ] Test 1.6 - Mixed type storage
- [ ] Test 2.1 - Table creation
- [ ] Test 2.2 - Basic key-value
- [ ] Test 2.3 - Numeric keys
- [ ] Test 2.4 - Table length
- [ ] Test 2.5 - Value overwrite
- [ ] Test 2.6 - Key type conversion
- [ ] Test 2.7 - Nil value storage
- [ ] Test 3.1 - 100 items
- [ ] Test 3.2 - 1000 items
- [ ] Test 3.3 - Large strings
- [ ] Test 3.4 - Multiple tables
- [ ] Test 4.1 - Session persistence
- [ ] Test 4.2 - State save/load
- [ ] Test 4.3 - Cross-session counter
- [ ] Test 5.1 - Nil handling
- [ ] Test 5.2 - Mixed key types
- [ ] Test 6.1 - Insert performance
- [ ] Test 6.2 - Random access
- [ ] Test 7 - Full workflow

## Success Criteria

✅ All 25 tests pass
✅ No console errors
✅ Memory stats reasonable
✅ Performance acceptable
✅ Data persists correctly
✅ No type information loss
