#!/bin/bash
set -e
echo "🔨 Building Lua Persistent Wasm Library with explicit exports..."
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

echo "🔧 Compiling main.zig to object file..."
zig build-obj -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua -lc \
     -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
     src/main.zig \
     -femit-bin=.build/main.o 2>&1 || { echo "❌ Zig compilation failed!"; exit 1; }

echo "🔧 Linking with wasm-ld..."
# Use wasm-ld directly with export flags
wasm-ld \
    --no-entry \
    --export-dynamic \
    --export=init \
    --export=compute \
    --export=get_buffer_ptr \
    --export=get_buffer_size \
    --export=get_memory_stats \
    --export=run_gc \
    --export=memory \
    --allow-undefined \
    -o web/lua-export.wasm \
    .build/main.o \
    .build/lapi.o .build/lauxlib.o .build/lbaselib.o \
    .build/lcode.o .build/lcorolib.o .build/lctype.o .build/ldblib.o \
    .build/ldebug.o .build/ldo.o .build/ldump.o .build/lfunc.o \
    .build/lgc.o .build/linit.o .build/liolib.o .build/llex.o \
    .build/lmathlib.o .build/lmem.o .build/loadlib.o .build/lobject.o \
    .build/lopcodes.o .build/loslib.o .build/lparser.o .build/lstate.o \
    .build/lstring.o .build/lstrlib.o .build/ltable.o .build/ltablib.o \
    .build/ltm.o .build/lundump.o .build/lutf8lib.o .build/lvm.o \
    .build/lzio.o 2>&1 || { echo "❌ Linking failed!"; exit 1; }

SIZE=$(wc -c < web/lua-export.wasm 2>/dev/null || echo "0")
SIZE_KB=$((SIZE / 1024))
echo ""
echo "✅ Build complete!"
echo "   Output: web/lua-export.wasm"
echo "   Size: ${SIZE_KB} KB"
echo ""
echo "📋 Checking exports..."
wasm-objdump -x web/lua-export.wasm 2>/dev/null | grep -A20 "Export\[" || echo "Failed to analyze exports"