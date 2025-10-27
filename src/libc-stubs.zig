const std = @import("std");

const MALLOC_POOL_SIZE = 512 * 1024;

var malloc_pool: [MALLOC_POOL_SIZE]u8 align(16) = undefined;
var malloc_ptr: usize = 0;

pub var errno_value: c_int = 0;
export var errno: c_int = 0;

// FILE* handles
const FILE = opaque {};
export var stdin: ?*FILE = @as(?*FILE, @ptrFromInt(1));
export var stdout: ?*FILE = @as(?*FILE, @ptrFromInt(2));
export var stderr: ?*FILE = @as(?*FILE, @ptrFromInt(3));

extern "env" fn js_time_now() c_long;

// Renamed allocators to avoid conflicts
export fn lua_malloc(size: usize) ?*anyopaque {
    if (size == 0) return null;
    if (malloc_ptr + size > MALLOC_POOL_SIZE) return null;

    const ptr = &malloc_pool[malloc_ptr];
    malloc_ptr += size;

    return @ptrCast(ptr);
}

export fn lua_free(ptr: ?*anyopaque) void {
    _ = ptr;
}

export fn lua_realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque {
    if (size == 0) {
        lua_free(ptr);
        return null;
    }

    const new_ptr = lua_malloc(size);
    if (new_ptr == null) return null;

    if (ptr != null) {
        @memcpy(@as([*]u8, @ptrCast(new_ptr))[0..size], @as([*]u8, @ptrCast(ptr))[0..size]);
    }

    return new_ptr;
}

export fn lua_calloc(nmemb: usize, size: usize) ?*anyopaque {
    const total = nmemb *| size;
    if (total == 0) return null;

    const ptr = lua_malloc(total);
    if (ptr != null) {
        @memset(@as([*]u8, @ptrCast(ptr))[0..total], 0);
    }

    return ptr;
}

// Non-exported wrappers for C compatibility
export fn malloc(size: usize) ?*anyopaque {
    return lua_malloc(size);
}

export fn free(ptr: ?*anyopaque) void {
    lua_free(ptr);
}

export fn realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque {
    return lua_realloc(ptr, size);
}

export fn calloc(nmemb: usize, size: usize) ?*anyopaque {
    return lua_calloc(nmemb, size);
}

export fn memcpy(dest: *anyopaque, src: *const anyopaque, n: usize) *anyopaque {
    if (n > 0) {
        @memcpy(@as([*]u8, @ptrCast(dest))[0..n], @as([*]const u8, @ptrCast(src))[0..n]);
    }
    return dest;
}

export fn memmove(dest: *anyopaque, src: *const anyopaque, n: usize) *anyopaque {
    if (n > 0) {
        const dest_ptr = @as([*]u8, @ptrCast(dest));
        const src_ptr = @as([*]const u8, @ptrCast(src));

        if (@intFromPtr(dest) <= @intFromPtr(src)) {
            @memcpy(dest_ptr[0..n], src_ptr[0..n]);
        } else {
            var i: usize = n;
            while (i > 0) {
                i -= 1;
                dest_ptr[i] = src_ptr[i];
            }
        }
    }
    return dest;
}

export fn memset(s: *anyopaque, c: c_int, n: usize) *anyopaque {
    if (n > 0) {
        const fill_byte: u8 = @as(u8, @intCast(c & 0xFF));
        @memset(@as([*]u8, @ptrCast(s))[0..n], fill_byte);
    }
    return s;
}

export fn memcmp(s1: *const anyopaque, s2: *const anyopaque, n: usize) c_int {
    const p1 = @as([*]const u8, @ptrCast(s1));
    const p2 = @as([*]const u8, @ptrCast(s2));

    for (0..n) |i| {
        const diff: c_int = @as(c_int, @intCast(p1[i])) - @as(c_int, @intCast(p2[i]));
        if (diff != 0) return diff;
    }
    return 0;
}

export fn memchr(s: *const anyopaque, c: c_int, n: usize) ?*anyopaque {
    const ptr = @as([*]const u8, @ptrCast(s));
    const byte: u8 = @as(u8, @intCast(c & 0xFF));

    for (0..n) |i| {
        if (ptr[i] == byte) {
            return @ptrFromInt(@intFromPtr(s) + i);
        }
    }
    return null;
}

