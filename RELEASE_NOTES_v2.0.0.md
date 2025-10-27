# Release Notes - Version 2.0.0

## 🚀 Cu WASM External Storage API v2.0.0

**Release Date:** October 26, 2025  
**Migration Required:** Recommended (but not mandatory)  
**Breaking Changes:** None (with backward compatibility)

---

## 🎯 Major Changes

### `_home` Replaces `Memory` as Primary Storage Namespace

The external storage table has been renamed from `Memory` to `_home` to better represent the "home directory" metaphor for process-owned persistent state.

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

### ✅ Full Backward Compatibility

Your existing code will continue to work without modification:
- `Memory` is available as an alias to `_home`
- Both names reference the **exact same table**
- All persisted data loads seamlessly
- Zero performance impact

---

## 🆕 New Features

### 1. Feature Flag for Alias Control

Control the `Memory` alias via JavaScript API:

```javascript
// Disable legacy alias for testing
lua.setMemoryAliasEnabled(false);

// Re-enable for production
lua.setMemoryAliasEnabled(true);
```

### 2. Enhanced Table ID API

```javascript
// New (recommended)
const tableId = lua.getHomeTableId();

// Old (still works)
const tableId = lua.getMemoryTableId(); // Returns _home table ID
```

### 3. Deprecation Warnings

Console warnings guide migration when using legacy naming:
```
⚠️ Loading state with legacy memoryTableId. Please update to homeTableId.
```

---

## 📦 What's Included

### Core Updates
- ✅ Zig layer updated with `_home` constants
- ✅ JavaScript APIs updated (web/, demo/, enhanced/)
- ✅ Feature flag for backward compatibility control

### Examples & Demos
- ✅ All HTML demos updated to use `_home`
- ✅ 68+ code examples modernized
- ✅ UI labels and messages refreshed

### Documentation
- ✅ Complete migration guide ([docs/MIGRATION_TO_HOME.md](docs/MIGRATION_TO_HOME.md))
- ✅ Updated API reference
- ✅ New quick start guide with `_home`
- ✅ Technical reference expanded

### Testing
- ✅ 17 new backward compatibility tests
- ✅ All existing tests updated
- ✅ Node.js smoke tests passing
- ✅ Playwright integration tests passing

---

## 📊 Performance

- **Binary Size:** 1,644 KB (+147 bytes, +0.009%)
- **Runtime Overhead:** 0% (Lua table reference aliasing)
- **Serialization:** No measurable impact
- **Memory:** +8 bytes (feature flag + constants)

---

## 🔄 Migration Guide

### Option 1: Automated (Recommended)

```bash
# Find and replace in your codebase
find . -name "*.lua" -exec sed -i '' 's/Memory\./_home\./g' {} \;
find . -name "*.html" -exec sed -i '' 's/Memory\./_home\./g' {} \;
```

### Option 2: Manual

Replace all occurrences:
- `Memory.` → `_home.`
- `Memory[` → `_home[`
- `function Memory.` → `function _home.`

### Option 3: No Migration (Short-term)

Do nothing - your code continues to work with the `Memory` alias.

**Important:** The alias will be removed in v3.0.0 (future release).

---

## ⏰ Deprecation Timeline

| Version | Memory Alias Status |
|---------|-------------------|
| **2.0.x** | ✅ Active (current) |
| 2.1.x | ⚠️ Active with prominent warnings |
| **3.0.0** | ❌ **Removed** (breaking change) |

**Recommendation:** Migrate to `_home` now to avoid disruption.

---

## 🐛 Bug Fixes

- Fixed test import paths for Playwright compatibility
- Improved error messages for state restoration
- Enhanced console logging for table initialization

---

## 🔧 Technical Details

### Zig Changes
```zig
// New constants
const HOME_TABLE_NAME = "_home";
const LEGACY_MEMORY_NAME = "Memory";
var enable_memory_alias: bool = true;

// New export
export fn set_memory_alias_enabled(enabled: c_int) void
```

