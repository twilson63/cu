# Memory Table Persistence Flow Analysis

## Executive Summary

The "Memory" table is a special external table that serves as persistent storage for Lua scripts. It flows from Lua → WASM → JavaScript bridge → IndexedDB. The system uses a **numeric table ID** (stored in `memory_table_id`) to track this table, NOT the string "Memory". The string "Memory" is only used as a **global variable name** in Lua.

## Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. LUA SCRIPT LAYER                                              │
│    Memory["key"] = value  ← User code accesses "Memory" global   │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. WASM LAYER (src/main.zig)                                     │
│    - memory_table_id: u32 = <numeric ID>                         │
│    - setup_memory_global() creates table & sets "Memory" global  │
│    - attach_memory_table() reattaches table ID to "Memory"       │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. EXTERNAL TABLE LAYER (src/ext_table.zig)                      │
│    - create_table() → returns u32 table_id                       │
│    - attach_table() → reattaches existing table_id               │
│    - __newindex/__index → calls JS bridge with table_id          │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. JS BRIDGE LAYER (web/lua-api.js)                              │
│    js_ext_table_set(table_id, key, value)                        │
│    - Uses numeric table_id as Map key                            │
│    - externalTables: Map<number, Map<string, Uint8Array>>        │
│    - memoryTableId variable tracks Memory's numeric ID           │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. PERSISTENCE LAYER (web/lua-persistence.js)                    │
│    saveTables(externalTables, metadata)                          │
│    - Saves ALL tables by numeric ID                              │
│    - metadata.memoryTableId = <the numeric ID for Memory>        │
│    - Stored in IndexedDB                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files & Functions

### 1. WASM Layer (Zig)

#### src/main.zig:16-16
```zig
var memory_table_id: u32 = 0;  // Global tracking Memory table's numeric ID
```

#### src/main.zig:73-76
```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);  // Create table, get numeric ID
    lua.setglobal(L, "Memory");                   // ← HARDCODED STRING "Memory"
}
```

#### src/main.zig:155-163
```zig
export fn attach_memory_table(table_id: u32) void {
    if (global_lua_state == null) return;
    if (table_id == 0) return;
    
    const L = global_lua_state.?;
    ext_table.attach_table(L, table_id);  // Reattach table by numeric ID
    lua.setglobal(L, "Memory");           // ← HARDCODED STRING "Memory"
    memory_table_id = table_id;
}
```

#### src/main.zig:165-167
```zig
export fn get_memory_table_id() u32 {
    return memory_table_id;  // JS reads this to track Memory table ID
}
```

### 2. External Table Management (Zig)

#### src/ext_table.zig:46-51
```zig
pub fn create_table(L: *lua.lua_State) u32 {
    const table_id = external_table_counter;  // Generate new numeric ID
    external_table_counter += 1;
    push_ext_table(L, table_id);              // Create proxy table with ID
    return table_id;
}
```

#### src/ext_table.zig:53-60
```zig
pub fn attach_table(L: *lua.lua_State, table_id: u32) void {
    if (table_id == 0) return;
    push_ext_table(L, table_id);  // Recreate proxy table with same ID
    if (table_id >= external_table_counter) {
        external_table_counter = table_id + 1;
    }
}
```

#### src/ext_table.zig:39-44
```zig
fn push_ext_table(L: *lua.lua_State, table_id: u32) void {
    lua.newtable(L);                         // Create Lua table
    lua.pushinteger(L, table_id);            // Store numeric ID
    lua.setfield(L, -2, "__ext_table_id");   // table.__ext_table_id = <numeric>
    ensure_metatable(L);                     // Add __index/__newindex metamethods
}
```

### 3. JavaScript Bridge

#### web/lua-api.js:231-242
```javascript
// In init() function
const exportedId = wasmInstance.exports.get_memory_table_id?.() ?? 0;
if (memoryTableId && memoryTableId !== exportedId && wasmInstance.exports.attach_memory_table) {
  wasmInstance.exports.attach_memory_table(memoryTableId);
} else if (!memoryTableId && exportedId > 0) {
  memoryTableId = exportedId;  // Track Memory table's numeric ID
}

const confirmedId = wasmInstance.exports.get_memory_table_id?.() ?? exportedId;
if (confirmedId > 0) {
  memoryTableId = confirmedId;
  ensureExternalTable(memoryTableId);  // Create Map entry for this ID
}
```

