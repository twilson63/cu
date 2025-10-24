#!/bin/bash
set -e
echo "🔨 Building Lua Persistent Wasm Library..."
echo ""
if ! command -v zig &> /dev/null; then
    echo "❌ Zig is not installed!"
    exit 1
fi
mkdir -p .build web

echo "🔧 Compiling Lua C sources..."
cd src/lua
for file in lapi lauxlib lbaselib lcode lcorolib lctype ldblib ldebug ldo ldump \
             lfunc lgc linit liolib llex lmathlib lmem loadlib lobject lopcodes \
             loslib lparser lstate lstring lstrlib ltable ltablib ltm lundump \
             lutf8lib lvm lzio; do
      printf "  %-20s" "$file.c"
     zig cc -target wasm32-wasi \
         -D_WASI_EMULATED_SIGNAL \
         -D_WASI_EMULATED_PROCESS_CLOCKS \
         -c -O2 $file.c -o ../../.build/${file}.o 2>&1 && echo "✓" || {
         echo ""
         echo "❌ Failed to compile $file.c"
         exit 1
     }
done
cd ../..

echo "🔧 Creating WASM module with wasm-ld..."
# Use wasm-ld directly for more control
/opt/homebrew/Cellar/lld@20/20.1.8/bin/wasm-ld \
    --no-entry \
    --export-dynamic \
    --allow-undefined \
    --export=init \
    --export=compute \
    --export=get_buffer_ptr \
    --export=get_buffer_size \
    --export=get_memory_stats \
    --export=run_gc \
    --export=memory \
    --initial-memory=16777216 \
    --max-memory=16777216 \
    -L/opt/homebrew/Cellar/zig/0.15.1/lib/zig/lib \
    -lc \
    -lwasi-emulated-signal \
    -o web/lua-library.wasm \
    .build/*.o \
    /opt/homebrew/Cellar/zig/0.15.1/lib/zig/libc/wasm32-wasi-musl/libc.a 2>&1 || { 
        echo "❌ Linking failed!"
        echo "Trying alternative approach..."
        
        # Alternative: compile main.zig as object first
        echo "🔧 Compiling main.zig as object..."
        zig build-obj -target wasm32-wasi -O ReleaseFast \
            -Isrc/lua -lc \
            -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
            src/main.zig \
            -femit-bin=.build/main.o || { echo "❌ Main compilation failed!"; exit 1; }
        
        # Try linking again with main.o
        /opt/homebrew/Cellar/lld@20/20.1.8/bin/wasm-ld \
            --no-entry \
            --export=init \
            --export=compute \
            --export=get_buffer_ptr \
            --export=get_buffer_size \
            --export=get_memory_stats \
            --export=run_gc \
            --allow-undefined \
            -o web/lua-library.wasm \
            .build/main.o \
            .build/lapi.o .build/lauxlib.o .build/lbaselib.o \
            .build/lcode.o .build/lcorolib.o .build/lctype.o .build/ldblib.o \
            .build/ldebug.o .build/ldo.o .build/ldump.o .build/lfunc.o \
            .build/lgc.o .build/linit.o .build/liolib.o .build/llex.o \
            .build/lmathlib.o .build/lmem.o .build/loadlib.o .build/lobject.o \
            .build/lopcodes.o .build/loslib.o .build/lparser.o .build/lstate.o \
            .build/lstring.o .build/lstrlib.o .build/ltable.o .build/ltablib.o \
            .build/ltm.o .build/lundump.o .build/lutf8lib.o .build/lvm.o \
            .build/lzio.o || { echo "❌ Alternative linking failed!"; exit 1; }
    }

# Verify exports
echo ""
echo "📋 Verifying exports..."
node verify-exports.js web/lua-library.wasm

if [ $? -eq 0 ]; then
    # Success! Replace the original
    cp web/lua-library.wasm web/lua.wasm
    SIZE=$(wc -c < web/lua.wasm)
    SIZE_KB=$((SIZE / 1024))
    echo ""
    echo "✅ Build complete!"
    echo "   Output: web/lua.wasm"
    echo "   Size: ${SIZE_KB} KB"
else
    echo "❌ Export verification failed!"
    exit 1
fi