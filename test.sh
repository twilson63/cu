#!/bin/bash

echo "🧪 Testing Lua Persistent WASM Module"
echo ""

# Start web server in background
cd web
python3 -m http.server 8000 > /dev/null 2>&1 &
SERVER_PID=$!
sleep 2

echo "Testing HTTP server..."
RESPONSE=$(curl -s http://localhost:8000/)

if [ -z "$RESPONSE" ]; then
    echo "❌ Failed to connect to web server"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

if echo "$RESPONSE" | grep -q "Lua Persistent"; then
    echo "✅ Web server is running"
    echo "✅ HTML page loaded successfully"
else
    echo "❌ HTML page not found"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Check if WASM file exists
if [ -f "lua.wasm" ]; then
    SIZE=$(wc -c < lua.wasm)
    echo "✅ WASM file exists ($(($SIZE / 1024)) KB)"
else
    echo "❌ WASM file not found"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Test WASM file is valid
if file lua.wasm | grep -q "WebAssembly"; then
    echo "✅ WASM file format is valid"
else
    echo "❌ WASM file format invalid"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# Check JavaScript files
if [ -f "lua-persistent.js" ]; then
    echo "✅ JavaScript wrapper found"
else
    echo "❌ JavaScript wrapper not found"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "🚀 All checks passed!"
echo ""
echo "To test in browser:"
echo "  1. Keep server running: cd web && python3 -m http.server 8000"
echo "  2. Open: http://localhost:8000"
echo "  3. Open browser console (F12)"
echo "  4. Test Lua code execution"
echo ""

kill $SERVER_PID 2>/dev/null
exit 0
