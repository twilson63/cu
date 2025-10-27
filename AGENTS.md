# Agent Guidelines
**Build/Test Commands**
- Build: `./build.sh` (outputs `web/cu.wasm` + `web/lua.wasm` legacy copy).
- Test suite: `npm test` (Playwright).
- Single test: `npx playwright test -g "test name"`.
- Debug test: `npm run test:debug` or `npm run test:headed`.
- Demo server: `npm run demo` on http://localhost:8000.
- Clean + rebuild: `rm -rf .zig-cache .build web/cu.wasm web/lua.wasm && ./build.sh`.
**Code Style - Zig**
- Target `wasm32-freestanding`; avoid WASI/Emscripten APIs.
- Use snake_case for funcs/vars, PascalCase for types, prefix exports with `lua_`.
- Import via `const mod = @import("file.zig");`; keep exports wired in `build.sh`.
- Route allocations through `lua_malloc/lua_realloc/lua_free`; return `c_int` (0 ok, -1 err).
- Declare enums with explicit types: `pub const Type = enum(u8) { ... };`
- Use `extern fn` for JS imports: `extern fn js_ext_table_set(...) c_int;`
**Code Style - JavaScript**
- Use ES modules, top-level async init for WASM loaders.
- Prefer descriptive Playwright tests with `test.describe` groupings.
- Handle APIs by returning `{ error, value, output }` objects; avoid throwing.
- Keep persistence bridge via `js_ext_table_*` helpers untouched.
- Import from relative paths: `import { func } from './module.js';`
**Formatting & Reviews**
- Match existing formatting; no auto-format scripts provided.
- No Cursor or Copilot rules in repo as of now.
