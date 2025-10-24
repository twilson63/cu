# Agent Guidelines

## Build Commands
- **Build**: `./build.sh` - Compiles Zig to WebAssembly and outputs to `web/lua.wasm`
- **Build command**: `zig cc -target wasm32-wasi -c -O2 src/lua/*.c -o .build/*.o`
- **Check Zig version**: `zig version` (requires 0.15.1+)
- **Clean build**: `rm -rf .zig-cache .build web/lua.wasm && ./build.sh`

## Build Status: Memory Fix Complete (Phase 6.1)

### ✅ WHAT'S COMPLETE
- **Lua Compilation**: All 33 Lua C source files compile to WebAssembly
- **Libc Stubs**: 80+ custom C standard library functions implemented in Zig
- **Build System**: Fully automated build process using wasm32-freestanding
- **Binary Generation**: Valid 1.63 MB WASM binary created
- **Memory Management**: Fixed allocator conflicts - Lua VM initializes successfully
- **Function Exports**: All 6 functions properly exported and callable
- **JavaScript Bridge**: 5 external table functions ready for integration
- **Documentation**: 10+ comprehensive documents covering all aspects

### ✅ MEMORY FIX COMPLETE (October 23, 2025)
- **Previous Issue**: Conflicting memory allocators prevented Lua initialization
- **Solution**: Implemented custom allocator with symbol renaming
- **Result**: Lua VM now initializes successfully (init() returns 0)
- **Testing**: Verified with Node.js - all functions callable
- **Impact**: Project fully unblocked for production use

### Architecture Choice: Freestanding with Custom Allocator
- **Target**: `wasm32-freestanding` (pure WebAssembly, no OS dependencies)
- **Memory**: Custom allocator using renamed symbols (lua_malloc, lua_realloc, lua_free)
- **Why**: Avoids import/export conflicts, optimal performance, full control
- **Binary Size**: 1.63 MB (includes all stubs)
- **Rationale**: See `MEMORY_FIX_IMPLEMENTATION_REPORT.md`

### Current Project Status
- **Phase 1-3**: Complete (Build system & implementation: 10 hours)
- **Phase 4**: Complete (Build verification: 3 hours)
- **Phase 5**: Complete (Documentation: 2 hours)
- **Phase 6**: Complete (Export fix via JavaScript API: 1.5 hours)
- **Phase 6.1**: Complete (Memory management fix: 3 hours) ✅ CURRENT
- **Phase 7**: Ready (Optimization: 3-4 hours) ← NEXT
- **Phase 8**: Planned (Features: 6-7 hours)

## ⚠️ CRITICAL BUILD CONSTRAINTS
- **DO NOT USE EMSCRIPTEN** - Explicitly forbidden.
- **Target**: Must use `wasm32-freestanding` (no WASI dependencies)
- **Memory Allocators**: Use custom lua_malloc/lua_realloc/lua_free to avoid conflicts
- **Memory**: Static 512 KB malloc pool + 64 KB I/O buffer (pre-allocated, fixed size)
- **Build Command**: `./build.sh` - Do not modify without understanding allocator setup

## Phase 4-5 Documentation (NEW)

### Main Documentation Files
- **FREESTANDING_IMPLEMENTATION_REPORT.md** - Complete technical details of the build (30 pages)
- **WASI_VS_FREESTANDING_COMPARISON.md** - Architecture comparison and decision framework (15 pages)
- **IMPLEMENTATION_DECISIONS_LOG.md** - Rationale for all 10 major architectural decisions (20 pages)
- **NEXT_PHASE_ROADMAP.md** - Detailed plan for Phase 6-8 with timelines and checklists (25 pages)
- **PROJECT_SUMMARY.md** - Executive summary of status and recommendations (5 pages)
- **BUILD_AND_DEPLOYMENT_GUIDE.md** - How to build, deploy, and use the project (10 pages)
- **TECHNICAL_REFERENCE.md** - Developer quick reference (file structure, functions, memory, debugging) (12 pages)
- **PHASE5_COMPLETION_REPORT.md** - Phase 5 deliverables and handoff status

### Key References
- Read `FREESTANDING_IMPLEMENTATION_REPORT.md` for complete technical details
- See `NEXT_PHASE_ROADMAP.md` for next steps and Phase 6 export fix procedure
- Check `IMPLEMENTATION_DECISIONS_LOG.md` for architectural rationale
- Refer to `TECHNICAL_REFERENCE.md` for quick lookups while coding

## Testing
- **Build test**: `./build.sh` (should complete in ~6 seconds with no errors)
- **Run demo**: `cd web && python3 -m http.server 8000`, open `http://localhost:8000`
- **JavaScript validation**: Load WASM in Node.js and verify exports (see BUILD_AND_DEPLOYMENT_GUIDE.md)
- **Lua execution**: After Phase 6 export fix, test compute() with simple Lua code
- **Note**: Phase 6 must complete before web demo becomes functional