export fn strlen(s: [*:0]const u8) usize {
    var len: usize = 0;
    while (s[len] != 0) {
        len += 1;
    }
    return len;
}

export fn strcmp(s1: [*:0]const u8, s2: [*:0]const u8) c_int {
    var i: usize = 0;
    while (true) {
        const c1 = s1[i];
        const c2 = s2[i];

        if (c1 != c2) {
            return @as(c_int, @intCast(c1)) - @as(c_int, @intCast(c2));
        }
        if (c1 == 0) break;
        i += 1;
    }
    return 0;
}

export fn strncmp(s1: [*:0]const u8, s2: [*:0]const u8, n: usize) c_int {
    if (n == 0) return 0;

    for (0..n) |i| {
        const c1 = s1[i];
        const c2 = s2[i];

        if (c1 != c2) {
            return @as(c_int, @intCast(c1)) - @as(c_int, @intCast(c2));
        }
        if (c1 == 0) break;
    }
    return 0;
}

export fn strcoll(s1: [*:0]const u8, s2: [*:0]const u8) c_int {
    return strcmp(s1, s2);
}

export fn strcpy(dest: [*:0]u8, src: [*:0]const u8) [*:0]u8 {
    var i: usize = 0;
    while (src[i] != 0) {
        dest[i] = src[i];
        i += 1;
    }
    dest[i] = 0;
    return dest;
}

export fn strncpy(dest: [*:0]u8, src: [*:0]const u8, n: usize) [*:0]u8 {
    var i: usize = 0;
    while (i < n and src[i] != 0) {
        dest[i] = src[i];
        i += 1;
    }
    while (i < n) {
        dest[i] = 0;
        i += 1;
    }
    return dest;
}

export fn strcat(dest: [*:0]u8, src: [*:0]const u8) [*:0]u8 {
    var dest_len: usize = 0;
    while (dest[dest_len] != 0) {
        dest_len += 1;
    }

    var i: usize = 0;
    while (src[i] != 0) {
        dest[dest_len + i] = src[i];
        i += 1;
    }
    dest[dest_len + i] = 0;

    return dest;
}

export fn strncat(dest: [*:0]u8, src: [*:0]const u8, n: usize) [*:0]u8 {
    var dest_len: usize = 0;
    while (dest[dest_len] != 0) {
        dest_len += 1;
    }

    var i: usize = 0;
    while (i < n and src[i] != 0) {
        dest[dest_len + i] = src[i];
        i += 1;
    }
    dest[dest_len + i] = 0;

    return dest;
}

export fn strchr(s: [*:0]const u8, c: c_int) ?[*]u8 {
    const char_to_find: u8 = @as(u8, @intCast(c & 0xFF));
    var i: usize = 0;

    while (true) {
        if (s[i] == char_to_find) {
            return @as([*]u8, @ptrCast(@constCast(&s[i])));
        }
        if (s[i] == 0) break;
        i += 1;
    }

    return null;
}

export fn strstr(haystack: [*:0]const u8, needle: [*:0]const u8) ?[*]u8 {
    const needle_len = strlen(needle);

    if (needle_len == 0) {
        return @constCast(haystack);
    }

    var i: usize = 0;
    while (haystack[i] != 0) {
        if (strncmp(@as([*:0]const u8, @ptrCast(&haystack[i])), needle, needle_len) == 0) {
            return @as([*]u8, @ptrCast(@constCast(&haystack[i])));
        }
        i += 1;
    }

    return null;
}

export fn strcspn(s: [*:0]const u8, reject: [*:0]const u8) usize {
    var i: usize = 0;
    while (s[i] != 0) {
        var j: usize = 0;
        while (reject[j] != 0) {
            if (s[i] == reject[j]) {
                return i;
            }
            j += 1;
        }
        i += 1;
    }
    return i;
}

export fn strspn(s: [*:0]const u8, accept: [*:0]const u8) usize {
    var i: usize = 0;
    while (s[i] != 0) {
        var found = false;
        var j: usize = 0;
        while (accept[j] != 0) {
            if (s[i] == accept[j]) {
                found = true;
                break;
            }
            j += 1;
        }
        if (!found) break;
        i += 1;
    }
    return i;
}

