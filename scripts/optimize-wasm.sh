#!/bin/bash

# Optimize WASM binary using wasm-opt if available

WASM_FILE="dist/lua.wasm"

if ! command -v wasm-opt &> /dev/null; then
    echo "wasm-opt not found. Install with: npm install -g wasm-opt"
    exit 0
fi

echo "Optimizing WASM binary..."
ORIGINAL_SIZE=$(wc -c < "$WASM_FILE")

wasm-opt -O3 \
    --enable-simd \
    --enable-bulk-memory \
    "$WASM_FILE" \
    -o "$WASM_FILE.opt"

if [ $? -eq 0 ]; then
    mv "$WASM_FILE.opt" "$WASM_FILE"
    NEW_SIZE=$(wc -c < "$WASM_FILE")
    SAVINGS=$((ORIGINAL_SIZE - NEW_SIZE))
    PERCENT=$((SAVINGS * 100 / ORIGINAL_SIZE))
    
    echo "Optimization complete!"
    echo "Original size: $ORIGINAL_SIZE bytes"
    echo "New size: $NEW_SIZE bytes"
    echo "Saved: $SAVINGS bytes ($PERCENT%)"
else
    echo "Optimization failed, keeping original file"
    rm -f "$WASM_FILE.opt"
fi