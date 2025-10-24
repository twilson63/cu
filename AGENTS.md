# Agent Guidelines

- **Build**: `./build.sh` → emits `web/lua.wasm`
- **Test**: `npm test` (Playwright); single: `npx playwright test tests/integration.test.js -g "name"`
- **Clean**: `rm -rf .zig-cache .build web/lua.wasm && ./build.sh`

**Zig**
- Target `wasm32-freestanding`, no WASI/Emscripten
- Static globals only: 512KB malloc pool, 64KB IO buffer
- Style: snake_case funcs/vars, PascalCase types, return `c_int` codes
- Imports via `const mod = @import("file.zig");`, exports listed in `build.sh`

**JS Bridge**
- Host FFI: `js_ext_table_set/get/delete/size/keys`
- `_G.Memory` auto-attached via `attach_memory_table`, id fetched with `get_memory_table_id`
- Sync table ids with `sync_external_table_counter`; persistence stores `{memoryTableId,nextTableId}` in IndexedDB

**Constraints**
- Never use Emscripten or dynamic allocation
- Always route allocation through `lua_malloc/lua_realloc/lua_free`

**Context**
- 33 Lua C sources + 49 Zig libc stubs
- See `FREESTANDING_IMPLEMENTATION_REPORT.md` for architecture details
