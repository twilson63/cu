const std = @import("std");

pub fn build(b: *std.build.Builder) void {
    const target = b.standardTargetOptions(.{
        .default_target = .{
            .cpu_arch = .wasm32,
            .os_tag = .freestanding,
        },
    });

    const optimize = b.standardOptimizeOption(.{
        .preferred_optimize_mode = .ReleaseFast,
    });

    const exe = b.addExecutable(.{
        .name = "lua",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    exe.addIncludePath(b.path("src/lua"));

    // Link with libc for wasm32 (provides string.h, stdlib.h, etc.)
    exe.linkLibC();

    // Add all Lua C object files
    const lua_files = [_][]const u8{
        "lapi",    "lauxlib", "lbaselib", "lcode",    "lcorolib", "lctype",   "ldblib", "ldebug",
        "ldo",     "ldump",   "lfunc",    "lgc",      "linit",    "liolib",   "llex",   "lmathlib",
        "lmem",    "loadlib", "lobject",  "lopcodes", "loslib",   "lparser",  "lstate", "lstring",
        "lstrlib", "ltable",  "ltablib",  "ltm",      "lundump",  "lutf8lib", "lvm",    "lzio",
    };

    for (lua_files) |file| {
        const obj = b.addObject(.{
            .name = file,
            .root_source_file = null,
            .target = target,
            .optimize = optimize,
        });
        obj.addCSourceFile(.{
            .file = b.path(b.fmt("src/lua/{s}.c", .{file})),
            .flags = &.{ "-O2", "-Isrc/lua" },
        });
        obj.linkLibC();
        exe.addObject(obj);
    }

    b.installArtifact(exe);
}
