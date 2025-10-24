#!/bin/bash
set -e

echo "🔧 Manually adding exports to WASM..."

# First, let's find the function indices for our target functions
echo "📋 Finding function indices..."

# We know the functions exist (from strings output), but we need to find their indices
# Let's look for functions that might be our targets based on their signatures

echo ""
echo "Looking for potential init function (no params, returns i32)..."
wasm-objdump -d web/lua.wasm | grep -B2 "end" | grep -B1 "i32.const 0" | grep "func\[" | head -5

echo ""
echo "Creating a simple Node.js script to analyze and fix the WASM..."

cat > fix-wasm-exports.js << 'EOF'
const fs = require('fs');

// Read the WASM file
const wasmBuffer = fs.readFileSync('web/lua.wasm');
const wasmModule = new WebAssembly.Module(wasmBuffer);

// Get imports and exports
const imports = WebAssembly.Module.imports(wasmModule);
const exports = WebAssembly.Module.exports(wasmModule);

console.log('Current exports:');
exports.forEach(e => console.log(`  ${e.name} (${e.kind})`));

console.log('\nImports:');
imports.forEach(i => console.log(`  ${i.module}.${i.name} (${i.kind})`));

// Unfortunately, we can't modify a compiled WASM module directly in Node.js
// We need to use a different approach

console.log('\nThe functions exist in the binary but are not exported.');
console.log('We need to use a WASM manipulation tool or rebuild with different flags.');
EOF

node fix-wasm-exports.js

echo ""
echo "🔧 Attempting to create a wrapper module..."

# Create a simpler approach - use wat2wasm if available
if command -v wat2wasm &> /dev/null; then
    echo "wat2wasm found, attempting manual export addition..."
    
    # Extract specific sections from the WAT file to add exports
    echo "(module" > web/export-patch.wat
    echo '  (import "env" "lua_wasm" (func $original (param) (result)))' >> web/export-patch.wat
    echo '  (export "init" (func $init_wrapper))' >> web/export-patch.wat
    echo '  (export "compute" (func $compute_wrapper))' >> web/export-patch.wat
    echo '  (func $init_wrapper (result i32) i32.const 0)' >> web/export-patch.wat
    echo '  (func $compute_wrapper (param i32 i32) (result i32) i32.const 0)' >> web/export-patch.wat
    echo ")" >> web/export-patch.wat
    
    wat2wasm web/export-patch.wat -o web/export-patch.wasm
else
    echo "wat2wasm not found. Install it with: npm install -g wabt"
fi

echo ""
echo "❌ The core issue remains: The functions were compiled but not exported."
echo "   This is a known limitation with the current build setup."
echo ""
echo "   Next steps (Phase 6 implementation required):"
echo "   1. Rebuild with wasm32-freestanding target instead of wasm32-wasi"
echo "   2. Or use a custom build.zig file with proper export configuration"
echo "   3. Or use emscripten (though this was explicitly forbidden)"
echo ""
echo "   The functions ARE in the binary - we just need the right build flags!"