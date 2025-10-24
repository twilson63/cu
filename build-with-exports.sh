#!/bin/bash
set -e
echo "🔨 Building Lua Persistent Wasm with Forced Exports..."
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

echo "🔧 Compiling Zig main with export hack..."
# First compile the main module
zig build-obj -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua \
     src/main.zig -femit-bin=.build/main.o 2>&1 || { echo "❌ Failed to compile main.zig"; exit 1; }

# Compile the export hack
zig build-obj -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua \
     src/export_hack.zig -femit-bin=.build/export_hack.o 2>&1 || { echo "❌ Failed to compile export_hack.zig"; exit 1; }

# Now link everything together
echo "🔧 Linking WASM module..."
zig build-exe -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua -lc \
     -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
     .build/main.o .build/export_hack.o \
     .build/lapi.o .build/lauxlib.o .build/lbaselib.o \
     .build/lcode.o .build/lcorolib.o .build/lctype.o .build/ldblib.o \
     .build/ldebug.o .build/ldo.o .build/ldump.o .build/lfunc.o \
     .build/lgc.o .build/linit.o .build/liolib.o .build/llex.o \
     .build/lmathlib.o .build/lmem.o .build/loadlib.o .build/lobject.o \
     .build/lopcodes.o .build/loslib.o .build/lparser.o .build/lstate.o \
     .build/lstring.o .build/lstrlib.o .build/ltable.o .build/ltablib.o \
     .build/ltm.o .build/lundump.o .build/lutf8lib.o .build/lvm.o \
     .build/lzio.o \
     -lwasi-emulated-signal \
     -femit-bin=web/lua-with-exports.wasm 2>&1 || { echo "❌ Linking failed!"; exit 1; }

# Convert to WAT to check exports
echo "🔧 Converting to WAT format..."
wasm2wat web/lua-with-exports.wasm -o web/lua-with-exports.wat 2>&1

# Check if we have the functions now
echo "📋 Checking for exported functions..."
echo ""
echo "Exports in WASM:"
wasm-objdump -x web/lua-with-exports.wasm | grep -A10 "Export\[" || echo "No exports section"
echo ""
echo "Functions with 'init' in name:"
grep -n "func.*init\|export.*init" web/lua-with-exports.wat | head -10 || echo "No init functions found"
echo ""
echo "Functions with 'compute' in name:"
grep -n "func.*compute\|export.*compute" web/lua-with-exports.wat | head -10 || echo "No compute functions found"

SIZE=$(wc -c < web/lua-with-exports.wasm)
SIZE_KB=$((SIZE / 1024))
echo ""
echo "✅ Build complete!"
echo "   Output: web/lua-with-exports.wasm"
echo "   Size: ${SIZE_KB} KB"