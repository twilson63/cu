# WebAssembly Build Options Analysis

## Problem
Compiling Lua to `wasm32-unknown-unknown` requires all dependencies to be pure Rust. However, mlua's vendored Lua uses C code that requires a C compiler for the target, which `wasm32-unknown-unknown` doesn't have.

## Available Solutions

### Option 1: Use Emscripten (Easiest, Official Support)
- **Install**: `curl https://s.ytimg.com/yts/jsbin/emscripten-site/releases/linux/emsdk-latest.tar.gz | tar xz`
- **Setup**: Follow https://emscripten.org/docs/getting_started/downloads.html
- **Build**: `cargo build --target wasm32-unknown-emscripten --release`
- **Pros**: Official mlua support, full Lua 5.4 features
- **Cons**: Large toolchain, additional dependencies

### Option 2: Pure Rust Lua (Avoided getrandom issues)
- **Library**: `piccolo` crate (pure Rust, stackless VM)
- **Issue**: Depends on `rand` → `getrandom` which requires target-specific features for wasm
- **Status**: Requires significant refactoring of API, GC lifetime complexity

### Option 3: Use System Lua (Wasm build impossible)
- **Status**: System Lua (lua5.4) is installed but cannot link to wasm targets
- **Not viable for WebAssembly**

### Option 4: Custom C Build System  
- Manually compile Lua C source with `cc` crate
- **Complexity**: Very high - requires handling wasm-specific compiler flags
- **Not recommended**: toolchain maturity is low

## Recommendation

**Use Emscripten** - it's the officially supported path for mlua + WebAssembly and will save you weeks of debugging.

If you absolutely cannot use Emscripten:
1. Consider using a JavaScript Lua runtime instead (e.g., `fengari` via npm)
2. Rewrite critical logic in pure Rust
3. Investigate using WAMR to host a native Lua build separately

## Current Project Status
- Original code uses `mlua` with `lua54` + `vendored`
- Compiles fine for `wasm32-unknown-unknown` target installed
- Cannot execute without external FFI (Emscripten or manual Lua binding)