export fn strpbrk(s: [*:0]const u8, accept: [*:0]const u8) ?[*:0]const u8 {
    var i: usize = 0;
    while (s[i] != 0) {
        var j: usize = 0;
        while (accept[j] != 0) {
            if (s[i] == accept[j]) {
                return @ptrFromInt(@intFromPtr(s) + i);
            }
            j += 1;
        }
        i += 1;
    }
    return null;
}

export fn isalpha(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if ((ch >= 'A' and ch <= 'Z') or (ch >= 'a' and ch <= 'z')) {
        return 1;
    }
    return 0;
}

export fn isdigit(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= '0' and ch <= '9') {
        return 1;
    }
    return 0;
}

export fn isalnum(c: c_int) c_int {
    return if (isalpha(c) != 0 or isdigit(c) != 0) 1 else 0;
}

export fn isspace(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    return switch (ch) {
        ' ', '\t', '\n', '\r', '\x0B', '\x0C' => 1,
        else => 0,
    };
}

export fn isupper(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= 'A' and ch <= 'Z') {
        return 1;
    }
    return 0;
}

export fn islower(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= 'a' and ch <= 'z') {
        return 1;
    }
    return 0;
}

export fn isxdigit(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    return switch (ch) {
        '0'...'9', 'A'...'F', 'a'...'f' => 1,
        else => 0,
    };
}

export fn isprint(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= 0x20 and ch <= 0x7E) {
        return 1;
    }
    return 0;
}

export fn iscntrl(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch < 0x20 or ch == 0x7F) {
        return 1;
    }
    return 0;
}

export fn toupper(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= 'a' and ch <= 'z') {
        return @as(c_int, @intCast(ch - 'a' + 'A'));
    }
    return c;
}

export fn tolower(c: c_int) c_int {
    const ch: u8 = @as(u8, @intCast(c & 0xFF));
    if (ch >= 'A' and ch <= 'Z') {
        return @as(c_int, @intCast(ch - 'A' + 'a'));
    }
    return c;
}

export fn atoi(nptr: [*:0]const u8) c_int {
    var result: i32 = 0;
    var i: usize = 0;
    var negative = false;

    while (isspace(nptr[i]) != 0) {
        i += 1;
    }

    if (nptr[i] == '-') {
        negative = true;
        i += 1;
    } else if (nptr[i] == '+') {
        i += 1;
    }

    while (isdigit(nptr[i]) != 0) {
        result = result * 10 + @as(i32, @intCast(nptr[i] - '0'));
        i += 1;
    }

    return if (negative) -result else result;
}

export fn atol(nptr: [*:0]const u8) c_long {
    var result: c_long = 0;
    var i: usize = 0;
    var negative = false;

    while (isspace(nptr[i]) != 0) {
        i += 1;
    }

    if (nptr[i] == '-') {
        negative = true;
        i += 1;
    } else if (nptr[i] == '+') {
        i += 1;
    }

    while (isdigit(nptr[i]) != 0) {
        result = result * 10 + @as(c_long, @intCast(nptr[i] - '0'));
        i += 1;
    }

    return if (negative) -result else result;
}

export fn strtol(nptr: [*:0]const u8, endptr: ?*[*:0]u8, base: c_int) c_long {
    var result: c_long = 0;
    var i: usize = 0;
    var negative = false;
    var actual_base: c_int = base;

    while (isspace(nptr[i]) != 0) {
        i += 1;
    }

    if (nptr[i] == '-') {
        negative = true;
        i += 1;
    } else if (nptr[i] == '+') {
        i += 1;
    }

    if (actual_base == 0) {
        if (nptr[i] == '0') {
            i += 1;
            if (nptr[i] == 'x' or nptr[i] == 'X') {
                actual_base = 16;
                i += 1;
            } else {
                actual_base = 8;
            }
        } else {
            actual_base = 10;
        }
    } else if (actual_base == 16 and nptr[i] == '0') {
        if (nptr[i + 1] == 'x' or nptr[i + 1] == 'X') {
            i += 2;
        }
    }

    const start_i = i;
    while (nptr[i] != 0) {
        var digit: c_int = -1;
        const ch = nptr[i];

        if (ch >= '0' and ch <= '9') {
            digit = @as(c_int, @intCast(ch - '0'));
        } else if (ch >= 'a' and ch <= 'z') {
            digit = @as(c_int, @intCast(ch - 'a' + 10));
        } else if (ch >= 'A' and ch <= 'Z') {
            digit = @as(c_int, @intCast(ch - 'A' + 10));
        }

        if (digit < 0 or digit >= actual_base) {
            break;
        }

        result = result * @as(c_long, @intCast(actual_base)) + @as(c_long, @intCast(digit));
        i += 1;
    }

    if (endptr) |ep| {
        ep.* = @as([*:0]u8, @ptrCast(@constCast(&nptr[if (i == start_i) if (negative or (start_i > 0 and nptr[start_i - 1] == '+')) start_i - 1 else start_i else i])));
    }

    return if (negative) -result else result;
}

