# Memory Table Quick Reference Card

## The 5-Minute Brief

### What is the "Memory" table?
A Lua global variable that provides persistent storage across WASM reloads.

### How is it tracked?
By a **numeric ID** (not the string "Memory"). The ID flows through:
- WASM: `memory_table_id: u32`
- JS: `memoryTableId: number`
- IndexedDB: `metadata.memoryTableId`

### Where is "Memory" string used?
**Only 2 places:**
1. src/main.zig:75
2. src/main.zig:161

Both are `lua.setglobal(L, "Memory")` calls.

### How to rename to "_home"?
Change those 2 lines to `lua.setglobal(L, "_home")`

### Backward compatibility?
Add before each setglobal:
```zig
lua.pushvalue(L, -1);  // Duplicate table
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");  // Legacy
```

## Data Flow Cheat Sheet

```
┌─────────────────────────────────────────────────┐
│ LUA LAYER                                        │
│ Memory["key"] = "value"                          │
│ ↓ uses table.__ext_table_id = 1                 │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ WASM LAYER (Zig)                                 │
│ memory_table_id = 1                              │
│ ext_table_newindex() → js_ext_table_set(1, ...) │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ JS BRIDGE                                        │
│ externalTables.get(1).set("key", value)          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ INDEXEDDB                                        │
│ {id: 1, data: {"key": ...}}                      │
│ {id: '__metadata__', data: {memoryTableId: 1}}   │
└─────────────────────────────────────────────────┘
```

## File Location Quick Reference

| Component | File | Line(s) |
|-----------|------|---------|
| "Memory" string literal | src/main.zig | 75, 161 |
| memory_table_id variable | src/main.zig | 16 |
| create Memory table | src/main.zig | 73-76 |
| attach Memory table | src/main.zig | 155-163 |
| get_memory_table_id export | src/main.zig | 165-167 |
| create_table function | src/ext_table.zig | 46-51 |
| attach_table function | src/ext_table.zig | 53-60 |
| __newindex metatable | src/ext_table.zig | 152-185 |
| __index metatable | src/ext_table.zig | 112-150 |
| js_ext_table_set bridge | web/lua-api.js | 95-109 |
| memoryTableId variable | web/lua-api.js | ~20 (module scope) |
| saveState function | web/lua-api.js | 492-506 |
| loadState function | web/lua-api.js | 511-571 |
| saveTables implementation | web/lua-persistence.js | 42-99 |
| loadTables implementation | web/lua-persistence.js | 105-148 |

## Key Functions

### WASM Exports (callable from JS)

```zig
// src/main.zig

// Get the numeric ID for Memory table
export fn get_memory_table_id() u32 {
    return memory_table_id;
}

// Attach an existing table ID to Memory global
export fn attach_memory_table(table_id: u32) void {
    const L = global_lua_state.?;
    ext_table.attach_table(L, table_id);
    lua.setglobal(L, "Memory");  // ← STRING HERE
    memory_table_id = table_id;
}
```

### External Table Creation

```zig
// src/ext_table.zig

pub fn create_table(L: *lua.lua_State) u32 {
    const table_id = external_table_counter;
    external_table_counter += 1;
    push_ext_table(L, table_id);  // Creates proxy with ID
    return table_id;
}

fn push_ext_table(L: *lua.lua_State, table_id: u32) void {
    lua.newtable(L);
    lua.pushinteger(L, table_id);
    lua.setfield(L, -2, "__ext_table_id");  // Store ID in table
    ensure_metatable(L);
}
```

### JS Bridge Functions

```javascript
// web/lua-api.js

// Called by WASM when Lua sets table[key] = value
js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
  const table = ensureExternalTable(tableId);  // Get/create Map for ID
  const key = readWasmMemory(keyPtr, keyLen);
  const value = readWasmMemory(valPtr, valLen);
  table.set(decodeKey(key), value);
  return 0;
}

// Called by WASM when Lua reads table[key]
js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
  const table = externalTables.get(tableId);
  if (!table) return -1;
  const key = readWasmMemory(keyPtr, keyLen);
  const value = table.get(decodeKey(key));
  if (!value) return -1;
  writeWasmMemory(valPtr, value, maxLen);
  return value.length;
}
```