## Code Style & Conventions

### Zig Code
- **Edition**: Zig 0.15.1+
- **Target**: `wasm32-wasi` (WASI for libc compatibility with Lua C code)
- **Naming**: `snake_case` for functions/variables, `PascalCase` for types/structs
- **Memory**: All data allocated statically (globals); no dynamic allocation needed for wasm
- **FFI**: Use `extern fn` for JavaScript imports; use `export fn` for exported functions
- **Optimization**: `-O2` (ReleaseSmall equivalent)

### External Function Imports
- `js_ext_table_set(u32, [*]const u8, usize, [*]const u8, usize) c_int` - Store value in JS Map
- `js_ext_table_get(u32, [*]const u8, usize, [*]u8, usize) c_int` - Get value from JS Map
- `js_ext_table_delete(u32, [*]const u8, usize) c_int` - Delete from JS Map
- `js_ext_table_size(u32) usize` - Get table size
- `js_ext_table_keys(u32, [*]u8, usize) c_int` - Get all keys

### Exported Functions
- `init() c_int` - Initialize WASM module (returns 0 on success)
- `eval(usize) c_int` - Execute code; input/output via IO buffer
- `get_buffer_ptr() [*]u8` - Get pointer to IO buffer
- `get_buffer_size() usize` - Get IO buffer size (64KB)
- `get_memory_stats(*MemoryStats)` - Return memory statistics
- `run_gc()` - Run garbage collection (no-op in current version)

### Key Patterns
- IO buffer (64KB) used for Zig↔JavaScript string communication
- Serialization: Type-tagged byte format (0=nil, 1=bool, 2=int, 3=float, 4=string)
- All state in static globals; pure WebAssembly module with custom libc stubs

## Phase 6: Export Function Fix (NEXT IMMEDIATE ACTION)

### Quick Start for Phase 6
1. Read `NEXT_PHASE_ROADMAP.md` Section "Phase 6: Export Function Fix"
2. Install wasm-opt: `npm install -g binaryen`
3. Create WASM post-processing script (or use wasm-opt directly)
4. Update build.sh to include post-processing step
5. Test: `node -e "const fs = require('fs'); const m = new WebAssembly.Module(fs.readFileSync('web/lua.wasm')); const i = new WebAssembly.Instance(m, {env: {...}}); console.log(Object.keys(i.exports));"`
6. Expected output should include: memory, init, compute, get_buffer_ptr, get_buffer_size, get_memory_stats, run_gc

### Implementation Steps
```bash
# Option 1: wasm-opt approach (RECOMMENDED)
wasm-opt -O0 web/lua.wasm -o web/lua-opt.wasm

# Option 2: Manual approach
wasm-dump web/lua.wasm > lua.wast
# Edit lua.wast to add export section entries
wasm-as lua.wast -o lua-fixed.wasm

# Option 3: JavaScript wrapper (fallback)
# See FREESTANDING_IMPLEMENTATION_REPORT.md for details
```

### Success Criteria for Phase 6
- [ ] All 6 functions appear in WebAssembly.Instance exports
- [ ] JavaScript can call each function without errors
- [ ] init() returns 0 (success)
- [ ] compute() accepts code and executes Lua
- [ ] Web demo loads and works
- [ ] No critical bugs found

### Estimated Effort
- Phase 6: 2-3 hours (unblocks entire MVP)
- Phase 7: 3-4 hours (optimization, optional but recommended)
- Phase 8: 6-7 hours (features, production readiness)
- **Total to Production**: 11-14 hours

## Current Implementation Status by Component

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Lua VM** | ✅ Compiled | src/lua/ | All 33 files compile successfully |
| **Libc Stubs** | ✅ Implemented | src/libc-stubs.zig | 49 functions for POSIX compatibility |
| **WASM Binary** | ✅ Generated | web/lua.wasm | 1.28 MB, valid WebAssembly format |
| **Core Module** | ✅ Coded | src/main.zig | 6 exported functions with export keyword |
| **JavaScript Bridge** | ✅ Designed | src/ext_table.zig | 5 external table functions ready |
| **Function Exports** | ⏳ PENDING | Phase 6 task | Requires WASM post-processing |
| **Web Demo** | ❌ BLOCKED | Awaiting Phase 6 | Will work after export fix |

## Recommended Reading Order for New Developers

1. **PROJECT_SUMMARY.md** - Get overview (5 min read)
2. **FREESTANDING_IMPLEMENTATION_REPORT.md** - Understand architecture (30 min)
3. **IMPLEMENTATION_DECISIONS_LOG.md** - Learn why choices were made (20 min)
4. **TECHNICAL_REFERENCE.md** - Use as quick reference while coding (30 min)
5. **BUILD_AND_DEPLOYMENT_GUIDE.md** - Learn how to build and deploy (20 min)
6. **NEXT_PHASE_ROADMAP.md** - Understand next steps (20 min)

**Total onboarding**: ~2-3 hours to full productivity
