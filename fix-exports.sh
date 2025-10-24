#!/bin/bash
set -e

echo "🔧 Attempting to fix WASM exports..."

# First, let's analyze the current WASM to understand its structure
echo "📋 Analyzing current WASM structure..."
echo ""

# Check if init, compute etc. are in the WASM as internal functions
echo "Searching for our target function names in the WASM binary..."
strings web/lua.wasm | grep -E "^(init|compute|get_buffer_ptr|get_buffer_size|get_memory_stats|run_gc)$" || echo "No matching function names found in strings"

echo ""
echo "📋 Current function count:"
wasm-objdump -x web/lua.wasm | grep -c "func\[" || echo "0"

echo ""
echo "📋 Attempting to use wasm-opt to preserve functions..."

# Try using wasm-opt with various flags to preserve our functions
wasm-opt web/lua.wasm \
    -O0 \
    --legalize-js-interface \
    --export=init \
    --export=compute \
    --export=get_buffer_ptr \
    --export=get_buffer_size \
    --export=get_memory_stats \
    --export=run_gc \
    -o web/lua-fixed.wasm 2>&1 || {
    echo "❌ wasm-opt failed. The functions may not exist in the binary."
    echo ""
    echo "The issue is that zig build-exe with wasm32-wasi target creates a WASI"
    echo "executable that doesn't preserve our library exports."
    echo ""
    echo "Solution: We need to modify the build process to either:"
    echo "1. Use a different target (wasm32-freestanding)"
    echo "2. Build as a library, not an executable"
    echo "3. Use a custom linker script"
    exit 1
}

echo ""
echo "📋 Checking fixed WASM exports..."
wasm-objdump -x web/lua-fixed.wasm | grep -A20 "Export\[" || echo "No exports section found"

echo ""
echo "✅ Processing complete. Check web/lua-fixed.wasm"