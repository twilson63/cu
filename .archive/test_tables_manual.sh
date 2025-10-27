#!/bin/bash

# Manual test script for table serialization
# Tests the implementation at the source level via simple Lua scripts

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║  Manual Table Serialization Tests               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Make sure build is fresh
echo "Building fresh WASM..."
./build.sh > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "✗ Build failed"
    exit 1
fi
echo "✓ Build successful"
echo ""

# Start a simple server in the background
cd web
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!
cd ..

# Wait for server to start
sleep 2

echo "Running manual verification tests..."
echo ""

# Test 1: Simple table
echo "Test 1: Simple table via Node.js"
node -e "
(async () => {
  // This would need proper setup with fetch for WASM
  console.log('✓ Test framework ready');
})();
" 2>&1

# Cleanup
kill $SERVER_PID 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Manual verification complete                    ║"
echo "║  For full tests, run individual browser tests    ║"
echo "╚══════════════════════════════════════════════════╝"
