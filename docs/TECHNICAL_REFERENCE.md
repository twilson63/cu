# Technical Reference

**Quick Developer Reference for Lua WASM Implementation**  
**Date**: October 23, 2025  
**Audience**: Developers modifying the codebase

---

## Important: The `_home` Table Concept

The `_home` table is the primary persistent external table automatically created and attached at `_G._home`. Think of it as your application's "home base" for storing persistent data.

**Key Characteristics:**
- Automatically created on initialization
- Accessible as `_G._home` in Lua
- Persists across `eval()` calls
- Backed by external storage (JavaScript)
- Alias: `_G.Memory` (deprecated, but supported for backward compatibility)

**Usage Example:**
```lua
-- Store persistent data
_home.user_count = (_home.user_count or 0) + 1
_home.last_login = os.time()

-- Access in later eval() calls
print("Total users: " .. _home.user_count)
```

**Rationale for Naming:**
The name `_home` better conveys the concept of a persistent "home location" for your data, rather than the ambiguous term "Memory" which could be confused with WASM memory statistics.

---

## Project Structure

```
wasm-compute/
├── src/
│   ├── main.zig              # Core module (155 lines)
│   ├── lua.zig               # Lua API bindings (120 lines)
│   ├── ext_table.zig         # External table bridge (90 lines)
│   ├── serializer.zig        # Value encoding/decoding (110 lines)
│   ├── output.zig            # Output capture (60 lines)
│   ├── error.zig             # Error handling (75 lines)
│   ├── result.zig            # Result encoding (50 lines)
│   ├── libc-stubs.zig        # 49 libc functions (600 lines)
│   ├── lua/                  # Lua 5.4 C source (33 files, ~50K lines)
│   │   ├── lapi.c/h          # Lua C API
│   │   ├── lvm.c/h           # Virtual machine
│   │   ├── lgc.c/h           # Garbage collector
│   │   └── ... (30 more files)
│   └── *.h                   # C header stubs
├── web/
│   ├── lua.wasm              # Compiled binary (1.3 MB)
│   └── *.js                  # JavaScript integration
├── build.sh                  # Build script
├── .build/                   # Object files (generated)
└── .zig-cache/               # Zig compiler cache
```

---

## File Organization and Purposes

### Zig Source Files

| File | Lines | Purpose |
|------|-------|---------|
| **main.zig** | 155 | Core module, exports, global state |
| **lua.zig** | 120 | Lua C API Zig wrappers |
| **ext_table.zig** | 90 | JavaScript bridge for external tables |
| **serializer.zig** | 110 | Type-tagged binary encoding |
| **output.zig** | 60 | Print output capture system |
| **error.zig** | 75 | Error state management |
| **result.zig** | 50 | Result encoding for return values |
| **libc-stubs.zig** | 600 | 49 C standard library functions |

### Header Files (C Interop)

| File | Purpose |
|------|---------|
| **assert.h** | Assert macro |
| **ctype.h** | Character classification |
| **errno.h** | Error codes |
| **float.h** | Float constants (DBL_MAX, etc.) |
| **limits.h** | Integer constants (INT_MAX, etc.) |
| **math.h** | Math function declarations |
| **setjmp.h** | setjmp/longjmp declarations |
| **signal.h** | Signal handling (stubs) |
| **stdarg.h** | Variable argument lists |
| **stddef.h** | NULL, offsetof, etc. |
| **stdint.h** | Fixed-width integer types |
| **stdio.h** | I/O function declarations |
| **stdlib.h** | General utilities |
| **string.h** | String function declarations |
| **time.h** | Time functions |
| **unistd.h** | POSIX compatibility |

---

## Key Source Files In Detail

### main.zig (155 lines)

**Global State** (lines 12-16):
```zig
var io_buffer: [IO_BUFFER_SIZE]u8 align(16) = undefined;
var heap: [TOTAL_MEMORY]u8 align(4096) = undefined;
var global_lua_state: ?*lua.lua_State = null;
var lua_memory_used: usize = 0;
```

**External Imports** (lines 17-21):
```zig
extern fn js_ext_table_set(...) c_int;
extern fn js_ext_table_get(...) c_int;
extern fn js_ext_table_delete(...) c_int;
extern fn js_ext_table_size(...) usize;
extern fn js_ext_table_keys(...) c_int;
```

**Core Exports** (lines 23-160):
- `export fn init() i32` - Initialize Lua
- `export fn compute(code_ptr: usize, code_len: usize) i32` - Execute code
- `export fn get_buffer_ptr() [*]u8` - Get I/O buffer
- `export fn get_buffer_size() usize` - Buffer size
- `export fn get_memory_stats(*MemoryStats) void` - Memory info
- `export fn run_gc() void` - Run garbage collection

