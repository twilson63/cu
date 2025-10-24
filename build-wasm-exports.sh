#!/bin/bash
set -e
echo "🔨 Building Lua Persistent Wasm with Proper Exports..."
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
        -D_WASI_EMULATED_SIGNAL \
        -D_WASI_EMULATED_PROCESS_CLOCKS \
        -c -O2 $file.c -o ../../.build/${file}.o 2>&1 && echo "✓" || {
        echo ""
        echo "❌ Failed to compile $file.c"
        exit 1
    }
done
cd ../..

echo "🔧 Creating export wrapper..."
cat > src/export_wrapper.zig << 'EOF'
const main = @import("main.zig");

// Re-export all functions from main
pub export fn init() i32 {
    return main.init();
}

pub export fn get_buffer_ptr() [*]u8 {
    return main.get_buffer_ptr();
}

pub export fn get_buffer_size() usize {
    return main.get_buffer_size();
}

pub export fn compute(code_ptr: usize, code_len: usize) i32 {
    return main.compute(code_ptr, code_len);
}

pub export fn get_memory_stats(stats: *main.MemoryStats) void {
    main.get_memory_stats(stats);
}

pub export fn run_gc() void {
    main.run_gc();
}

// WASI stub for memory allocation
export fn __wasi_args_sizes_get(argc: *u32, argv_buf_size: *u32) i32 {
    argc.* = 0;
    argv_buf_size.* = 0;
    return 0;
}

export fn __wasi_args_get(argv: [*][*:0]u8, argv_buf: [*]u8) i32 {
    _ = argv;
    _ = argv_buf;
    return 0;
}
EOF

echo "🔧 Compiling WASM module..."
zig build-exe -target wasm32-freestanding -O ReleaseFast \
    -Isrc/lua \
    -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
    -fno-entry \
    -rdynamic \
    src/export_wrapper.zig \
    .build/lapi.o .build/lauxlib.o .build/lbaselib.o \
    .build/lcode.o .build/lcorolib.o .build/lctype.o .build/ldblib.o \
    .build/ldebug.o .build/ldo.o .build/ldump.o .build/lfunc.o \
    .build/lgc.o .build/linit.o .build/liolib.o .build/llex.o \
    .build/lmathlib.o .build/lmem.o .build/loadlib.o .build/lobject.o \
    .build/lopcodes.o .build/loslib.o .build/lparser.o .build/lstate.o \
    .build/lstring.o .build/lstrlib.o .build/ltable.o .build/ltablib.o \
    .build/ltm.o .build/lundump.o .build/lutf8lib.o .build/lvm.o \
    .build/lzio.o \
    -femit-bin=web/lua-exports.wasm 2>&1 || { echo "❌ Zig compilation failed!"; exit 1; }

SIZE=$(wc -c < web/lua-exports.wasm)
SIZE_KB=$((SIZE / 1024))
echo ""
echo "✅ Build complete!"
echo "   Output: web/lua-exports.wasm"
echo "   Size: ${SIZE_KB} KB"
echo ""
echo "📋 Checking exports..."
wasm-objdump -x web/lua-exports.wasm | grep -A20 "Export\[" || echo "No exports found"