const std = @import("std");

pub fn main() !void {
    // Simulate what we're doing in deserializer
    const buffer = [_]u8{ 0x02, 0x19, 0xfc, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff };
    
    var int_val: i64 = undefined;
    const bytes = buffer[1..9];
    @memcpy(std.mem.asBytes(&int_val), bytes);
    
    std.debug.print("int_val: {d}\n", .{int_val});
    std.debug.print("Expected: -999\n", .{});
}
