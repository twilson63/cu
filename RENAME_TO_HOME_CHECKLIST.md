# Rename "Memory" to "_home" - Implementation Checklist

## Summary

Renaming the Memory table to `_home` requires changes in **only 2 files** for core functionality, plus test/doc updates. The persistence system is completely name-agnostic and requires NO changes.

## Files That Need Changes

### ✅ MUST CHANGE - Core Functionality (2 files)

#### 1. src/main.zig
**Lines to change: 2**

**Line 75:** (in `setup_memory_global()`)
```zig
// BEFORE:
lua.setglobal(L, "Memory");

// AFTER (Option A - Dual global for backward compatibility):
lua.pushvalue(L, -1);  // Duplicate table on stack
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");  // Legacy alias

// AFTER (Option B - Clean rename, breaking change):
lua.setglobal(L, "_home");
```

**Line 161:** (in `attach_memory_table()`)
```zig
// BEFORE:
lua.setglobal(L, "Memory");

// AFTER (Option A - Dual global):
lua.pushvalue(L, -1);  // Duplicate table on stack  
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");  // Legacy alias

// AFTER (Option B - Clean rename):
lua.setglobal(L, "_home");
```

**Optional improvement - Add constant:**
```zig
// Add near line 9 (after other constants)
const MEMORY_TABLE_NAME = "_home";
const LEGACY_MEMORY_TABLE_NAME = "Memory";  // For backward compatibility

// Then use:
lua.setglobal(L, MEMORY_TABLE_NAME);
lua.setglobal(L, LEGACY_MEMORY_TABLE_NAME);  // If using dual global
```

#### 2. web/enhanced/lua-api-enhanced.js (if using enhanced API)
**Line 122:** (in `initializeMemory()`)
```javascript
// BEFORE:
this.externalTables.set('Memory', memoryTableId);

// AFTER (Option A - Dual key):
this.externalTables.set('_home', memoryTableId);
this.externalTables.set('Memory', memoryTableId);  // Legacy alias

// AFTER (Option B - Clean rename):
this.externalTables.set('_home', memoryTableId);
```

### 📝 SHOULD CHANGE - Tests (1 file)

#### 3. tests/enhanced/enhanced-api.test.js
**Lines to change: ~14 occurrences**

Global find & replace:
```javascript
// Find:    'Memory'
// Replace: '_home'

// Affected lines (approximate):
67, 86, 104, 114, 117, 139, 400, 404, 409, 435, 441, 481, 536, 588, 597, 628, 657
```

Examples:
```javascript
// BEFORE:
await lua.persistFunction('Memory', 'double', funcCode);

// AFTER:
await lua.persistFunction('_home', 'double', funcCode);
```

### 📚 SHOULD CHANGE - Examples (multiple files)

#### 4. examples/*.lua
Update all example files that reference `Memory`:

**examples/persistence-demo.lua:**
```lua
-- BEFORE:
Memory["username"] = "Alice"

-- AFTER:
_home["username"] = "Alice"
```

**examples/todo-list.lua:**
```lua
-- BEFORE:
Memory["todos"] = todos

-- AFTER:
_home["todos"] = todos
```

**Similar changes needed in:**
- examples/counter.lua
- examples/data-processing.lua
- examples/state-machine.lua

### 📖 SHOULD CHANGE - Documentation (multiple files)

#### 5. README.md
```markdown
<!-- BEFORE -->
Memory["key"] = value

<!-- AFTER -->
_home["key"] = value
```

#### 6. docs/QUICK_START.md
Update all code examples to use `_home`

#### 7. docs/API_REFERENCE.md
Update references and examples

#### 8. docs/TECHNICAL_REFERENCE.md
Update architecture descriptions

### ❌ NO CHANGES NEEDED

These files work with numeric table IDs only and are name-agnostic:

- ✅ src/serializer.zig - No table name references
- ✅ src/ext_table.zig - Works with numeric IDs only
- ✅ web/lua-persistence.js - Persists by numeric ID
- ✅ web/lua-deserializer.js - No table references
- ✅ web/lua-api.js (core) - Uses `memoryTableId` variable (numeric)
- ✅ web/lua-compute.js - No table references
- ✅ web/lua-restore.js - No table references

## Implementation Options

### Option A: Dual Global (Recommended) ⭐

**Pros:**
- ✅ Zero breaking changes
- ✅ Existing code continues to work
- ✅ Gradual migration path
- ✅ Users can adopt `_home` at their own pace

**Cons:**
- ⚠️ Two globals reference same table (minimal memory overhead)
- ⚠️ May confuse users about which to use

**Implementation:**
```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    // Table is now at top of stack
    lua.pushvalue(L, -1);  // Duplicate it
    lua.setglobal(L, "_home");     // Primary name
    lua.setglobal(L, "Memory");    // Legacy alias
}
```

**Migration Guide for Users:**
```lua
-- Both work identically:
Memory["key"] = "value"
_home["key"] = "value"

-- They reference the SAME table:
Memory.x = 1
print(_home.x)  --> 1

-- Recommended: Use _home for new code
_home.username = "alice"
```

### Option B: Clean Rename (Breaking Change)

**Pros:**
- ✅ Clean, no legacy baggage
- ✅ Forces adoption of new convention

**Cons:**
- ❌ **BREAKING CHANGE** - existing code will break
- ❌ All examples/docs must be updated before release
- ❌ Users must update their code immediately

**Implementation:**
```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    lua.setglobal(L, "_home");  // Only set new name
}
```

### Option C: Deprecation with Warning

**Pros:**
- ✅ Clear migration path
- ✅ Users are actively notified

**Cons:**
- ⚠️ Requires additional Lua code
- ⚠️ Performance overhead for warnings
- ⚠️ More complex implementation