#### web/lua-api.js:95-109
```javascript
// JS bridge functions (imported by WASM)
js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
  const table = ensureExternalTable(tableId);  // Use numeric ID as Map key
  const keyBytes = readWasmMemory(keyPtr, keyLen);
  const keyStr = new TextDecoder().decode(keyBytes);
  const value = readWasmMemory(valPtr, valLen);
  table.set(keyStr, value);  // Store as binary data
  return 0;
}
```

### 4. Persistence Layer

#### web/lua-api.js:492-506
```javascript
export async function saveState() {
  try {
    const metadata = {
      memoryTableId,      // ← Save Memory's numeric ID in metadata
      nextTableId,
      savedAt: new Date().toISOString(),
      stateRestored,
    };
    await persistence.saveTables(externalTables, metadata);
    return true;
  } catch (error) {
    console.error('Failed to save state:', error);
    return false;
  }
}
```

#### web/lua-persistence.js:42-99
```javascript
async saveTables(externalTables, metadata = {}) {
  // ... clear existing data ...
  
  // Save all tables by numeric ID
  for (const [tableId, tableData] of externalTables) {
    const dataObj = {};
    for (const [key, value] of tableData) {
      if (value instanceof Uint8Array) {
        dataObj[key] = {
          _type: 'binary',
          data: Array.from(value)  // Serialize binary data
        };
      } else {
        dataObj[key] = value;
      }
    }
    
    const serializedData = {
      id: tableId,        // ← Numeric table ID
      data: dataObj
    };
    
    // ... store in IndexedDB ...
  }
  
  // Save metadata with memoryTableId
  const metadataRecord = {
    id: '__metadata__',
    data: {
      ...metadata,      // ← Includes memoryTableId
      tableCount: externalTables.size,
      tableIds: Array.from(externalTables.keys())
    }
  };
}
```

#### web/lua-api.js:511-571
```javascript
export async function loadState() {
  try {
    const { tables, metadata } = await persistence.loadTables();
    
    externalTables.clear();
    nextTableId = 1;
    memoryTableId = null;
    
    // Restore all tables by numeric ID
    for (const [id, table] of tables) {
      const numericId = Number(id);
      const tableMap = ensureExternalTable(numericId);
      tableMap.clear();
      for (const [key, value] of table) {
        tableMap.set(key, value);
      }
    }
    
    // Restore metadata
    if (metadata) {
      if (metadata.memoryTableId) {
        memoryTableId = metadata.memoryTableId;  // ← Restore Memory's ID
      }
      if (metadata.nextTableId) {
        nextTableId = metadata.nextTableId;
      }
      if (typeof metadata.stateRestored !== 'undefined') {
        stateRestored = metadata.stateRestored;
      }
    }
    
    // Sync counters
    const maxId = getMaxTableId();
    if (nextTableId <= maxId) {
      nextTableId = maxId + 1;
    }
    
    if (wasmInstance?.exports.sync_external_table_counter) {
      wasmInstance.exports.sync_external_table_counter(nextTableId);
    }
    
    // Reattach Memory table to WASM
    if (memoryTableId && wasmInstance?.exports.attach_memory_table) {
      wasmInstance.exports.attach_memory_table(memoryTableId);
      const confirmedId = wasmInstance.exports.get_memory_table_id?.() ?? memoryTableId;
      if (confirmedId > 0) {
        memoryTableId = confirmedId;
      }
    } else if (wasmInstance?.exports.get_memory_table_id) {
      const currentId = wasmInstance.exports.get_memory_table_id();
      if (currentId > 0 && !memoryTableId) {
        memoryTableId = currentId;
      }
      if (memoryTableId) {
        ensureExternalTable(memoryTableId);
      }
    }
    
    stateRestored = tables.size > 0;
    return true;
  } catch (error) {
    console.error('Failed to load state:', error);
    return false;
  }
}
```

