# Agent Guidelines

## Build/Test Commands
- **Build**: `./build.sh` → generates `web/lua.wasm` (512KB malloc pool, 64KB IO buffer)
- **Test**: `npm test` (Playwright) | Single: `npx playwright test -g "test name"`
- **Demo**: `npm run demo` → serves on http://localhost:8000
- **Clean**: `rm -rf .zig-cache .build web/lua.wasm && ./build.sh`

## Code Style - Zig
- Target: `wasm32-freestanding` (no WASI/Emscripten, static globals only)
- Naming: `snake_case` funcs/vars, `PascalCase` types, prefix exports with `lua_`
- Imports: `const mod = @import("file.zig");` exports in `build.sh`
- Memory: Route via `lua_malloc/lua_realloc/lua_free`, never dynamic allocation
- Returns: Use `c_int` for status codes (0=success, -1=error)

## Code Style - JavaScript  
- Modules: ES6 imports/exports, async/await for WASM loading
- Error handling: Return `{error, value, output}` objects from API calls
- Testing: Playwright with descriptive test names, use `test.describe` for grouping

## Architecture
- Lua C sources (33 files) + Zig libc stubs (49) → freestanding WASM
- JS Bridge: `js_ext_table_*` FFI for IndexedDB persistence via `_G.Memory`