**Implementation:**
```zig
fn setup_memory_global(L: *lua.lua_State) void {
    memory_table_id = ext_table.create_table(L);
    lua.setglobal(L, "_home");
    
    // Create deprecation wrapper
    const wrapper_code = 
        \\local warned = false
        \\Memory = setmetatable({}, {
        \\  __index = _home,
        \\  __newindex = function(t, k, v)
        \\    if not warned then
        \\      print("WARNING: 'Memory' is deprecated, use '_home' instead")
        \\      warned = true
        \\    end
        \\    _home[k] = v
        \\  end
        \\})
    ;
    _ = lua.luaL_dostring(L, wrapper_code);
}
```

## Recommended Implementation Steps

### Phase 1: Core Change (Non-Breaking)
1. ✅ Add `MEMORY_TABLE_NAME` constant to src/main.zig
2. ✅ Update src/main.zig:75 to set both `_home` and `Memory` globals
3. ✅ Update src/main.zig:161 to set both globals
4. ✅ Rebuild: `./build.sh`
5. ✅ Test: `npm test` (should pass without changes)

### Phase 2: Enhanced API Update
1. ✅ Update web/enhanced/lua-api-enhanced.js:122
2. ✅ Keep both 'Memory' and '_home' keys for compatibility
3. ✅ Test enhanced API

### Phase 3: Documentation Update
1. ✅ Update README.md
2. ✅ Update docs/QUICK_START.md
3. ✅ Update docs/API_REFERENCE.md
4. ✅ Add migration guide in docs/
5. ✅ Add deprecation notice for "Memory" global

### Phase 4: Examples Update
1. ✅ Update all examples/*.lua to use `_home`
2. ✅ Add comments showing legacy `Memory` still works
3. ✅ Update example README.md

### Phase 5: Tests Update
1. ✅ Update tests/enhanced/enhanced-api.test.js
2. ✅ Add tests for backward compatibility (both names work)
3. ✅ Run full test suite: `npm test`

### Phase 6: Announcement (Optional)
1. ✅ Add CHANGELOG entry
2. ✅ Create migration guide
3. ✅ Plan deprecation timeline for "Memory" global (if desired)

## Testing Checklist

After implementing changes:

```bash
# 1. Rebuild WASM
./build.sh

# 2. Run test suite
npm test

# 3. Test new _home global
node -e "
  import('./web/lua-api.js').then(async (lua) => {
    await lua.loadLuaWasm();
    lua.init();
    await lua.compute('_home.test = 123');
    const result = await lua.compute('return _home.test');
    console.log('_home works:', result);
  });
"

# 4. Test legacy Memory global (if dual global)
node -e "
  import('./web/lua-api.js').then(async (lua) => {
    await lua.loadLuaWasm();
    lua.init();
    await lua.compute('Memory.test = 456');
    const result = await lua.compute('return Memory.test');
    console.log('Memory works:', result);
  });
"

# 5. Test they're the same table (if dual global)
node -e "
  import('./web/lua-api.js').then(async (lua) => {
    await lua.loadLuaWasm();
    lua.init();
    await lua.compute('_home.x = 1');
    const result = await lua.compute('return Memory.x');
    console.log('Same table:', result === 1);
  });
"

# 6. Test persistence
node -e "
  import('./web/lua-api.js').then(async (lua) => {
    await lua.loadLuaWasm();
    lua.init();
    await lua.compute('_home.persist_test = \"hello\"');
    await lua.saveState();
    console.log('Saved with _home');
    
    // Reload
    lua.init();
    await lua.loadState();
    const result = await lua.compute('return _home.persist_test');
    console.log('Loaded with _home:', result);
  });
"
```

## Minimal Change Summary

**For the simplest, non-breaking implementation:**

1. Change 2 lines in `src/main.zig`:
   - Line 75: Add `lua.pushvalue(L, -1);` before, change to dual global
   - Line 161: Add `lua.pushvalue(L, -1);` before, change to dual global

2. Rebuild: `./build.sh`

3. Update docs to recommend `_home`, mention `Memory` still works

4. Done! Both `_home` and `Memory` will work identically.

## File Change Matrix

| File | Changes | Type | Priority | Breaking? |
|------|---------|------|----------|-----------|
| src/main.zig | 2 lines | Core | HIGH | No (if dual global) |
| web/enhanced/lua-api-enhanced.js | 1 line | Enhanced API | MEDIUM | No (if dual key) |
| tests/enhanced/enhanced-api.test.js | ~14 replacements | Tests | MEDIUM | N/A |
| examples/*.lua | Multiple | Examples | LOW | N/A |
| docs/*.md | Multiple | Docs | LOW | N/A |
| README.md | Multiple | Docs | MEDIUM | N/A |

Total core code changes: **2-3 lines**  
Total test changes: **~14 replacements**  
Total doc changes: **Multiple files**

## Verification

To verify the change worked:

```lua
-- Test 1: _home works
_home.test = "hello"
print(_home.test)  --> "hello"

-- Test 2: Memory works (if dual global)
Memory.test2 = "world"
print(Memory.test2)  --> "world"

-- Test 3: They're the same table (if dual global)
_home.x = 1
print(Memory.x)  --> 1
Memory.y = 2
print(_home.y)  --> 2

-- Test 4: Persistence works
_home.data = {a = 1, b = 2}
-- (save state)
-- (reload)
print(_home.data.a)  --> 1
```

## Conclusion

This is an **extremely simple change** because the persistence system is architected to be name-agnostic. The string "Memory" appears in only 2 places in the core codebase, both in src/main.zig. Everything else uses numeric table IDs.

**Recommended approach:** Option A (Dual Global) for zero breaking changes and smooth migration path.