export fn strtold(nptr: [*:0]const u8, endptr: ?*[*:0]u8) c_longdouble {
    var result: c_longdouble = 0.0;
    var i: usize = 0;
    var negative = false;
    var has_dot = false;
    var has_digit = false;
    var after_dot: usize = 0;

    while (isspace(nptr[i]) != 0) {
        i += 1;
    }

    if (nptr[i] == '-') {
        negative = true;
        i += 1;
    } else if (nptr[i] == '+') {
        i += 1;
    }

    while (nptr[i] != 0) {
        if (nptr[i] == '.' and !has_dot) {
            has_dot = true;
            i += 1;
            after_dot = 0;
            continue;
        }

        if (isdigit(nptr[i]) != 0) {
            has_digit = true;
            result = result * 10.0 + @as(c_longdouble, @floatFromInt(nptr[i] - '0'));
            if (has_dot) after_dot += 1;
            i += 1;
        } else if ((nptr[i] == 'e' or nptr[i] == 'E') and has_digit) {
            i += 1;
            var exp_sign: c_int = 1;
            if (nptr[i] == '-') {
                exp_sign = -1;
                i += 1;
            } else if (nptr[i] == '+') {
                i += 1;
            }

            var exponent: c_int = 0;
            while (isdigit(nptr[i]) != 0) {
                exponent = exponent * 10 + @as(c_int, @intCast(nptr[i] - '0'));
                i += 1;
            }

            var power: c_longdouble = 1.0;
            var e: c_int = exponent * exp_sign;
            var base: c_longdouble = 10.0;

            while (e > 0) {
                if (e & 1 != 0) power *= base;
                base *= base;
                e >>= 1;
            }
            while (e < 0) {
                if (e & 1 != 0) power /= base;
                base *= base;
                e = -(-e >> 1);
            }

            result *= power;
            break;
        } else {
            break;
        }
    }

    var divisor: c_longdouble = 1.0;
    for (0..after_dot) |_| {
        divisor *= 10.0;
    }
    if (has_dot and divisor > 1.0) {
        result /= divisor;
    }

    if (endptr) |ep| {
        ep.* = @as([*:0]u8, @ptrCast(@constCast(&nptr[i])));
    }

    return if (negative) -result else result;
}

export fn strtod(nptr: [*:0]const u8, endptr: ?*[*:0]u8) f64 {
    return @as(f64, @floatCast(strtold(nptr, endptr)));
}

export fn time(tloc: ?*c_long) c_long {
    const now_ms = js_time_now();
    const now_sec = @divTrunc(now_ms, 1000);
    // Ensure it fits in c_long range
    const result = @as(c_long, @intCast(now_sec & 0x7FFFFFFF));
    if (tloc) |t| {
        t.* = result;
    }
    return result;
}

export fn clock() c_long {
    return js_time_now();
}

// File I/O stubs (minimal implementation for WebAssembly)
export fn fopen(filename: [*:0]const u8, mode: [*:0]const u8) ?*FILE {
    _ = filename;
    _ = mode;
    errno = 2; // ENOENT
    return null;
}

export fn fclose(stream: ?*FILE) c_int {
    _ = stream;
    return 0;
}

export fn fread(ptr: ?*anyopaque, size: usize, nmemb: usize, stream: ?*FILE) usize {
    _ = ptr;
    _ = size;
    _ = nmemb;
    _ = stream;
    return 0;
}

