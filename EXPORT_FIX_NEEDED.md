# ⚠️ Export Fix Status

## The Problem

The WASM binary at `web/lua.wasm` was built with `wasm32-wasi` target, which means:

1. ✅ Lua C sources compile successfully (WASI provides libc)
2. ✅ Zig `export fn` declarations are syntactically correct
3. ❌ **WASI runtime WRAPS all code** in a `_start` entry point
4. ❌ Individual functions (`compute`, `init`, etc.) are **NOT exported** to JavaScript

### Proof
Inspecting the binary exports:
```
Export Section contains only:
  - memory (i32)
  - _start (function)
```

Expected exports:
```
  - memory (i32)
  - init (function)
  - compute (function)
  - get_buffer_ptr (function)
  - get_buffer_size (function)
  - get_memory_stats (function)
  - run_gc (function)
```

## Root Cause

The `wasm32-wasi` target in Zig requires a WASI runtime entry point (`_start`). This runtime:
- Initializes the WASI environment
- Runs the program's main entry point
- Controls all exports
- **Does not expose individual `export fn` declarations**

This is a fundamental limitation of the WASI target.

## Solutions

### Option 1: Use `wasm32-freestanding` (Recommended)
**Pros:**
- Direct function exports work perfectly
- No runtime wrapper overhead
- Functions directly accessible from JavaScript

**Cons:**
- Lua C sources require libc (string.h, stdlib.h, etc.)
- Zig's freestanding libc is minimal and may have issues
- Requires custom build setup

**Status:** Not attempted yet (needs custom libc or minimal C stdlib)

### Option 2: Modify main.zig Entry Point
**Approach:**
- Keep WASI target
- Modify `_start` to accept command line args
- Pass function selector + arguments via WASI interface
- Problematic and hacky

**Status:** Not recommended

### Option 3: Use wasm-ld Linker Script
**Approach:**
- Build with wasm32-wasi
- Use custom linker script to re-export functions
- Extract individual functions from wrapped module

**Status:** Not attempted (complex)

### Option 4: JavaScript Adapter (Current Workaround)
**Approach:**
- Call `_start` to initialize
- Access functions via function pointer arithmetic
- Problematic because functions aren't callable

**Status:** Won't work (functions not exported at all)

## Recommended Path Forward

1. **Short-term (for testing)**:
   - Use JavaScript to create adapter that manually exports functions
   - May require rebuilding with different target
   
2. **Medium-term (proper fix)**:
   - Rebuild with `wasm32-freestanding`
   - Add minimal C standard library support
   - Ensure Lua C sources compile
   
3. **Long-term (optimal)**:
   - Create separate build configuration
   - Target `wasm32-freestanding` with custom libc
   - Provide proper exports for all functions
   - Test thoroughly with JavaScript

## Immediate Action Required

To get `compute()` working with external memory access:

1. **Change build target** from `wasm32-wasi` to `wasm32-freestanding`
2. **Handle libc requirement** for Lua C sources
3. **Verify exports** are accessible from JavaScript
4. **Update web demo** to use new function signatures

## Files to Modify

- `build.sh` - Change target and remove WASI flags
- `src/main.zig` - Ensure no WASI-specific code
- `web/lua-persistent.js` - Use direct function calls (no adapter needed)
- `web/index.html` - May need JavaScript updates

## Current Status

- ✅ Source code has `export fn` declarations
- ✅ Binary builds successfully
- ❌ Functions not exported (WASI limitation)
- ❌ JavaScript cannot call `compute()`, `init()`, etc.
- ⏳ Awaiting rebuild with correct target

---

**Priority:** CRITICAL - Blocks all functionality  
**Effort:** Medium (2-4 hours for proper fix)  
**Risk:** Low (known limitation, clear solution path)
