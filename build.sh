#!/bin/bash
set -e
echo "🔨 Building Lua Persistent Wasm with Zig..."
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
     zig cc -target wasm32-freestanding \
         -I.. \
         -c -O2 $file.c -o ../../.build/${file}.o 2>&1 && echo "✓" || {
         echo ""
         echo "❌ Failed to compile $file.c"
         exit 1
     }
done
cd ../..
echo "🔧 Compiling libc stubs..."
zig build-obj -target wasm32-freestanding -O ReleaseFast \
     src/libc-stubs.zig -femit-bin=.build/libc-stubs.o || { echo "❌ Failed to compile libc-stubs.zig"; exit 1; }
echo "✓"

echo "🔧 Compiling Zig main..."
zig build-exe -target wasm32-freestanding -O ReleaseFast \
     -Isrc -Isrc/lua \
     -fno-entry \
     --export=init \
     --export=compute \
     --export=get_buffer_ptr \
     --export=get_buffer_size \
     --export=get_memory_stats \
     --export=run_gc \
     --export=attach_memory_table \
     --export=get_memory_table_id \
     --export=sync_external_table_counter \
     --export=set_memory_alias_enabled \
     src/main.zig \
     .build/libc-stubs.o \
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