export fn fwrite(ptr: ?*const anyopaque, size: usize, nmemb: usize, stream: ?*FILE) usize {
    _ = ptr;
    _ = size;
    if (stream == stdout or stream == stderr) {
        // For stdout/stderr, just pretend we wrote it
        return nmemb;
    }
    return 0;
}

export fn fgets(s: [*]u8, n: c_int, stream: ?*FILE) ?[*]u8 {
    _ = s;
    _ = n;
    _ = stream;
    return null;
}

export fn fprintf(stream: ?*FILE, format: [*:0]const u8, ...) c_int {
    _ = stream;
    _ = format;
    return 0;
}

export fn fflush(stream: ?*FILE) c_int {
    _ = stream;
    return 0;
}

export fn getc(stream: ?*FILE) c_int {
    _ = stream;
    return -1; // EOF
}

export fn ungetc(c: c_int, stream: ?*FILE) c_int {
    _ = c;
    _ = stream;
    return -1; // EOF
}

export fn feof(stream: ?*FILE) c_int {
    _ = stream;
    return 1; // Always at EOF
}

export fn ferror(stream: ?*FILE) c_int {
    _ = stream;
    return 0;
}

export fn clearerr(stream: ?*FILE) void {
    _ = stream;
}

export fn fseek(stream: ?*FILE, offset: c_long, whence: c_int) c_int {
    _ = stream;
    _ = offset;
    _ = whence;
    return -1;
}

export fn ftell(stream: ?*FILE) c_long {
    _ = stream;
    return -1;
}

export fn setvbuf(stream: ?*FILE, buf: ?[*]u8, mode: c_int, size: usize) c_int {
    _ = stream;
    _ = buf;
    _ = mode;
    _ = size;
    return 0;
}

export fn tmpfile() ?*FILE {
    errno = 2; // ENOENT
    return null;
}

export fn freopen(filename: [*:0]const u8, mode: [*:0]const u8, stream: ?*FILE) ?*FILE {
    _ = filename;
    _ = mode;
    _ = stream;
    errno = 2; // ENOENT
    return null;
}

// Math functions
export fn pow(x: f64, y: f64) f64 {
    return std.math.pow(f64, x, y);
}

export fn ldexp(x: f64, exp: c_int) f64 {
    return std.math.ldexp(x, exp);
}

export fn frexp(x: f64, exp: *c_int) f64 {
    const result = std.math.frexp(x);
    exp.* = result.exponent;
    return result.significand;
}

export fn acos(x: f64) f64 {
    return std.math.acos(x);
}

export fn asin(x: f64) f64 {
    return std.math.asin(x);
}

export fn atan2(y: f64, x: f64) f64 {
    return std.math.atan2(y, x);
}

