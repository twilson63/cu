#!/bin/bash
set -e
echo "🔨 Building Lua WASM with wasm32-freestanding..."
echo ""

mkdir -p .build web

echo "🔧 Compiling Lua C sources for freestanding..."
cd src/lua
for file in lapi lauxlib lbaselib lcode lcorolib lctype ldblib ldebug ldo ldump \
             lfunc lgc linit liolib llex lmathlib lmem loadlib lobject lopcodes \
             loslib lparser lstate lstring lstrlib ltable ltablib ltm lundump \
             lutf8lib lvm lzio; do
      printf "  %-20s" "$file.c"
     zig cc -target wasm32-freestanding \
         -c -O2 $file.c -o ../../.build/${file}.o 2>&1 && echo "✓" || {
         echo ""
         echo "❌ Failed to compile $file.c"
         exit 1
     }
done
cd ../..

echo "🔧 Compiling Zig main with freestanding..."
zig build-exe -target wasm32-freestanding -O ReleaseFast \
     -Isrc/lua \
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
     -femit-bin=web/lua.wasm 2>&1 || { echo "❌ Zig compilation failed!"; exit 1; }

SIZE=$(wc -c < web/lua.wasm)
SIZE_KB=$((SIZE / 1024))
echo ""
echo "✅ Build complete!"
echo "   Output: web/lua.wasm"
echo "   Size: ${SIZE_KB} KB"
