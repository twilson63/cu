# Memory Table Analysis - Executive Summary

## Quick Answer to Your Questions

### 1. How is the memory table identified and managed?

**Answer:** By a **numeric table ID** (u32), NOT by the string "Memory".

- **In WASM (Zig):** `memory_table_id: u32` variable (src/main.zig:16)
- **In JavaScript:** `memoryTableId` variable (web/lua-api.js)
- **In IndexedDB:** `metadata.memoryTableId` field
- **In Lua:** Table proxy with `__ext_table_id` field containing the numeric ID

The string "Memory" is ONLY a Lua global variable name pointing to this table.

### 2. How does the JavaScript bridge interact with the memory table?

**Answer:** Through numeric table IDs in the bridge functions.

```javascript
// All bridge functions use numeric table IDs:
js_ext_table_set(tableId, key, value)    // tableId is a number
js_ext_table_get(tableId, key)
js_ext_table_delete(tableId, key)

// Storage is by numeric ID:
externalTables = Map<number, Map<string, Uint8Array>>
externalTables.get(1).set("mykey", value)  // 1 is the numeric ID
```

The bridge is completely name-agnostic. It doesn't know or care that table ID 1 
is called "Memory" in Lua.

### 3. What is memory_table_id and how is it tracked?

**Answer:** It's a u32 variable that stores which numeric table ID corresponds to 
the "Memory" global variable.

**Zig side (src/main.zig:16):**
```zig
var memory_table_id: u32 = 0;
```

**JavaScript side (web/lua-api.js):**
```javascript
let memoryTableId = null;
```

**Synchronized via WASM exports:**
- `get_memory_table_id()` - Read from WASM
- `attach_memory_table(id)` - Write to WASM

**Persisted in IndexedDB:**
```javascript
metadata = {
  memoryTableId: 1,  // Saved across sessions
  ...
}
```

### 4. Hardcoded "Memory" references vs constants?

**Answer:** Only 2 hardcoded references, NO constants currently.

**Hardcoded locations:**
1. src/main.zig:75 - `lua.setglobal(L, "Memory")`
2. src/main.zig:161 - `lua.setglobal(L, "Memory")`

**No constants exist** - these should be centralized as:
```zig
const MEMORY_TABLE_NAME = "_home";
const LEGACY_MEMORY_TABLE_NAME = "Memory";  // For backward compatibility
```

## Complete Flow Summary

### Write Operation: Lua → IndexedDB

```
User code:              Memory["key"] = "value"
                              ↓
Lua lookup:             _G["Memory"] → table with __ext_table_id = 1
                              ↓
Metatable:              __newindex(table, "key", "value")
                              ↓
Extract ID:             table.__ext_table_id → 1
                              ↓
Serialize:              key → bytes, value → bytes
                              ↓
JS bridge:              js_ext_table_set(1, key_bytes, value_bytes)
                              ↓
Store in Map:           externalTables.get(1).set("key", value_bytes)
                              ↓
Save state:             persistence.saveTables(externalTables, {memoryTableId: 1})
                              ↓
IndexedDB:              { id: 1, data: {"key": {...}} }
                        { id: '__metadata__', data: {memoryTableId: 1} }
```

### Read Operation: IndexedDB → Lua

```
Load state:             persistence.loadTables()
                              ↓
Restore Map:            externalTables.set(1, Map{"key" => value_bytes})
                              ↓
Read metadata:          memoryTableId = metadata.memoryTableId  // = 1
                              ↓
Attach to WASM:         wasmInstance.exports.attach_memory_table(1)
                              ↓
Recreate proxy:         ext_table.attach_table(L, 1)
                              ↓
Set global:             lua.setglobal(L, "Memory")
                              ↓
User code:              Memory["key"] → triggers __index
                              ↓
Read from Map:          externalTables.get(1).get("key") → value_bytes
                              ↓
Deserialize:            value_bytes → "value"
                              ↓
Return to Lua:          "value"
```