// String formatting
export fn snprintf(buf: [*]u8, size: usize, format: [*:0]const u8, ...) c_int {
    if (size == 0) return 0;

    var args = @cVaStart();
    defer @cVaEnd(&args);

    const fmt_len = strlen(format);
    var out_idx: usize = 0;
    var fmt_idx: usize = 0;

    while (fmt_idx < fmt_len and out_idx < size - 1) : (fmt_idx += 1) {
        if (format[fmt_idx] == '%') {
            fmt_idx += 1;
            if (fmt_idx >= fmt_len) break;

            // Handle format specifiers
            if (format[fmt_idx] == '%') {
                // Literal %
                buf[out_idx] = '%';
                out_idx += 1;
            } else if (format[fmt_idx] == 'd') {
                // Integer (int)
                const val = @cVaArg(&args, c_int);
                const result = std.fmt.bufPrint(buf[out_idx .. size - 1], "{d}", .{val}) catch {
                    buf[out_idx] = '0';
                    out_idx += 1;
                    continue;
                };
                out_idx += result.len;
            } else if (format[fmt_idx] == 'l') {
                // Check for ll (long long)
                if (fmt_idx + 1 < fmt_len and format[fmt_idx + 1] == 'l') {
                    fmt_idx += 1;
                    if (fmt_idx + 1 < fmt_len and format[fmt_idx + 1] == 'd') {
                        fmt_idx += 1;
                        // long long integer
                        const val = @cVaArg(&args, c_longlong);
                        const result = std.fmt.bufPrint(buf[out_idx .. size - 1], "{d}", .{val}) catch {
                            buf[out_idx] = '0';
                            out_idx += 1;
                            continue;
                        };
                        out_idx += result.len;
                    }
                } else if (fmt_idx + 1 < fmt_len and format[fmt_idx + 1] == 'd') {
                    fmt_idx += 1;
                    // long integer
                    const val = @cVaArg(&args, c_long);
                    const result = std.fmt.bufPrint(buf[out_idx .. size - 1], "{d}", .{val}) catch {
                        buf[out_idx] = '0';
                        out_idx += 1;
                        continue;
                    };
                    out_idx += result.len;
                } else if (fmt_idx + 1 < fmt_len and format[fmt_idx + 1] == 'f') {
                    fmt_idx += 1;
                    // double
                    const val = @cVaArg(&args, f64);
                    const result = std.fmt.bufPrint(buf[out_idx .. size - 1], "{d}", .{val}) catch {
                        buf[out_idx] = '0';
                        out_idx += 1;
                        continue;
                    };
                    out_idx += result.len;
                }
            } else if (format[fmt_idx] == 'f') {
                // Float
                const val = @cVaArg(&args, f64);
                const result = std.fmt.bufPrint(buf[out_idx .. size - 1], "{d}", .{val}) catch {
                    buf[out_idx] = '0';
                    out_idx += 1;
                    continue;
                };
                out_idx += result.len;
            } else if (format[fmt_idx] == 's') {
                // String
                const str = @cVaArg(&args, [*:0]const u8);
                const str_len = strlen(str);
                const copy_len = @min(str_len, size - 1 - out_idx);
                @memcpy(buf[out_idx .. out_idx + copy_len], str[0..copy_len]);
                out_idx += copy_len;
            } else if (format[fmt_idx] == 'c') {
                // Character
                const ch = @cVaArg(&args, c_int);
                buf[out_idx] = @intCast(ch & 0xFF);
                out_idx += 1;
            } else {
                // Unknown format, just copy the % and character
                buf[out_idx] = '%';
                out_idx += 1;
                if (out_idx < size - 1) {
                    buf[out_idx] = format[fmt_idx];
                    out_idx += 1;
                }
            }
        } else {
            buf[out_idx] = format[fmt_idx];
            out_idx += 1;
        }
    }

    buf[out_idx] = 0;
    return @as(c_int, @intCast(out_idx));
}

// Character class functions
export fn isgraph(c: c_int) c_int {
    const ch = @as(u8, @intCast(c & 0xFF));
    return if (ch > 32 and ch < 127) 1 else 0;
}

export fn ispunct(c: c_int) c_int {
    const ch = @as(u8, @intCast(c & 0xFF));
    return if ((ch >= 33 and ch <= 47) or (ch >= 58 and ch <= 64) or
        (ch >= 91 and ch <= 96) or (ch >= 123 and ch <= 126)) 1 else 0;
}

// Locale
const lconv_data = struct {
    decimal_point: [*:0]const u8,
};

var locale_data = lconv_data{
    .decimal_point = ".",
};

export fn localeconv() *lconv_data {
    return &locale_data;
}

// Time functions
const tm = extern struct {
    tm_sec: c_int,
    tm_min: c_int,
    tm_hour: c_int,
    tm_mday: c_int,
    tm_mon: c_int,
    tm_year: c_int,
    tm_wday: c_int,
    tm_yday: c_int,
    tm_isdst: c_int,
};

var static_tm: tm = undefined;

export fn gmtime(timep: *const c_long) *tm {
    _ = timep;
    // Return a static tm struct with zeros
    static_tm = std.mem.zeroes(tm);
    return &static_tm;
}

export fn localtime(timep: *const c_long) *tm {
    return gmtime(timep);
}

export fn mktime(timeptr: *tm) c_long {
    _ = timeptr;
    return 0;
}

export fn difftime(time1: c_long, time0: c_long) f64 {
    return @as(f64, @floatFromInt(time1 - time0));
}

export fn strftime(s: [*]u8, max: usize, format: [*:0]const u8, timeptr: *const tm) usize {
    _ = timeptr;
    // Just copy format string
    const fmt_len = strlen(format);
    const copy_len = @min(fmt_len, max - 1);
    @memcpy(s[0..copy_len], format[0..copy_len]);
    s[copy_len] = 0;
    return copy_len;
}

