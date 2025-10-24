#!/bin/bash
set -e

echo "🔧 Adding export statements to lua.wat..."

# Check if lua.wat exists
if [ ! -f "web/lua.wat" ]; then
    echo "❌ web/lua.wat not found!"
    echo "   Please run: wasm2wat web/lua.wasm -o web/lua.wat"
    exit 1
fi

# Create a backup
cp web/lua.wat web/lua.wat.backup

# Since we couldn't find the functions in the WAT file, we need to check if they're actually compiled
echo "⚠️  Warning: The target functions (init, compute, etc.) were not found in the compiled WASM."
echo "   This suggests they were optimized out during compilation."
echo ""
echo "   The issue is that zig build-exe creates a WASI executable, not a library."
echo "   Our export functions were likely eliminated as 'dead code' since they're not called from _start."
echo ""
echo "   Possible solutions:"
echo "   1. Use zig build-lib instead of zig build-exe"
echo "   2. Call the exported functions from main() to prevent elimination"
echo "   3. Use wasm-ld directly with --export flags"
echo "   4. Add __attribute__((used)) or similar to prevent elimination"

# For now, let's check what we have
echo ""
echo "📋 Current exports in web/lua.wasm:"
wasm-objdump -x web/lua.wasm | grep -A5 "Export\["

echo ""
echo "📋 Functions containing 'main' in web/lua.wasm:"
wasm-objdump -x web/lua.wasm | grep "func.*main"

echo ""
echo "❌ Cannot add exports - the functions don't exist in the compiled WASM."
echo "   The build process needs to be modified to preserve these functions."