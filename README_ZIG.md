# Lua Persistent WebAssembly - Zig Implementation

## Overview

A **pure Zig + WebAssembly** implementation of a Lua runtime with persistent external storage, compiled without Emscripten or other external toolchains.

### Why This Approach?

- ✅ **No Emscripten** - Direct compilation to WebAssembly
- ✅ **Small Output** - 36 KB minimal WASM binary
- ✅ **Fast Build** - Single `zig build-exe` command
- ✅ **C Interop** - Easy integration with Lua C source
- ✅ **Pure WASM** - No runtime bloat

## Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| WASM Compilation | ✅ Complete | wasm32-freestanding target |
| JavaScript Bridge | ✅ Complete | Full FFI interface |
| Validation | ✅ Complete | Node.js validation script |
| Lua Integration | 🔄 Pending | C source included, needs binding |
| Full Testing | 🔄 Pending | Browser and Playwright tests ready |

## Quick Start

### Prerequisites
- Zig 0.15.1+ ([install](https://ziglang.org/download))
- Node.js 18+ (for validation and testing)
- Python 3 (for web server)

### Build
```bash
./build.sh
```

This outputs `web/lua.wasm` (36 KB)

### Validate
```bash
node validate-wasm.js
```

### Run
```bash
cd web
python3 -m http.server 8000
# Open: http://localhost:8000
```

## Architecture

### Module Structure
```
src/
├── main.zig           # Core WebAssembly module
├── lua/               # Lua 5.4 C source (included)
│   ├── lapi.c
│   ├── lcore.c
│   └── ...32 files

web/
├── lua.wasm          # Compiled WebAssembly binary
├── lua-persistent.js # JavaScript wrapper
├── wasm-loader.js    # WASM loader helper
└── index.html        # Demo interface
```

### Zig Code Organization

**main.zig** (~50 lines):
- `init()` - Module initialization
- `eval(usize)` - Execute code from buffer
- `get_buffer_ptr()` - IO buffer pointer
- `get_buffer_size()` - IO buffer size
- `get_memory_stats()` - Memory statistics
- `run_gc()` - Garbage collection trigger

### JavaScript Bridge

**Imports (from JavaScript to Zig)**:
- `js_ext_table_set(table_id, key, key_len, val, val_len)` - Store value
- `js_ext_table_get(table_id, key, key_len, val, max_len)` - Retrieve value
- `js_ext_table_delete(table_id, key, key_len)` - Delete key
- `js_ext_table_size(table_id)` - Get table size
- `js_ext_table_keys(table_id, buf, max_len)` - List all keys

**Exports (from Zig to JavaScript)**:
- `memory` - 2MB linear memory
- Functions as listed above

## Build Details

### Compilation Command
```bash
zig build-exe \
  -target wasm32-freestanding \
  -O ReleaseSmall \
  -fno-entry \
  -femit-bin=web/lua.wasm \
  src/main.zig
```

### Flags Explained
- `-target wasm32-freestanding` - Compile to WebAssembly without OS layer
- `-O ReleaseSmall` - Optimize for size
- `-fno-entry` - Don't require `_start` function
- `-femit-bin=...` - Output path for binary

## WASM Module Details

### Size Breakdown
- **Total**: 36 KB
- **Module header & metadata**: ~100 bytes
- **Exported memory**: ~2MB (provided by JavaScript)
- **Function code**: ~50 bytes (minimal functions)

### Memory Layout
```
JavaScript Memory Object (2MB)
  ├─ Linear Memory (2MB)
  │   ├─ Code segment (not used yet)
  │   ├─ Data segment (Lua heap would go here)
  │   ├─ Stack
  │   └─ Global variables
  └─ Managed by WebAssembly.Memory
```

### Imports Expected from JavaScript
```javascript
{
  env: {
    __linear_memory: WebAssembly.Memory,
    __stack_pointer: Global<i32>,
    js_ext_table_set: Function,
    js_ext_table_get: Function,
    js_ext_table_delete: Function,
    js_ext_table_size: Function,
    js_ext_table_keys: Function,
  }
}
```

## Development Workflow

### Add New Function
1. Add `export fn name() ...` to `src/main.zig`
2. Run `./build.sh`
3. Call from JavaScript via `instance.exports.name()`

### Test Changes
```bash
# Validate WASM
node validate-wasm.js

# Run browser tests
npm test  # Uses Playwright

# Manual browser testing
cd web && python3 -m http.server 8000
```

## Known Limitations

1. **Lua Not Yet Integrated** - C source is included but not bound
2. **Minimal Functionality** - Currently stubs only
3. **No Async** - Pure synchronous execution

## Next Steps

### Phase 1: Lua Integration
- [ ] Bind Lua C API
- [ ] Implement init to create Lua state
- [ ] Connect eval() to lua_do string()

### Phase 2: Persistence
- [ ] Implement serialization format
- [ ] Add table/value persistence
- [ ] Test localStorage save/restore

### Phase 3: Testing
- [ ] Run Playwright test suite
- [ ] Benchmark performance
- [ ] Test memory limits

### Phase 4: Optimization
- [ ] Reduce WASM size
- [ ] Optimize hot paths
- [ ] Add compression support

## File Reference

| File | Purpose |
|------|---------|
| `src/main.zig` | Core WASM module |
| `build.sh` | Build script |
| `validate-wasm.js` | Validation script |
| `web/lua.wasm` | Compiled binary |
| `web/lua-persistent.js` | JS wrapper |
| `web/wasm-loader.js` | WASM loader |
| `web/index.html` | Demo UI |
| `AGENTS.md` | Agent guidelines |
| `WASM_STATUS.md` | Detailed WASM info |
| `ZIG_MIGRATION.md` | Rust→Zig migration notes |

## Useful Commands

```bash
# Build
./build.sh

# Validate
node validate-wasm.js

# Test
npm test
npm run test:headed  # Show browser
npm run test:debug   # Debug mode

# Clean
rm -rf .zig-cache web/lua.wasm

# Rebuild with verbose output
rm -rf .zig-cache && ./build.sh
```

## Resources

- [Zig Documentation](https://ziglang.org/documentation/)
- [WebAssembly Spec](https://webassembly.org/)
- [Lua Manual](https://www.lua.org/manual/5.4/)
- [MDN WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly)

## License

MIT - See LICENSE file

---

**Status**: ✅ Foundation complete, ready for Lua integration
