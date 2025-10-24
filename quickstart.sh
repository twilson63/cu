#!/bin/bash

echo "🚀 Lua Persistent Wasm - Quick Start"
echo "===================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust not found!"
    echo "📥 Install Rust from: https://rustup.rs/"
    echo "   Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found!"
    echo "📥 Install Python 3 from: https://python.org"
    exit 1
fi

echo "✅ All prerequisites found!"
echo ""

# Install wasm32 target
echo "📦 Setting up WebAssembly target..."
rustup target add wasm32-unknown-unknown

# Build
echo ""
echo "🔨 Building project..."
cargo build --target wasm32-unknown-unknown --release

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Copy wasm file
cp target/wasm32-unknown-unknown/release/lua_persistent_wasm.wasm web/lua.wasm

# Get size
SIZE=$(wc -c < web/lua.wasm)
SIZE_KB=$((SIZE / 1024))

echo ""
echo "✅ Build successful!"
echo "   File: web/lua.wasm"
echo "   Size: ${SIZE_KB} KB"
echo ""
echo "🌐 Starting web server..."
echo "   URL: http://localhost:8000"
echo ""
echo "   Press Ctrl+C to stop the server"
echo ""

# Start server
cd web
python3 -m http.server 8000