// System functions
export fn system(command: [*:0]const u8) c_int {
    _ = command;
    errno = 38; // ENOSYS
    return -1;
}

export fn exit(status: c_int) noreturn {
    _ = status;
    unreachable;
}

export fn remove(filename: [*:0]const u8) c_int {
    _ = filename;
    errno = 38; // ENOSYS
    return -1;
}

export fn rename(old: [*:0]const u8, new: [*:0]const u8) c_int {
    _ = old;
    _ = new;
    errno = 38; // ENOSYS
    return -1;
}

export fn abort() noreturn {
    unreachable;
}

export fn getenv(name: [*:0]const u8) ?[*:0]const u8 {
    _ = name;
    return null;
}

export fn setlocale(category: c_int, locale: ?[*:0]const u8) ?[*:0]const u8 {
    _ = category;
    _ = locale;
    return "C";
}

export fn abs(x: c_int) c_int {
    return if (x < 0) -x else x;
}

export fn labs(x: c_long) c_long {
    return if (x < 0) -x else x;
}

export fn llabs(x: c_longlong) c_longlong {
    return if (x < 0) -x else x;
}

pub fn qsort(base: *anyopaque, nmemb: usize, size: usize, compar: *const fn (*const anyopaque, *const anyopaque) c_int) void {
    if (nmemb <= 1 or size == 0) return;

    const base_ptr = @as([*]u8, @ptrCast(base));
    quicksort_impl(base_ptr, 0, @as(i32, @intCast(nmemb - 1)), size, compar);
}

fn quicksort_impl(
    base_ptr: [*]u8,
    low: i32,
    high: i32,
    size: usize,
    compar: *const fn (*const anyopaque, *const anyopaque) c_int,
) void {
    if (low >= high) return;

    const pivot_idx = partition_impl(base_ptr, low, high, size, compar);

    if (pivot_idx > 0) {
        quicksort_impl(base_ptr, low, pivot_idx - 1, size, compar);
    }
    quicksort_impl(base_ptr, pivot_idx + 1, high, size, compar);
}

fn partition_impl(
    base_ptr: [*]u8,
    low: i32,
    high: i32,
    size: usize,
    compar: *const fn (*const anyopaque, *const anyopaque) c_int,
) i32 {
    const pivot_offset: usize = @intCast(high * @as(i32, @intCast(size)));
    var i = low - 1;
    var j = low;

    while (j < high) {
        const j_offset: usize = @intCast(j * @as(i32, @intCast(size)));
        const cmp_result = compar(&base_ptr[j_offset], &base_ptr[pivot_offset]);

        if (cmp_result < 0) {
            i += 1;
            const i_offset: usize = @intCast(i * @as(i32, @intCast(size)));
            swap_elements(base_ptr, i_offset, j_offset, size);
        }
        j += 1;
    }

    swap_elements(base_ptr, @intCast((i + 1) * @as(i32, @intCast(size))), pivot_offset, size);
    return i + 1;
}

fn swap_elements(base_ptr: [*]u8, idx1: usize, idx2: usize, size: usize) void {
    var i: usize = 0;
    while (i < size) {
        const tmp = base_ptr[idx1 + i];
        base_ptr[idx1 + i] = base_ptr[idx2 + i];
        base_ptr[idx2 + i] = tmp;
        i += 1;
    }
}