## Critical Insights

### 1. "Memory" is Just a Variable Name

The string "Memory" is **ONLY** used as a Lua global variable name. The actual table is tracked by a **numeric ID** (`memory_table_id`). This numeric ID is what flows through the entire persistence system.

```lua
-- In Lua land:
Memory["key"] = value
-- This is equivalent to:
_G["Memory"]["key"] = value
-- Where _G["Memory"] is a proxy table with __ext_table_id = <some number>
```

### 2. No Table Name Mapping System

There is **NO** mapping from table names to table IDs anywhere in the codebase. The enhanced API has:

```javascript
this.externalTables.set('Memory', memoryTableId);  // Line 122
```

But this is in the **enhanced API only** and is NOT used by the core persistence system. The standard API only uses numeric IDs.

### 3. The memory_table_id Variable

This is the single source of truth for which numeric table ID corresponds to the "Memory" global:

- **Zig**: `var memory_table_id: u32 = 0;` (src/main.zig:16)
- **JS**: `let memoryTableId = null;` (web/lua-api.js - module scope)

These are synchronized via:
- `get_memory_table_id()` - WASM export to read the ID
- `attach_memory_table(id)` - WASM export to set the ID
- Metadata in IndexedDB - persists the ID across sessions

### 4. Hardcoded "Memory" String Literals

Found **ONLY** in these locations:

#### src/main.zig:75
```zig
lua.setglobal(L, "Memory");  // Initial setup
```

#### src/main.zig:161
```zig
lua.setglobal(L, "Memory");  // Reattach after restore
```

These are the ONLY places where "Memory" appears in the Zig/WASM layer. The JavaScript layer has NO hardcoded "Memory" references in the core persistence system.

### 5. Enhanced API Usage

The enhanced API uses 'Memory' as a string key in its table map:

#### web/enhanced/lua-api-enhanced.js:122
```javascript
this.externalTables.set('Memory', memoryTableId);
```

And in tests (tests/enhanced/enhanced-api.test.js), 'Memory' is passed as a table name parameter to `persistFunction()`:

```javascript
await lua.persistFunction('Memory', 'double', funcCode);
```

But this is used to create registry keys like `"Memory:double"` for function storage, NOT for table ID resolution.

## Changes Required for "_home" Migration

### Phase 1: Add Configuration Constant

Create a centralized constant in **src/main.zig**:

```zig
// Add near top of file with other constants
const MEMORY_TABLE_NAME = "_home";  // Changed from "Memory"
const LEGACY_MEMORY_TABLE_NAME = "Memory";  // For backward compatibility
```

### Phase 2: Update WASM Layer

#### src/main.zig:73-76
```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    lua.setglobal(L, MEMORY_TABLE_NAME);  // Use constant
    
    // Backward compatibility: create alias
    _ = lua.getglobal(L, MEMORY_TABLE_NAME);
    lua.setglobal(L, LEGACY_MEMORY_TABLE_NAME);
}
```

#### src/main.zig:155-163
```zig
export fn attach_memory_table(table_id: u32) void {
    if (global_lua_state == null) return;
    if (table_id == 0) return;
    
    const L = global_lua_state.?;
    ext_table.attach_table(L, table_id);
    lua.setglobal(L, MEMORY_TABLE_NAME);  // Use constant
    
    // Backward compatibility: create alias
    _ = lua.getglobal(L, MEMORY_TABLE_NAME);
    lua.setglobal(L, LEGACY_MEMORY_TABLE_NAME);
    
    memory_table_id = table_id;
}
```

### Phase 3: Update Enhanced API

#### web/enhanced/lua-api-enhanced.js:122
```javascript
// Change this line:
this.externalTables.set('Memory', memoryTableId);
// To:
this.externalTables.set('_home', memoryTableId);

// Add backward compatibility:
this.externalTables.set('Memory', memoryTableId);  // Keep for legacy code
```

### Phase 4: Update Tests

Replace all `'Memory'` references in tests with `'_home'`:

#### tests/enhanced/enhanced-api.test.js
```javascript
// Find and replace all instances:
await lua.persistFunction('Memory', 'double', funcCode);
// To:
await lua.persistFunction('_home', 'double', funcCode);
```

