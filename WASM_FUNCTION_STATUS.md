# WASM Function Export Status Investigation

## Current Status

The WASM binary was compiled with `export fn` declarations in Zig, but the functions are **NOT appearing in the WebAssembly export table**. Only `memory` is exported.

### Evidence

```
WASM Export Table (what's available):
  ✅ memory

WASM Code Section (what's compiled but not exported):
  ✅ init()
  ✅ compute()
  ✅ get_buffer_ptr()
  ✅ get_buffer_size()
  ✅ get_memory_stats()
  ✅ run_gc()
```

## Root Cause

The issue is with the **zig wasm32-wasi target** and how the LLVM backend handles exports. When using wasm32-wasi without proper linker flags, functions without an entry point are not added to the export table by the optimizer.

## Why This Happened

1. Zig source has `export fn` declarations
2. Functions are compiled into the code section
3. Zig/LLVM toolchain doesn't add them to export table (optimization sees them as "unused")
4. Only `memory` export is created automatically

## Current Workaround

The JavaScript wrapper uses optional chaining (`?.()`) to safely attempt calling functions that may not exist, with fallback values:

```javascript
export function compute(code) {
  // Tries: instance.exports.compute?.(ptr, len)
  // Falls back to: 0 (if undefined/missing)
  const result = wasmInstance.exports.compute?.(bufPtr, codeBytes.length) ?? 0;
  return result;
}
```

This is safe but means **functions don't actually execute** - the wrapper just returns fallback values.

## Solutions

### Option 1: Use wasm-opt (RECOMMENDED)
```bash
npm install -g binaryen
wasm-opt -O0 main.wasm -o lua-optimized.wasm
# This can sometimes fix the export table
```

### Option 2: Rebuild with Different Target
Change from `wasm32-wasi` to `wasm32-freestanding` (requires different libc stubs)

### Option 3: Manual WASM Post-Processing
Use `wasmParser.js` or similar to manually add exports to the binary

### Option 4: Keep JavaScript Wrapper with Server-Side Lua
Deploy a server endpoint that executes Lua code (not ideal for WASM MVP)

## What We've Learned

The PRD was correct in identifying this issue! The solution chosen (JavaScript wrapper) is correct as a **fallback**, but for the demo to actually work, we need to:

1. Either rebuild with working exports
2. Or use a post-processing tool to fix the WASM binary

## Next Step

Install binaryen/wasm-opt and rebuild, or implement an alternative workaround.

