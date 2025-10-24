#!/bin/bash
set -e
echo "🔨 Building Lua WASM with Proper Exports..."
echo ""

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

echo "🔧 Compiling Zig as library..."
# Use build-lib which generates .wasm directly
zig build-lib -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua -lc \
     -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
     -dynamic \
     src/main.zig \
     .build/lapi.o .build/lauxlib.o .build/lbaselib.o \
     .build/lcode.o .build/lcorolib.o .build/lctype.o .build/ldblib.o \
     .build/ldebug.o .build/ldo.o .build/ldump.o .build/lfunc.o \
     .build/lgc.o .build/linit.o .build/liolib.o .build/llex.o \
     .build/lmathlib.o .build/lmem.o .build/loadlib.o .build/lobject.o \
     .build/lopcodes.o .build/loslib.o .build/lparser.o .build/lstate.o \
     .build/lstring.o .build/lstrlib.o .build/ltable.o .build/ltablib.o \
     .build/ltm.o .build/lundump.o .build/lutf8lib.o .build/lvm.o \
     .build/lzio.o \
     -lwasi-emulated-signal 2>&1 || { echo "❌ Compilation failed"; exit 1; }

# Find and copy the .wasm file
if [ -f "main.wasm" ]; then
    cp main.wasm web/lua.wasm
elif [ -f "libmain.wasm" ]; then
    cp libmain.wasm web/lua.wasm
else
    echo "❌ No WASM output found"
    exit 1
fi

SIZE=$(wc -c < web/lua.wasm)
SIZE_KB=$((SIZE / 1024))
echo ""
echo "✅ Build complete!"
echo "   Output: web/lua.wasm"
echo "   Size: ${SIZE_KB} KB"