### JavaScript Changes
```javascript
// New constants
const HOME_TABLE_NAME = '_home';
const LEGACY_MEMORY_NAME = 'Memory';

// New function
function setMemoryAliasEnabled(enabled)

// Renamed internal variable
memoryTableId → homeTableId
```

### Persistence Format
```javascript
// Old format (still supported)
metadata: { memoryTableId: 1 }

// New format (generated)
metadata: { homeTableId: 1, memoryTableId: 1 }
```

---

## 📚 Documentation

### New Guides
- [Migration Guide](docs/MIGRATION_TO_HOME.md) - Comprehensive migration instructions
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Technical details
- [Changelog](CHANGELOG.md) - Complete version history

### Updated Docs
- [API Reference](docs/API_REFERENCE.md) - Updated function signatures
- [Quick Start](docs/QUICK_START.md) - New `_home` examples
- [README](README.md) - Modernized code samples

---

## 💡 Why _home?

The rename provides several benefits:

1. **Clarity:** "Home directory" metaphor is intuitive
2. **Distinction:** Eliminates confusion with WASM memory APIs
3. **Future-proof:** Aligns with message-driven compute patterns
4. **Convention:** Underscore prefix indicates system/special table

---

## 🔗 Resources

- **Migration Guide:** [docs/MIGRATION_TO_HOME.md](docs/MIGRATION_TO_HOME.md)
- **API Reference:** [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- **Live Demo:** [http://localhost:8000/demo](http://localhost:8000/demo) (after `npm run demo`)
- **GitHub Issues:** [Report bugs or request features](https://github.com/twilson63/cu/issues)

---

## 🙏 Acknowledgments

This release implements the PRP specification from `PRPs/lua-home-storage-prp.md` following Solution A (Direct Rename with Alias Shim) for optimal simplicity and backward compatibility.

---

## ⬆️ Upgrade Instructions

### For npm Users

```bash
npm install lua-wasm-external-storage@2.0.0
```

### For CDN Users

```html
<script src="https://unpkg.com/lua-wasm-external-storage@2.0.0/dist/lua-wasm.js"></script>
```

### For Git Users

```bash
git pull origin main
./build.sh
npm test
```

---

## 🎉 What's Next?

### v2.1.x (Planned)
- Enhanced telemetry for `Memory` alias usage
- More prominent deprecation warnings
- Additional migration tooling

### v3.0.0 (Future)
- **Breaking:** Remove `Memory` alias
- Clean up legacy compatibility code
- Performance optimizations

---

## 📝 Changelog Summary

```
[Added]
- _home as canonical external storage namespace
- setMemoryAliasEnabled() API function
- Feature flag for alias control
- 17 backward compatibility tests
- Comprehensive migration guide

[Changed]
- Primary table name: Memory → _home
- Internal variables: memoryTableId → homeTableId
- All examples and documentation updated

[Deprecated]
- _G.Memory global (use _G._home instead)
- getMemoryTableId() (use getHomeTableId() instead)
- metadata.memoryTableId (use metadata.homeTableId)

[Fixed]
- Test framework compatibility issues
- Import path corrections
- Enhanced error messages
```

---

**Full changelog:** [CHANGELOG.md](CHANGELOG.md)  
**Technical summary:** [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

## ✅ Verification

After upgrading, verify your installation:

```bash
# Build
./build.sh

# Test
npm test

# Check version
node -e "console.log(require('./package.json').version)"  # Should show 2.0.0
```

Expected output:
```
✅ Build complete! Output: web/lua.wasm
✅ _home persistence smoke test passed
✅ Memory backward compatibility verified
```

---

**Questions?** Open an issue or check the [migration guide](docs/MIGRATION_TO_HOME.md).

**Ready to migrate?** See the [automated migration script](docs/MIGRATION_TO_HOME.md#automated-migration-script).

---

*Happy coding with `_home`!* 🏡