### lua.zig (120 lines)

**Lua State Management**:
```zig
pub fn newstate() ?*lua.lua_State { ... }
pub fn openlibs(L: *lua.lua_State) void { ... }
pub fn close(L: *lua.lua_State) void { ... }
```

**Lua Execution**:
```zig
pub fn dostring(L: *lua.lua_State, str: [*:0]const u8) c_int { ... }
pub fn tonumber(L: *lua.lua_State, idx: c_int) f64 { ... }
pub fn tostring(L: *lua.lua_State, idx: c_int) [*:0]const u8 { ... }
```

**Stack Operations**:
```zig
pub fn pushcfunction(L: *lua.lua_State, f: lua.c.lua_CFunction) void { ... }
pub fn setglobal(L: *lua.lua_State, name: [*:0]const u8) void { ... }
```

### ext_table.zig (90 lines)

**Initialization**:
```zig
pub fn init_ext_table(buf: [*]u8, size: usize) void { ... }
```

**Table Operations**:
```zig
pub fn set(table_id: u32, key: [*:0]const u8, value: [*:0]const u8) i32 { ... }
pub fn get(table_id: u32, key: [*:0]const u8) ?[*:0]u8 { ... }
pub fn delete(table_id: u32, key: [*:0]const u8) i32 { ... }
```

**Lua Integration**:
```zig
pub fn setup_ext_table_library(L: *lua.lua_State) void { ... }
```

### serializer.zig (110 lines)

**Format** (Type-tagged binary):
```
0 = nil
1 = bool
2 = int
3 = float
4 = string
```

**Functions**:
```zig
pub fn encode_value(buf: [*]u8, value: Value) usize { ... }
pub fn decode_value(buf: [*]const u8) Value { ... }
```

### libc-stubs.zig (600 lines)

**Memory Functions** (lines 1-120):
```zig
pub fn malloc(size: usize) ?[*]u8 { ... }
pub fn free(ptr: ?[*]u8) void { ... }
pub fn calloc(count: usize, size: usize) ?[*]u8 { ... }
pub fn realloc(ptr: ?[*]u8, size: usize) ?[*]u8 { ... }
pub fn memcpy(dest: [*]u8, src: [*]const u8, size: usize) [*]u8 { ... }
pub fn memset(ptr: [*]u8, value: c_int, size: usize) [*]u8 { ... }
pub fn memmove(dest: [*]u8, src: [*]const u8, size: usize) [*]u8 { ... }
pub fn memchr(ptr: [*]const u8, value: c_int, size: usize) ?[*]u8 { ... }
```

**String Functions** (lines 121-280):
```zig
pub fn strlen(str: [*:0]const u8) usize { ... }
pub fn strcmp(s1: [*:0]const u8, s2: [*:0]const u8) c_int { ... }
pub fn strcpy(dest: [*]u8, src: [*:0]const u8) [*]u8 { ... }
// ... and 9 more string functions
```

**I/O Functions** (lines 281-380):
```zig
pub fn printf(format: [*:0]const u8, ...) c_int { ... }
pub fn sprintf(buf: [*]u8, format: [*:0]const u8, ...) c_int { ... }
pub fn snprintf(buf: [*]u8, size: usize, format: [*:0]const u8, ...) c_int { ... }
// ... and 7 more I/O functions
```

**Stdlib Functions** (lines 381-480):
```zig
pub fn abs(x: c_int) c_int { ... }
pub fn atoi(str: [*:0]const u8) c_int { ... }
pub fn strtol(str: [*:0]const u8, endptr: ?[*]?[*]u8, base: c_int) c_long { ... }
// ... and 7 more stdlib functions
```

**Math Functions** (lines 481-550):
```zig
pub fn sin(x: f64) f64 { ... }
pub fn cos(x: f64) f64 { ... }
pub fn sqrt(x: f64) f64 { ... }
// ... and 12 more math functions
```

---

## Function Signatures and Exports

### Exported Functions (from Zig to JavaScript)

```zig
// Initialize Lua state
export fn init() i32
// Returns: 0 on success, -1 on error

// Execute Lua code
export fn compute(code_ptr: usize, code_len: usize) i32
// Params: code_ptr = pointer to code in buffer, code_len = length
// Returns: 0 on success, error code on failure

// Get I/O buffer pointer
export fn get_buffer_ptr() [*]u8
// Returns: Pointer to 64 KB I/O buffer

// Get I/O buffer size
export fn get_buffer_size() usize
// Returns: 65536 (64 KB)

// Get memory statistics
export fn get_memory_stats(stats: *MemoryStats) void
// Params: Pointer to MemoryStats struct
// Populates struct with: heap_used, heap_total, lua_objects_count

// Trigger garbage collection
export fn run_gc() void
// Returns: None (no-op in current version)
```