## Metadata Structure

### Saved to IndexedDB

```javascript
{
  id: '__metadata__',
  data: {
    memoryTableId: 1,        // ← The numeric ID for "Memory" table
    nextTableId: 2,          // Next available ID
    tableCount: 1,           // Number of tables
    tableIds: [1],           // All table IDs
    savedAt: "2025-10-26...", // Timestamp
    stateRestored: false     // Restore flag
  }
}
```

### Table Data Record

```javascript
{
  id: 1,  // The numeric table ID
  data: {
    "key1": {
      _type: 'binary',
      data: [1, 2, 3, ...]  // Serialized value
    },
    "key2": {
      _type: 'binary',
      data: [4, 5, 6, ...]
    }
  }
}
```

## Implementation Patterns

### Creating Memory Table (Initial Setup)

```zig
fn setup_memory_global(L: *lua.lua_State) void {
    // Create external table, get numeric ID
    memory_table_id = ext_table.create_table(L);
    
    // Table is now on Lua stack, assign to global
    lua.setglobal(L, "Memory");  // ← CHANGE THIS
}
```

### Restoring Memory Table (After Load)

```zig
export fn attach_memory_table(table_id: u32) void {
    const L = global_lua_state.?;
    
    // Recreate table proxy with same numeric ID
    ext_table.attach_table(L, table_id);
    
    // Assign to global variable
    lua.setglobal(L, "Memory");  // ← CHANGE THIS
    
    // Update tracker
    memory_table_id = table_id;
}
```

### Dual Global Pattern (Backward Compatible)

```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    
    // Table is on stack, duplicate it
    lua.pushvalue(L, -1);
    
    // Set both globals to same table
    lua.setglobal(L, "_home");    // Primary name
    lua.setglobal(L, "Memory");   // Legacy alias
}
```

## Testing Commands

```bash
# Build
./build.sh

# Test suite
npm test

# Test _home global
node -e "import('./web/lua-api.js').then(async (lua) => {
  await lua.loadLuaWasm();
  lua.init();
  await lua.compute('_home.test = 123');
  const r = await lua.compute('return _home.test');
  console.log('Result:', r);
});"

# Test persistence
node -e "import('./web/lua-api.js').then(async (lua) => {
  await lua.loadLuaWasm();
  lua.init();
  await lua.compute('_home.data = \"persistent\"');
  await lua.saveState();
  lua.init();
  await lua.loadState();
  const r = await lua.compute('return _home.data');
  console.log('Restored:', r);
});"
```

## Common Pitfalls

### ❌ Don't: Rename JS variables
```javascript
// DON'T do this - breaks the sync mechanism
let homeTableId = null;  // Wrong!
```

The JS variable name `memoryTableId` is fine - it's just a tracker.

### ❌ Don't: Change IndexedDB metadata key
```javascript
// DON'T do this - breaks persistence
metadata = {
  homeTableId: 1,  // Wrong!
}
```

Keep `memoryTableId` as the metadata key name.

### ✅ Do: Only change Lua global name
```zig
// ONLY change this:
lua.setglobal(L, "_home");  // ✓ Correct
```

### ✅ Do: Update tests/docs to match
```lua
-- In examples and tests:
_home["key"] = value  -- ✓ Correct
```

## Summary

- **2 lines to change** for core functionality
- **Numeric IDs** are used throughout persistence
- **"Memory" string** only appears in Lua global naming
- **Dual global** provides zero-breaking-change migration
- **No JS changes** needed for core persistence

## See Also

- MEMORY_TABLE_ANALYSIS.md - Full technical analysis
- MEMORY_TABLE_FLOW.txt - Visual flow diagrams
- RENAME_TO_HOME_CHECKLIST.md - Step-by-step guide
- ANALYSIS_SUMMARY.md - Executive summary
