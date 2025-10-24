#!/bin/bash
set -e

echo "🔧 Post-processing WASM exports..."

# First, let's try a different build approach that preserves exports
# We'll use a modified main.zig that references all exported functions

# Create a modified main that references all exports to prevent elimination
cat > src/main_with_refs.zig << 'EOF'
const std = @import("std");
const original_main = @import("main.zig");

// Re-export all functions with proper export declarations
export fn init() i32 {
    return original_main.init();
}

export fn compute(code_ptr: usize, code_len: usize) i32 {
    return original_main.compute(code_ptr, code_len);
}

export fn get_buffer_ptr() [*]u8 {
    return original_main.get_buffer_ptr();
}

export fn get_buffer_size() usize {
    return original_main.get_buffer_size();
}

export fn get_memory_stats(stats: *original_main.MemoryStats) void {
    return original_main.get_memory_stats(stats);
}

export fn run_gc() void {
    return original_main.run_gc();
}

// Keep the _start function for WASI compatibility
export fn _start() void {
    // Do nothing - we don't want to run as a command
}

// Create a reference table to prevent dead code elimination
const keep_alive = struct {
    pub fn ref() void {
        _ = init;
        _ = compute;
        _ = get_buffer_ptr;
        _ = get_buffer_size;
        _ = get_memory_stats;
        _ = run_gc;
    }
};

// Call it from somewhere that won't be optimized out
comptime {
    _ = keep_alive.ref;
}
EOF

echo "🔧 Building with export wrapper..."
# Rebuild using the wrapper
zig build-exe -target wasm32-wasi -O ReleaseFast \
     -Isrc/lua -lc \
     -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
     src/main_with_refs.zig \
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
     -femit-bin=web/lua-processed.wasm 2>&1 || { 
         echo "❌ Build failed!"
         exit 1
     }

# Verify the exports
echo "✅ Verifying exports..."
node verify-exports.js web/lua-processed.wasm

if [ $? -eq 0 ]; then
    # Success! Replace the original
    mv web/lua-processed.wasm web/lua.wasm
    echo "✅ Export fix complete!"
    
    # Clean up
    rm -f src/main_with_refs.zig
else
    echo "❌ Export verification failed!"
    echo "   The build approach needs to be changed at a more fundamental level."
    echo "   Consider using a build.zig file or switching to wasm32-freestanding target."
    exit 1
fi