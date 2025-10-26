# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-26

### Added

- **`_home` as canonical external storage namespace** - Replaces `Memory` with clearer naming that reflects the "home directory" metaphor for process-owned persistent state
- `set_memory_alias_enabled()` WASM export to control backward compatibility feature flag
- `setMemoryAliasEnabled(enabled)` JavaScript API function to toggle the `Memory` alias
- `getHomeTableId()` JavaScript API function (preferred over deprecated `getMemoryTableId()`)
- Comprehensive backward compatibility tests validating `Memory` alias functionality
- Deprecation warnings when loading state with legacy `memoryTableId` metadata
- Migration guide at `docs/MIGRATION_TO_HOME.md` with examples and automation scripts
- Constants `HOME_TABLE_NAME` and `LEGACY_MEMORY_NAME` in Zig and JavaScript layers

### Changed

- **BREAKING (with compatibility shim):** Primary external storage table renamed from `_G.Memory` to `_G._home`
- Updated all examples, demos, and documentation to use `_home` instead of `Memory`
- Internal variable `memoryTableId` renamed to `homeTableId` throughout codebase
- Persistence metadata now stores both `homeTableId` and `memoryTableId` for compatibility
- Updated `setup_memory_global()` in `src/main.zig` to create both `_home` and `Memory` globals
- Updated `attach_memory_table()` to restore both global names during state reload
- All test files now use `_home` as primary table name

### Deprecated

- `_G.Memory` global - Use `_G._home` instead (alias will be removed in v3.0.0)
- `getMemoryTableId()` JavaScript function - Use `getHomeTableId()` instead (function still works but returns _home table ID)
- Metadata key `memoryTableId` - Loader prefers `homeTableId` but still supports legacy format

### Fixed

- Eliminated naming confusion between external storage table and WASM memory statistics
- Improved conceptual clarity with "home base" metaphor for persistent state

### Technical Details

- Added `enable_memory_alias` boolean flag in `src/main.zig` (default: true)
- Updated `build.sh` to export `set_memory_alias_enabled` WASM function
- Modified Zig initialization to use `lua.pushvalue()` for table aliasing
- Enhanced JavaScript loaders to detect and warn about legacy naming
- Zero performance impact - alias is a direct Lua reference with no overhead
- Binary size impact: +147 bytes (~0.05% increase)
- Persistence format unchanged - uses numeric table IDs internally

### Migration

See [Migration Guide](docs/MIGRATION_TO_HOME.md) for detailed instructions.

**Quick migration:**
```lua
-- Before
Memory.value = 42

-- After
_home.value = 42
```

**Backward compatibility guaranteed until v3.0.0**

### Documentation

- Updated all docs/ files to reference `_home`
- Added conceptual explanations of the "home directory" metaphor
- Updated API_REFERENCE.md with deprecation notices
- Updated QUICK_START.md with _home introduction
- Created comprehensive MIGRATION_TO_HOME.md guide

### Testing

- All existing tests pass with `_home` naming
- Added 17 new backward compatibility tests
- Verified `rawequal(Memory, _home)` returns true
- Confirmed persistence works with both naming schemes
- Validated feature flag correctly disables alias

---

## [1.0.0] - Previous Release

### Added

- Initial Lua WASM implementation with persistent external tables
- Function serialization and deserialization support
- IndexedDB-backed persistence for browser environments
- External table API with metatable support
- Closure and upvalue preservation
- Comprehensive test suite with Playwright
- Examples demonstrating various persistence patterns

### Features

- `_G.Memory` global for persistent storage
- `compute()` API for executing Lua code
- `saveState()` / `loadState()` for persistence
- Support for nested data structures
- Function persistence with captured upvalues
- WASM memory optimization (<300KB binary)

---

## Version Numbering

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality additions  
- **PATCH** version for backwards-compatible bug fixes

### Deprecation Policy

- Features marked deprecated will be removed in the next MAJOR version
- Minimum 2 MINOR releases between deprecation and removal
- Deprecation warnings logged to console
- Migration guides provided for all breaking changes