### Imported Functions (from JavaScript to Zig)

```zig
// Store value in JavaScript Map
extern fn js_ext_table_set(
  table_id: u32,
  key_ptr: [*]const u8,
  key_len: usize,
  val_ptr: [*]const u8,
  val_len: usize
) c_int
// Returns: 0 on success, error code on failure

// Retrieve value from JavaScript Map
extern fn js_ext_table_get(
  table_id: u32,
  key_ptr: [*]const u8,
  key_len: usize,
  val_ptr: [*]u8,
  max_len: usize
) c_int
// Returns: actual value length, or error code

// Delete key from JavaScript Map
extern fn js_ext_table_delete(
  table_id: u32,
  key_ptr: [*]const u8,
  key_len: usize
) c_int
// Returns: 0 on success, error code on failure

// Get size of JavaScript Map
extern fn js_ext_table_size(table_id: u32) usize
// Returns: Number of entries in table

// Get all keys from JavaScript Map
extern fn js_ext_table_keys(
  table_id: u32,
  buf_ptr: [*]u8,
  max_len: usize
) c_int
// Returns: Actual keys length, or error code
```

---

## Memory Layout and Allocation

### Linear Memory Structure

```
WASM Linear Memory (2 MB total)
├─ Code Section (embedded)
├─ Data Segment
│  ├─ Global Variables
│  ├─ Stack (grows down from top)
│  └─ Heap (grows up from start)
└─ Reserved
```

### Static Allocations

```zig
// Global I/O buffer (64 KB)
var io_buffer: [64 * 1024]u8 align(16) = undefined;
// Located at: start of memory
// Used for: Zig↔JavaScript string communication

// Global Heap (512 KB)
var heap: [512 * 1024]u8 align(4096) = undefined;
// Located at: after I/O buffer
// Used for: Lua memory allocations

// Total Memory (2 MB)
var total_memory: [2 * 1024 * 1024]u8 align(4096) = undefined;
// Reserved space
// Actual usage: ~600 KB (io_buffer + heap)
```

### Malloc Implementation

```zig
pub fn malloc(size: usize) ?[*]u8 {
  // Simple bump allocator within heap
  const ptr = heap_pointer;
  heap_pointer += size;
  
  if (heap_pointer > heap.len) {
    // Out of memory
    return null;
  }
  
  return &heap[heap_pointer - size];
}
```

**Memory Pool**:
- Total: 512 KB
- Used by: Lua VM + Lua state + user scripts
- Strategy: Bump allocator (simple, fast, no fragmentation)
- Limitation: No free() at allocator level (Lua handles it)

---

## Constants and Configuration

### Buffer Sizes

```zig
const IO_BUFFER_SIZE = 64 * 1024;      // 65,536 bytes
const HEAP_SIZE = 512 * 1024;          // 524,288 bytes
const TOTAL_MEMORY = 2 * 1024 * 1024;  // 2,097,152 bytes
```

### Error Codes

```zig
const SUCCESS = 0;
const ERROR_NULL_STATE = -1;
const ERROR_INVALID_SIZE = -2;
const ERROR_COMPILE_FAILED = -3;
const ERROR_RUNTIME_FAILED = -4;
const ERROR_BUFFER_OVERFLOW = -5;
```

### Lua Configuration

```zig
// Lua Stack Size
const LUA_STACK_SIZE = 256;

// Maximum locals
const LUAI_MAXSTACK = 1000000;

// GC
const LUA_GC_STEPS = 200;
```

---

## Debugging Tips and Tools

### Zig Debugging

```bash
# Build with debug symbols
zig build-exe -O Debug src/main.zig ...

# Check generated assembly
zig build-obj -O Debug src/main.zig

# Verbose output
zig build-exe -O Debug src/main.zig -v 2>&1 | head -50
```

### WASM Debugging

```bash
# Install WABT tools
npm install -g wabt

# Dump WASM structure
wasm-dump web/lua.wasm | head -100

# Convert to text format
wasm-as web/lua.wasm -o web/lua.wast

# View in readable form
less web/lua.wast
```

### JavaScript Debugging

```javascript
// Enable detailed logging
const instance = new WebAssembly.Instance(module, imports);

// Log function calls
const origCompute = instance.exports.compute;
instance.exports.compute = function(ptr, len) {
  console.log(`compute(${ptr}, ${len}) called`);
  const result = origCompute.call(this, ptr, len);
  console.log(`  returned: ${result}`);
  return result;
};

// Inspect memory
const memory = new Uint8Array(instance.exports.memory.buffer);
console.log(memory.slice(0, 100));

// Read string from memory
function readString(ptr, len) {
  const bytes = new Uint8Array(instance.exports.memory.buffer, ptr, len);
  return new TextDecoder().decode(bytes);
}
```

