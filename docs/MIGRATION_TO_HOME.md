# Migration Guide: Memory → _home

## Overview

Version 2.0 of lua-persistent introduces `_home` as the canonical namespace for external storage, replacing the legacy `Memory` global. This guide will help you migrate your code smoothly.

## Why _home?

The `_home` naming better represents the "home directory" metaphor for process-owned state and eliminates confusion with WASM memory-related APIs like `getMemoryStats()`. It also aligns with future message-driven compute patterns where `_home` stores private state while inbox/outbox handle communication.

## TL;DR - Quick Migration

**Before:**
```lua
Memory.counter = (Memory.counter or 0) + 1
function Memory.greet(name)
  return "Hello, " .. name
end
```

**After:**
```lua
_home.counter = (_home.counter or 0) + 1
function _home.greet(name)
  return "Hello, " .. name
end
```

That's it! Just replace `Memory` with `_home` in your Lua code.

## Backward Compatibility

### Your Existing Code Will Continue To Work

The `Memory` alias is maintained for backward compatibility. Both names reference the **exact same table**:

```lua
_home.value = 42
print(Memory.value)  -- prints: 42

rawequal(Memory, _home)  -- returns: true
```

### Deprecation Timeline

| Version | Status |
|---------|--------|
| 2.0.x | `Memory` alias active, deprecation warnings in console |
| 2.1.x | `Memory` alias active, warnings enabled by default |
| 3.0.0 | `Memory` alias **removed** (breaking change) |

**Recommendation:** Update your code now to avoid disruption in v3.0.

## Migration Steps

### 1. Update Your Lua Code

Use find-and-replace in your codebase:

**Find:** `Memory\.` (with regex)  
**Replace:** `_home.`

**Find:** `Memory\[` (with regex)  
**Replace:** `_home[`

**Find:** `function Memory\.`  
**Replace:** `function _home.`

### 2. Update JavaScript API Calls (if applicable)

If you're using the JavaScript API directly:

**Before:**
```javascript
// Most apps won't have this - internal use only
const tableId = lua.getMemoryTableId();
```

**After:**
```javascript
// Recommended new name
const tableId = lua.getHomeTableId();

// Or keep using getMemoryTableId() - it still works
const tableId = lua.getMemoryTableId(); // Returns _home table ID
```

### 3. Test Your Migration

Run your test suite to verify:

```bash
npm test
```

All existing tests should pass without modification thanks to the backward compatibility alias.

### 4. Optional: Disable the Alias for Validation

To ensure you've migrated all code:

```javascript
// Disable the Memory alias
lua.setMemoryAliasEnabled(false);

// Run your code - any Memory references will fail
// Fix any failures, then re-enable for production
lua.setMemoryAliasEnabled(true);
```

## Common Patterns

### Pattern 1: Simple State Storage

**Before:**
```lua
if not Memory.initialized then
  Memory.counter = 0
  Memory.initialized = true
end
```

**After:**
```lua
if not _home.initialized then
  _home.counter = 0
  _home.initialized = true
end
```

### Pattern 2: Function Persistence

**Before:**
```lua
function Memory.increment()
  Memory.counter = (Memory.counter or 0) + 1
  return Memory.counter
end
```

**After:**
```lua
function _home.increment()
  _home.counter = (_home.counter or 0) + 1
  return _home.counter
end
```

### Pattern 3: Structured Data

**Before:**
```lua
Memory.users = Memory.users or {}
Memory.users[user_id] = {
  name = name,
  email = email
}
```

**After:**
```lua
_home.users = _home.users or {}
_home.users[user_id] = {
  name = name,
  email = email
}
```

### Pattern 4: Closures and Upvalues

**Before:**
```lua
function Memory.makeCounter()
  local count = 0
  return function()
    count = count + 1
    return count
  end
end
```

**After:**
```lua
function _home.makeCounter()
  local count = 0
  return function()
    count = count + 1
    return count
  end
end
```

## Persistence Format

### No Migration Needed for Stored Data

The underlying persistence format uses **numeric table IDs**, not string names. Your existing IndexedDB data will load seamlessly:

```javascript
// Old data format (still works)
{
  metadata: { memoryTableId: 1 },
  tables: { "1": { ... } }
}

// New data format (preferred)
{
  metadata: { homeTableId: 1, memoryTableId: 1 },  // Both for compatibility
  tables: { "1": { ... } }
}
```

The loader automatically handles both formats.

## FAQ

### Q: Will my existing saved state break?

**A:** No. The persistence system uses numeric table IDs internally. The rename only affects the Lua global variable name.

### Q: Can I use both names during migration?

**A:** Yes! They reference the same table, so you can migrate incrementally.

### Q: What happens if I forget to migrate before v3.0?

**A:** Your code will break with `attempt to index nil value (_G.Memory)` errors. The deprecation warnings will help you catch these.

### Q: Does this affect performance?

**A:** No. The alias is just a Lua reference (like a pointer). There's zero performance overhead.

### Q: Can I keep using `Memory` forever?

**A:** Not recommended. The alias will be removed in v3.0 to reduce maintenance burden and avoid confusion.

### Q: How do I suppress deprecation warnings?

**A:** Update your code to use `_home`. Warnings exist to help you migrate proactively.

## Automated Migration Script

For large codebases, use this shell script:

```bash
#!/bin/bash
# migrate-to-home.sh

# Backup first!
git checkout -b migrate-to-home

# Update Lua examples
find examples/ -name "*.lua" -exec sed -i '' 's/Memory\./_home\./g' {} \;
find examples/ -name "*.lua" -exec sed -i '' 's/Memory\[/_home[/g' {} \;

# Update HTML demos
find demo/ -name "*.html" -exec sed -i '' 's/Memory\./_home\./g' {} \;
find demo/ -name "*.html" -exec sed -i '' 's/Memory\[/_home[/g' {} \;

# Test
npm test

echo "Migration complete! Review changes and commit."
```

## Support

If you encounter issues during migration:

1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Review the [API Reference](./API_REFERENCE.md) for updated function names
3. Open an issue at https://github.com/twilson63/wasm-compute/issues

## Summary

- ✅ Replace `Memory` with `_home` in your Lua code
- ✅ Test thoroughly with the backward compatibility alias enabled
- ✅ Optionally disable the alias to find remaining references
- ✅ No data migration required - persistence format unchanged
- ✅ Update by v3.0 to avoid breaking changes

The `_home` naming provides clarity and aligns with future platform directions. Happy migrating!
