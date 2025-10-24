# Export Analysis Summary

## Problem
The functions `init`, `compute`, `get_buffer_ptr`, `get_buffer_size`, `get_memory_stats`, and `run_gc` are defined in `src/main.zig` with the `export` keyword, but they are NOT present in the compiled WASM file `web/lua.wasm`.

## Root Cause
1. The build script uses `zig build-exe` which creates a WASI executable, not a library
2. WASI executables only export `_start` by default
3. The Zig compiler/linker eliminates "dead code" - functions not called from _start
4. Even though the functions have `export` keyword, they're removed during optimization

## Evidence
- `strings web/lua.wasm | grep -E "^(init|compute|...)$"` shows the function names exist in the binary
- `wasm-objdump -x web/lua.wasm` shows only 2 exports: `memory` and `_start`
- The WAT file has 51 functions, but none match our target functions

## Solutions Attempted
1. ❌ Using `zig build-lib` - creates an archive (.a) file, not WASM
2. ❌ Using `wasm-opt` with export flags - wasm-opt can't add exports for non-existent functions
3. ❌ Using `wasm32-freestanding` target - libc-stubs.zig has compilation errors with this target
4. ❌ Manual WAT editing - functions don't exist in the WAT to reference

## Recommended Solution (Phase 6)
1. **Modify build process to preserve functions:**
   ```bash
   # Option 1: Add --export flags to zig build-exe
   zig build-exe ... --export=init --export=compute ...
   
   # Option 2: Use custom linker script
   zig build-exe ... --script=exports.ld
   
   # Option 3: Call functions from _start to prevent elimination
   # Add to main.zig:
   pub fn main() void {
       _ = init();
       _ = compute(0, 0);
       // etc.
   }
   ```

2. **Alternative: Use build.zig instead of shell script:**
   Create a proper build.zig file that configures exports correctly

3. **Last resort: Switch to different toolchain:**
   - Use Rust with wasm-bindgen (preserves exports)
   - Use C with clang directly
   - Use AssemblyScript

## Current Status
- ✅ Lua compiles successfully
- ✅ WASM binary is valid
- ✅ Functions are defined in source
- ❌ Functions not exported in binary
- ❌ Web demo cannot call functions

## Time Estimate
Phase 6 implementation: 2-3 hours to fix the export issue properly.