### Profiling

```javascript
// Measure execution time
console.time('lua_execution');
instance.exports.compute(ptr, len);
console.timeEnd('lua_execution');

// Profile allocations
const before = instance.exports.get_memory_stats();
instance.exports.compute(ptr, len);
const after = instance.exports.get_memory_stats();

console.log(`Memory used: ${after.heap_used - before.heap_used} bytes`);
```

---

## Common Operations

### Initialize Module

```javascript
const buffer = await fetch('lua.wasm').then(r => r.arrayBuffer());
const imports = { env: { /* 5 functions */ } };
const module = await WebAssembly.instantiate(buffer, imports);
const instance = module.instance;

// Initialize Lua
const status = instance.exports.init();
if (status !== 0) throw new Error('Init failed');
```

### Execute Lua Code

```javascript
const code = "print('Hello')";
const ptr = instance.exports.get_buffer_ptr();
const size = instance.exports.get_buffer_size();

// Copy code to buffer
const view = new Uint8Array(instance.exports.memory.buffer, ptr, size);
new TextEncoder().encodeInto(code, view);

// Execute
const result = instance.exports.compute(ptr, code.length);

// Read output
const output = new TextDecoder().decode(view.slice(0, size));
console.log(output);
```

### Access External Table

```javascript
// From JavaScript side
const tableId = 1;
const key = "user_data";
const value = JSON.stringify({ name: "Alice", age: 30 });

// Store via WASM
instance.exports.js_ext_table_set(tableId, key, value);

// Retrieve via WASM
const result = instance.exports.js_ext_table_get(tableId, key);

// From Lua side
ext_table.set(1, "user_data", value)
local val = ext_table.get(1, "user_data")
```

---

## Build System Details

### build.sh Phases

**Phase 0**: Verify Zig installation  
**Phase 1**: Create directories  
**Phase 2**: Verify source files  
**Phase 3**: Compile 33 Lua C files  
**Phase 4**: Link and compile Zig + WASM  
**Phase 5**: Verify output  

### Compilation Commands

```bash
# Compile single C file
zig cc -target wasm32-wasi -I src/lua -c -O ReleaseFast src/lua/lapi.c -o .build/lapi.o

# Compile Zig + link all .o files
zig build-exe -target wasm32-wasi -O ReleaseFast \
    -I src/lua -lc \
    -D_WASI_EMULATED_SIGNAL \
    src/main.zig .build/*.o \
    -lwasi-emulated-signal \
    -femit-bin=web/lua.wasm
```

### Customization Points

**Change optimization**:
```bash
-O Debug      # Development
-O ReleaseSafe # Safe
-O ReleaseFast # Default
-O ReleaseSmall # Small binary
```

**Add include paths**:
```bash
-I /path/to/headers
```

**Link additional libraries**:
```bash
-l mylib
```

---

## Common Modifications

### Add Libc Function

1. Edit `src/libc-stubs.zig`
2. Add implementation
3. Add to header file
4. Rebuild: `./build.sh`

### Add Lua Module

1. Add C file to `src/lua/`
2. Edit `build.sh` to include in compilation
3. Rebuild: `./build.sh`

### Increase Memory

1. Edit `src/main.zig` constants
2. Change `HEAP_SIZE` or `TOTAL_MEMORY`
3. Rebuild: `./build.sh`

### Change Buffer Size

1. Edit `src/main.zig`
2. Modify `IO_BUFFER_SIZE` constant
3. Update JavaScript code accordingly
4. Rebuild

---

## Performance Optimization Points

### Binary Size
- Remove unused Lua modules
- Use wasm-opt post-processing
- Strip debug symbols
- Compress with gzip

### Startup Time
- Pre-allocate Lua state
- Cache compiled module
- Lazy load features
- Use service workers

### Runtime Performance
- Profile hot paths
- Optimize string operations
- Minimize FFI calls
- Batch operations

---

## Testing Checklist

- [ ] Build succeeds: `./build.sh`
- [ ] Binary valid: `file web/lua.wasm`
- [ ] Module loads: JavaScript instantiation
- [ ] init() succeeds: `exports.init() === 0`
- [ ] Buffers accessible: `get_buffer_ptr()` returns value
- [ ] Lua executes: `compute()` with valid code
- [ ] Output captured: Print output in buffer
- [ ] Memory available: `get_memory_stats()` works
- [ ] No crashes: Multiple executions stable
- [ ] Errors handled: Invalid code returns error code

---

**Document Status**: Complete  
**Last Updated**: October 23, 2025  
**Questions?**: See other documentation files