export fn bsearch(key: *const anyopaque, base: *const anyopaque, nmemb: usize, size: usize, compar: *const anyopaque) ?*anyopaque {
    if (nmemb == 0 or size == 0) return null;

    const base_ptr = @as([*]const u8, @ptrCast(base));
    var left: i32 = 0;
    var right: i32 = @as(i32, @intCast(nmemb - 1));

    while (left <= right) {
        const mid: i32 = left + @divTrunc(right - left, 2);
        const mid_offset: usize = @intCast(mid * @as(i32, @intCast(size)));

        const cmp_func = @as(*const fn (*const anyopaque, *const anyopaque) c_int, @ptrCast(@alignCast(compar)));
        const cmp_result = cmp_func(key, &base_ptr[mid_offset]);

        if (cmp_result == 0) {
            return @constCast(&base_ptr[mid_offset]);
        } else if (cmp_result < 0) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    return null;
}

var rand_seed: u32 = 1;

export fn rand() c_int {
    rand_seed = rand_seed *% 1103515245 +% 12345;
    return @as(c_int, @intCast((rand_seed / 65536) % 32768));
}

export fn srand(seed_val: c_uint) void {
    rand_seed = seed_val;
}

pub export fn strerror(errnum: c_int) [*:0]const u8 {
    return switch (errnum) {
        0 => "No error",
        1 => "Operation not permitted",
        2 => "No such file or directory",
        3 => "No such process",
        4 => "Interrupted system call",
        5 => "Input/output error",
        6 => "No such device or address",
        7 => "Argument list too long",
        8 => "Exec format error",
        9 => "Bad file descriptor",
        10 => "No child processes",
        11 => "Resource temporarily unavailable",
        12 => "Cannot allocate memory",
        13 => "Permission denied",
        14 => "Bad address",
        21 => "Is a directory",
        22 => "Invalid argument",
        23 => "File table overflow",
        24 => "Too many open files",
        25 => "Not a typewriter",
        26 => "Text file busy",
        27 => "File too large",
        28 => "No space left on device",
        29 => "Illegal seek",
        30 => "Read-only file system",
        31 => "Too many links",
        32 => "Broken pipe",
        33 => "Numerical argument out of domain",
        34 => "Numerical result out of range",
        35 => "Resource deadlock would occur",
        36 => "File name too long",
        37 => "No locks available",
        38 => "Function not implemented",
        39 => "Directory not empty",
        40 => "Too many levels of symbolic links",
        42 => "No message of desired type",
        43 => "Identifier removed",
        44 => "Channel number out of range",
        45 => "Level 2 not synchronized",
        46 => "Level 3 halted",
        47 => "Level 3 reset",
        48 => "Link number out of range",
        49 => "Protocol driver error",
        50 => "No CSI structure available",
        51 => "Level 2 halted",
        52 => "Invalid exchange",
        53 => "Invalid request descriptor",
        54 => "Exchange full",
        55 => "No anode",
        56 => "Invalid request code",
        57 => "Invalid slot",
        59 => "Bad font file format",
        60 => "Device not a stream",
        61 => "No data available",
        62 => "Timer expired",
        63 => "Out of streams resources",
        64 => "Machine is not on the network",
        65 => "Package not installed",
        66 => "Object is remote",
        67 => "Link has been severed",
        68 => "Advertise error",
        69 => "Srmount error",
        70 => "Communication error on send",
        71 => "Protocol error",
        72 => "Multihop attempted",
        73 => "RFS specific error",
        74 => "Bad message",
        75 => "Value too large for defined data type",
        76 => "File name too long",
        77 => "Remote address changed",
        78 => "Remote machine is down",
        79 => "Remote I/O error",
        80 => "Cannot send after transport endpoint shutdown",
        81 => "Too many references: cannot splice",
        82 => "Connection timed out",
        83 => "Connection refused",
        84 => "Host is down",
        85 => "No route to host",
        86 => "Operation already in progress",
        87 => "Operation now in progress",
        88 => "Stale NFS file handle",
        89 => "Structure needs cleaning",
        90 => "Not a XENIX named type file",
        91 => "No XENIX semaphores available",
        92 => "Is a named type file",
        93 => "Remote I/O error",
        94 => "Quota exceeded",
        95 => "No medium found",
        96 => "Wrong medium type",
        97 => "Operation canceled",
        98 => "Required key not available",
        99 => "Key has expired",
        100 => "Key has been revoked",
        101 => "Key was rejected by service",
        else => "Unknown error",
    };
}

export fn errno_addr() *c_int {
    return &errno_value;
}

export fn setjmp(env: *anyopaque) c_int {
    _ = env;
    return 0;
}

export fn longjmp(env: *anyopaque, val: c_int) noreturn {
    _ = env;
    _ = val;
    unreachable;
}

pub fn malloc_stats() usize {
    return malloc_ptr;
}

pub fn malloc_remaining() usize {
    return MALLOC_POOL_SIZE -| malloc_ptr;
}