### Phase 5: Documentation Updates

Update all documentation to reference `_home` instead of `Memory`:
- docs/QUICK_START.md
- docs/API_REFERENCE.md
- README.md
- examples/*.lua

## Backward Compatibility Strategy

### Option A: Dual Global (Recommended)

Both `_home` and `Memory` point to the same table:

```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    
    // Push table onto stack
    ext_table.attach_table(L, memory_table_id);
    
    // Set both globals to the same table (table is at top of stack)
    lua.pushvalue(L, -1);  // Duplicate table on stack
    lua.setglobal(L, "_home");
    lua.setglobal(L, "Memory");  // Also set legacy name
}
```

**Pros:**
- Zero breaking changes
- Existing code continues to work
- Gradual migration path

**Cons:**
- Slight memory overhead (two global references)
- May confuse users about which to use

### Option B: Deprecation Warning

Add a `__newindex` metamethod to detect Memory usage:

```lua
-- Add in Lua initialization
local warned = false
Memory = setmetatable({}, {
  __index = _home,
  __newindex = function(t, k, v)
    if not warned then
      print("WARNING: 'Memory' is deprecated, use '_home' instead")
      warned = true
    end
    _home[k] = v
  end
})
```

**Pros:**
- Clear migration path
- Users are notified
- Can eventually remove

**Cons:**
- Requires metamethod overhead
- Prints warnings to console

### Option C: Configuration Flag

Add a flag to choose the name:

```javascript
// In loadLuaWasm() options
{
  memoryTableName: '_home',  // or 'Memory' for legacy
  enableLegacyAlias: true     // create both _home and Memory
}
```

**Pros:**
- Maximum flexibility
- Users control migration timeline

**Cons:**
- More complex configuration
- Testing burden increases

## Recommended Implementation Plan

### Step 1: Add Constant + Alias (Non-Breaking)

1. Add `MEMORY_TABLE_NAME = "_home"` constant in src/main.zig
2. Update `setup_memory_global()` to set both `_home` and `Memory` globals
3. Update `attach_memory_table()` to set both globals
4. **No JS changes needed** - the numeric ID system is name-agnostic

### Step 2: Update Examples & Docs

1. Update all examples to use `_home`
2. Add migration guide to docs
3. Keep "Memory" references with deprecation notes

### Step 3: Update Enhanced API

1. Change externalTables.set('Memory', ...) to set('_home', ...)
2. Keep legacy 'Memory' key for backward compatibility
3. Update tests to use '_home' primarily

### Step 4: Future Deprecation (Optional)

In a future major version:
1. Remove `Memory` global
2. Only create `_home`
3. Update all tests to use `_home` exclusively

## Key Takeaways

1. **The persistence system is name-agnostic** - it only cares about numeric table IDs
2. **"Memory" is only used in 2 places** - both in src/main.zig for Lua global naming
3. **No JavaScript changes needed for core persistence** - the renaming is purely Lua-side
4. **Backward compatibility is trivial** - just set both global names to the same table
5. **Enhanced API needs minor updates** - change the string key in externalTables Map
6. **Tests need updates** - replace 'Memory' string literals with '_home'

## Files Requiring Changes

### Must Change (Core Functionality)
1. **src/main.zig** (lines 75, 161) - Update global name
2. **web/enhanced/lua-api-enhanced.js** (line 122) - Update table name key

### Should Change (Tests & Examples)
3. **tests/enhanced/enhanced-api.test.js** - Replace 'Memory' with '_home' (14 occurrences)
4. **examples/*.lua** - Update example code to use _home
5. **docs/*.md** - Update documentation

### Optional (Backward Compatibility)
6. Add deprecation warnings/aliases as needed

## No Changes Needed

- **src/serializer.zig** - No table name references
- **src/ext_table.zig** - Only works with numeric IDs
- **web/lua-persistence.js** - Name-agnostic persistence
- **web/lua-deserializer.js** - No table references
- **web/lua-api.js** (core) - Uses numeric memoryTableId variable

The system is already architected to support this change easily!
