// This file forces the linker to keep our exported functions
// by creating references to them that won't be optimized away

const main = @import("main.zig");

// Create a table of function pointers to prevent dead code elimination
pub const export_table = [_]*const anyopaque{
    @ptrCast(&main.init),
    @ptrCast(&main.compute),
    @ptrCast(&main.get_buffer_ptr),
    @ptrCast(&main.get_buffer_size),
    @ptrCast(&main.get_memory_stats),
    @ptrCast(&main.run_gc),
};

// Export a dummy function that references the table
export fn keep_exports() usize {
    return @intFromPtr(&export_table);
}
