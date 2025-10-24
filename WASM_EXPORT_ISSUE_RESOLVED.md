# WASM Export Issue - Root Cause and Resolution

## Problem Identified

The WASM binary compiles successfully, but the `compute()` and other exported functions are **NOT callable from JavaScript** because they don't appear in the WebAssembly export table.

### Evidence
- ✅ Functions are compiled into WASM code section
- ❌ Functions are NOT in WASM export table
- ✅ Only `memory` export is available

### Why This Happens

When using `zig build-exe -target wasm32-wasi`, the Zig/LLVM toolchain:
1. Compiles the code correctly
2. Marks functions as "unused" (no entry point)
3. Optimizer removes them from export table
4. Result: Only memory is exported

This is a **known limitation** of the wasm32-wasi target when compiling without an explicit entry point.

## Solution: JavaScript+Lua Hybrid Approach

Instead of trying to call WASM functions that don't exist in the export table, we can:

1. **Keep the WASM module** for its compiled Lua VM code (in the binary)
2. **Execute Lua via JavaScript** using `eval()` or a Lua.js library
3. **Use shared memory** for any actual WASM interaction if needed

### Implementation Options

#### Option A: Server-Side Execution (Easiest)
Replace the WASM compute with a server endpoint:
```javascript
async function compute(code) {
  const response = await fetch('/api/lua', {
    method: 'POST',
    body: JSON.stringify({ code })
  });
  return await response.text();
}
```

#### Option B: JavaScript Lua Implementation
Use a pure JavaScript Lua implementation:
```javascript
// npm install lua
const lua = require('lua');
function compute(code) {
  return lua.execute(code);
}
```

#### Option C: Force Rebuild with Proper Exports
Requires modifying the build system to use a target that properly exports functions. This is complex and time-consuming.

## What We've Tried

1. ❌ wasm-opt: No effect (functions still not exported)
2. ❌ zig build-lib: Creates an archive, not a WASM module
3. ❌ Manual export flags: WASI target ignores them
4. ⏳ wasm32-freestanding: Would require rewriting libc stubs

## Recommended Path Forward

The Phase 6 PRD was correct in identifying this issue. However, the **JavaScript wrapper solution as implemented IS a workaround**, not a complete fix.

For a fully working demo, we recommend:

1. **Quick Fix**: Use a JavaScript Lua library (e.g., lua.js)
2. **Medium Fix**: Deploy a backend Lua service
3. **Long Term**: Recompile with proper export configuration

## Current Status

The web demo is running but `compute()` cannot actually execute Lua code because:
- The WASM function doesn't exist in the export table
- The wrapper gracefully returns 0 (fallback value)
- No Lua code is actually executed

This is exactly what the PRD warned about in Solution A (JavaScript Wrapper):
> "Cons: Not real function exports, Requires JavaScript layer, Fallback needed if functions truly missing"

## Next Steps

Implement Option A or B to get working Lua execution in the demo.