## Files to Update for "_home" Rename

### Must Change (Core):
1. **src/main.zig** - Lines 75, 161 (2 changes)
2. **web/enhanced/lua-api-enhanced.js** - Line 122 (1 change)

### Should Change (Tests):
3. **tests/enhanced/enhanced-api.test.js** - 14 replacements

### Should Change (Docs/Examples):
4. **examples/*.lua** - Multiple files
5. **docs/*.md** - Multiple files
6. **README.md** - Multiple sections

### No Changes Needed:
- src/serializer.zig ✓
- src/ext_table.zig ✓
- web/lua-persistence.js ✓
- web/lua-deserializer.js ✓
- web/lua-api.js (core) ✓

## Backward Compatibility Implementation

### Option A: Dual Global (Recommended)

```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    lua.pushvalue(L, -1);        // Duplicate table
    lua.setglobal(L, "_home");   // New name
    lua.setglobal(L, "Memory");  // Legacy name
}
```

**Result:** Both `_home` and `Memory` work, reference the same table.

```lua
_home.x = 1
print(Memory.x)  --> 1  (they're the same table)
```

### Option B: Clean Rename (Breaking)

```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    lua.setglobal(L, "_home");  // Only new name
}
```

**Result:** Only `_home` works, `Memory` is undefined.

## Key Architectural Insights

### 1. Name-Agnostic Persistence
The persistence layer doesn't care about table names. It saves/loads by numeric ID:

```javascript
// Saving
for (const [tableId, data] of externalTables) {
  saveToIndexedDB({ id: tableId, data: data });
}

// Loading  
for (const record of indexedDB) {
  externalTables.set(record.id, record.data);
}
```

### 2. Single Source of Truth: Numeric ID
The numeric table ID flows through the entire system:

```
Lua table.__ext_table_id (number)
    ↓
WASM memory_table_id (u32)
    ↓
JS memoryTableId (number)
    ↓
IndexedDB metadata.memoryTableId (number)
```

### 3. "Memory" is Just Sugar
The string "Memory" is syntactic sugar for accessing a table:

```lua
-- These are equivalent:
Memory["key"] = value
_G["Memory"]["key"] = value

-- Where _G["Memory"] is a table with:
-- __ext_table_id = <some number>
-- __index = <metatable function>
-- __newindex = <metatable function>
```

### 4. Minimal Coupling
The WASM layer only needs to know:
- How to create external tables (returns numeric ID)
- How to attach external tables (accepts numeric ID)
- Which global variable to use (string literal "Memory" or "_home")

Everything else is handled by the numeric ID system.

## Recommended Actions

1. **Add constants** to src/main.zig for table names
2. **Implement dual global** (Option A) for backward compatibility
3. **Update enhanced API** to use '_home' as primary key
4. **Update tests** to use '_home'
5. **Update docs** to recommend '_home', note 'Memory' still works
6. **Update examples** to show '_home' usage

## Testing Strategy

```bash
# 1. Both names work
_home.x = 1
Memory.y = 2

# 2. They're the same table
_home.a = 1
assert(Memory.a == 1)

# 3. Persistence works with both
_home.data = "test"
-- save/reload
assert(Memory.data == "test")

# 4. Cross-name access
Memory.foo = "bar"
assert(_home.foo == "bar")
```

## Documentation Generated

1. **MEMORY_TABLE_ANALYSIS.md** - Complete technical analysis
2. **MEMORY_TABLE_FLOW.txt** - Visual flow diagrams
3. **RENAME_TO_HOME_CHECKLIST.md** - Implementation guide
4. **ANALYSIS_SUMMARY.md** - This file

## Conclusion

**TL;DR:** The rename is trivial (2 lines in src/main.zig) because the entire 
persistence system uses numeric IDs. The string "Memory" only appears in 2 
places for setting the Lua global variable name. Implementing dual globals 
(_home + Memory) provides zero-breaking-change backward compatibility.
