const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.resolveTargetQuery(std.Target.Query{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    });
    
    const optimize = b.standardOptimizeOption(.{});
    
    // Use static library for WASM
    const wasm_lib = b.addStaticLibrary(.{
        .name = "lua",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    
    // Force PIC for WASM
    wasm_lib.pie = true;
    
    // Add include paths
    wasm_lib.addIncludePath(b.path("src"));
    wasm_lib.addIncludePath(b.path("src/lua"));
    
    // Define macros
    wasm_lib.defineCMacro("_WASI_EMULATED_SIGNAL", null);
    wasm_lib.defineCMacro("_WASI_EMULATED_PROCESS_CLOCKS", null);
    
    // Link against libc
    wasm_lib.linkLibC();
    
    // Add all Lua C object files
    const lua_sources = [_][]const u8{
        "lapi", "lauxlib", "lbaselib", "lcode", "lcorolib", "lctype",
        "ldblib", "ldebug", "ldo", "ldump", "lfunc", "lgc", "linit",
        "liolib", "llex", "lmathlib", "lmem", "loadlib", "lobject",
        "lopcodes", "loslib", "lparser", "lstate", "lstring", "lstrlib",
        "ltable", "ltablib", "ltm", "lundump", "lutf8lib", "lvm", "lzio",
    };
    
    for (lua_sources) |src| {
        const obj_path = b.fmt(".build/{s}.o", .{src});
        wasm_lib.addObjectFile(b.path(obj_path));
    }
    
    // Force export of our functions
    wasm_lib.force_export_symbols = &.{
        "init",
        "compute",
        "get_buffer_ptr",
        "get_buffer_size",
        "get_memory_stats",
        "run_gc",
    };
    
    // Output as WASM
    const install_step = b.addInstallArtifact(wasm_lib, .{
        .dest_dir = .{ .override = .{ .custom = "web" } },
    });
    
    b.getInstallStep().dependOn(&install_step.step);
}

    const install_step = b.addInstallArtifact(wasm_lib, .{});
    b.getInstallStep().dependOn(&install_step.step);
}
