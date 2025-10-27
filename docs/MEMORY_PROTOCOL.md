# lua.wasm Memory Protocol & I/O Buffer Specification

**Version:** 2.0.0  
**Target:** wasm32-freestanding  
**Last Updated:** October 26, 2025

This document specifies the complete memory protocol and I/O buffer mechanism used by lua.wasm for communication between JavaScript and the WebAssembly Lua runtime.

---

## Table of Contents

1. [Overview](#overview)
2. [Buffer Configuration](#buffer-configuration)
3. [Memory Layout](#memory-layout)
4. [API Functions](#api-functions)
5. [Data Flow Protocol](#data-flow-protocol)
6. [Encoding Specifications](#encoding-specifications)
7. [Error Protocol](#error-protocol)
8. [Memory Ownership Rules](#memory-ownership-rules)
9. [Thread Safety](#thread-safety)
10. [Implementation Examples](#implementation-examples)

---

## Overview

lua.wasm uses a **single shared I/O buffer** for all communication between JavaScript and WebAssembly. This buffer is statically allocated in WASM linear memory and acts as both:
- **Input channel**: JavaScript writes Lua code to execute
- **Output channel**: WASM writes execution results back

This design eliminates the need for dynamic memory allocation at the API boundary and provides predictable performance characteristics.

### Key Design Principles

- **Zero-copy I/O**: Data is read/written directly from/to WASM linear memory
- **Single buffer reuse**: Same buffer used for input and output (synchronous execution)
- **Bounded memory**: Fixed 64KB buffer prevents unbounded growth
- **Type-safe encoding**: Binary protocol with type tags for Lua values
- **Error signaling**: Negative return values indicate errors

---

## Buffer Configuration

### Constants (src/main.zig:9-10)

```zig
const IO_BUFFER_SIZE = 64 * 1024;  // 65,536 bytes
const TOTAL_MEMORY = 2 * 1024 * 1024;  // 2 MB total WASM memory
```

### Buffer Allocation (src/main.zig:16)

```zig
var io_buffer: [IO_BUFFER_SIZE]u8 align(16) = undefined;
```

- **Size**: 64 KB (65,536 bytes)
- **Alignment**: 16-byte boundary for SIMD operations
- **Lifetime**: Static (entire WASM instance lifetime)
- **Scope**: Module-private, accessed via exported functions

### Output Buffer Reserve (src/output.zig:5)

```zig
const OUTPUT_BUFFER_MAX = IO_BUFFER_SIZE - 1024;  // 63,488 bytes
```

The output capture system reserves 1KB for metadata and overflow handling, leaving 63,488 bytes for captured print statements.

---

## Memory Layout

### WASM Linear Memory Structure

```
┌─────────────────────────────────────────────────────────────┐
│  WASM Linear Memory (2 MB)                                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Static Data Segment                                         │
│  ├─ Zig compiled code data                                  │
│  ├─ Lua runtime globals                                     │
│  └─ io_buffer[64KB] ◄── I/O Buffer (16-byte aligned)       │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Heap (managed by lua_malloc/lua_realloc/lua_free)         │
│  └─ Lua VM state, strings, tables, etc.                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### I/O Buffer Layout During compute()

#### Phase 1: Input (JavaScript → WASM)

```
Offset    Size      Content
──────────────────────────────────────────────
0         N bytes   Lua source code (UTF-8)
N         ...       Unused (garbage from previous call)
```

#### Phase 2: Output (WASM → JavaScript)

```
Offset    Size      Content                    Format
─────────────────────────────────────────────────────────────
0         4 bytes   Output length             u32 (little-endian)
4         M bytes   Captured output (print)   UTF-8 text
4+M       ? bytes   Overflow marker "..."     Optional (if truncated)
4+M+?     1 byte    Return value type tag     SerializationType enum
4+M+?+1   K bytes   Return value data         Type-dependent encoding
```

---

## API Functions

### Exported WASM Functions

#### `init() -> i32`
**Location**: src/main.zig:47-71

Initializes the Lua VM and sets up the runtime environment.

**Returns**:
- `0` = Success
- `-1` = Initialization failed (e.g., out of memory)

**Side Effects**:
- Creates Lua state in `global_lua_state`
- Initializes error handling and output capture
- Sets up external table library
- Configures `print()` override and `_home` global

**Memory Impact**: Allocates Lua VM (~100-200 KB depending on configuration)

#### `get_buffer_ptr() -> [*]u8`
**Location**: src/main.zig:111-113

Returns the memory address of the I/O buffer.

**Returns**: Pointer to `io_buffer[0]`

**Usage**: Call once after WASM instantiation and cache the result.

#### `get_buffer_size() -> usize`
**Location**: src/main.zig:115-117

Returns the I/O buffer size in bytes.

**Returns**: `64 * 1024` (65,536)

**Usage**: Use to validate input size before calling `compute()`.

#### `compute(code_ptr: usize, code_len: usize) -> i32`
**Location**: src/main.zig:119-152

Executes Lua code and writes results to the I/O buffer.

**Parameters**:
- `code_ptr`: Pointer to input buffer (should be `get_buffer_ptr()`)
- `code_len`: Length of Lua code in bytes

**Returns**:
- `>= 0`: Success, value is result length in buffer
- `< 0`: Error, absolute value minus 1 is error message length
  - Example: `-43` means 42-byte error message in buffer

**Preconditions**:
- `init()` must have been called successfully
- `code_len <= IO_BUFFER_SIZE`
- Lua code must be valid UTF-8

**Memory Protocol**:
1. Reads input from `io_buffer[0..code_len]`
2. Executes Lua code
3. Writes output to `io_buffer[0..result_len]`
4. Returns `result_len` (or negative error code)

**Side Effects**:
- Modifies entire `io_buffer` contents
- Updates Lua VM state (creates/modifies globals)
- Captures print output
- Clears Lua stack

---

## Data Flow Protocol

### Complete Call Sequence

```
┌─────────────┐                              ┌──────────────┐
│  JavaScript │                              │ WASM Runtime │
└──────┬──────┘                              └──────┬───────┘
       │                                            │
       │ 1. Get buffer address                     │
       ├──────── get_buffer_ptr() ─────────────────►
       ◄────────── returns ptr ────────────────────┤
       │                                            │
       │ 2. Encode Lua code as UTF-8               │
       │    code_bytes = encoder.encode("return 42")│
       │                                            │
       │ 3. Write to WASM memory                   │
       │    memory[ptr..ptr+len] = code_bytes      │
       │    (JavaScript writes to WASM linear mem) │
       │                                            │
       │ 4. Execute code                           │
       ├──────── compute(ptr, len) ────────────────►
       │                                            │ 5. Read input
       │                                            │    from buffer
       │                                            │
       │                                            │ 6. Execute Lua
       │                                            │    lua_dostring()
       │                                            │
       │                                            │ 7. Capture output
       │                                            │    (print calls)
       │                                            │
       │                                            │ 8. Encode result
       │                                            │    to buffer
       ◄─────── returns result_len ────────────────┤
       │                                            │
       │ 9. Check return value                     │
       │    if (result_len < 0) → error            │
       │    if (result_len >= 0) → success         │
       │                                            │
       │ 10. Read result from memory               │
       │     buffer = memory[ptr..ptr+result_len]  │
       │                                            │
       │ 11. Deserialize result                    │
       │     {output, result} = deserialize(buffer)│
       │                                            │
```

### Buffer Reuse Pattern

The buffer is **synchronously reused** for each `compute()` call:

```
Time →
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   Call 1     │   Call 2     │   Call 3     │   Call 4     │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Write input  │ Write input  │ Write input  │ Write input  │
│ Execute      │ Execute      │ Execute      │ Execute      │
│ Read output  │ Read output  │ Read output  │ Read output  │
└──────────────┴──────────────┴──────────────┴──────────────┘
     ▲              ▲              ▲              ▲
     │              │              │              │
     └──────────────┴──────────────┴──────────────┘
              Same buffer memory
```

**Important**: There is no history preserved between calls. Each `compute()` overwrites the entire buffer.

### Multi-Call Buffer State

**Buffer state evolution across consecutive calls**:

```
Call 1: compute("return 1")
┌─────────────────────────────────────┐
│ 00 00 00 00 | 02 | 01 00 00 00 ... │  Buffer content after Call 1
└─────────────────────────────────────┘
  output_len=0  int   value=1

Call 2: compute("return 'hello'")
┌─────────────────────────────────────┐
│ 00 00 00 00 | 04 | 05 00 00 00 ... │  Buffer content after Call 2
└─────────────────────────────────────┘
  output_len=0  str   len=5  "hello"
  
  ⚠️  Previous content (Call 1 result) is GONE

Call 3: compute("invalid lua!")
┌─────────────────────────────────────┐
│ s | y | n | t | a | x |   | e | r... │  Buffer content after Call 3
└─────────────────────────────────────┘
  Error message (no structure)
  
  ⚠️  Previous content (Call 2 result) is GONE
```

---

## Encoding Specifications

### Input Encoding: Lua Source Code

**Format**: UTF-8 text

```javascript
const code = "return 42";
const encoder = new TextEncoder();
const codeBytes = encoder.encode(code);
// codeBytes: Uint8Array of UTF-8 bytes
```

**Constraints**:
- Maximum length: 65,536 bytes (IO_BUFFER_SIZE)
- Must be valid UTF-8
- No null terminator required (length is passed separately)

### Output Encoding: Result Protocol

The output buffer contains multiple sections encoded sequentially:

#### Section 1: Output Length (4 bytes)
**Location**: src/result.zig:19-20

```zig
const output_len_u32: u32 = @intCast(output_len);
const output_len_bytes = std.mem.asBytes(&output_len_u32);
@memcpy(buffer[0..4], output_len_bytes);
```

**Format**: 32-bit unsigned integer, little-endian

**JavaScript Decoding**:
```javascript
const outputLen = 
  buffer[0] | 
  (buffer[1] << 8) | 
  (buffer[2] << 16) | 
  (buffer[3] << 24);
```

#### Section 2: Captured Output (M bytes)
**Location**: src/result.zig:24-36

Captured output from `print()` statements during Lua execution.

**Format**: UTF-8 text

**Overflow Handling**: If output exceeds 63,488 bytes, it's truncated and "..." is appended.

#### Section 3: Return Value
**Location**: src/result.zig:39-51

The top value on the Lua stack after execution, serialized using type tags.

### Type Encoding Table

**Location**: src/serializer.zig:7-16

| Type | Tag | Data Format | Total Size |
|------|-----|-------------|------------|
| `nil` | `0x00` | None | 1 byte |
| `boolean` | `0x01` | `0x00` (false) or `0x01` (true) | 2 bytes |
| `integer` | `0x02` | i64, little-endian | 9 bytes |
| `float` | `0x03` | f64 (IEEE 754), little-endian | 9 bytes |
| `string` | `0x04` | u32 length + UTF-8 bytes | 5 + N bytes |
| `function` (bytecode) | `0x05` | u32 length + bytecode | 5 + N bytes |
| `function` (C) | `0x06` | Reference (implementation-specific) | Varies |

#### Type-Specific Encoding Details

##### nil
```
Byte 0: 0x00
```

##### boolean
```
Byte 0: 0x01
Byte 1: 0x00 (false) or 0x01 (true)
```

##### integer
**Location**: src/serializer.zig:44-49
```
Byte 0:    0x02
Bytes 1-8: i64 value (little-endian)
```

**JavaScript Decoding**:
```javascript
const view = new DataView(buffer.buffer, offset + 1, 8);
const value = view.getBigInt64(0, true); // little-endian
```

##### float
**Location**: src/serializer.zig:51-56
```
Byte 0:    0x03
Bytes 1-8: f64 value (IEEE 754 little-endian)
```

**JavaScript Decoding**:
```javascript
const view = new DataView(buffer.buffer, offset + 1, 8);
const value = view.getFloat64(0, true); // little-endian
```

##### string
**Location**: src/serializer.zig:59-76
```
Byte 0:    0x04
Bytes 1-4: u32 string length (little-endian)
Bytes 5+:  UTF-8 string bytes
```

**Example**: String "hello"
```
0x04                    // type tag
0x05 0x00 0x00 0x00     // length = 5 (little-endian u32)
0x68 0x65 0x6C 0x6C 0x6F // "hello" in UTF-8
```

##### table
**Location**: src/result.zig:126-133

Tables cannot be fully serialized. Instead, the string "table" is returned.

```
Bytes: "table" (5 bytes of UTF-8 text)
```

##### function
**Location**: src/result.zig:135-142

Functions cannot be fully serialized in basic mode. The string "function" is returned.

```
Bytes: "function" (8 bytes of UTF-8 text)
```

**Note**: Function persistence is available through the `ext_table` system and function serialization module.

### Detailed Encoding Examples

#### Example 1: Complete Success Response

**Lua Code**: `print("hi"); return 42`

```
Byte     Content                        Hex          Description
─────────────────────────────────────────────────────────────────
0        Output length (LSB)            0x03         Little-endian u32
1        Output length                  0x00         outputLen = 3
2        Output length                  0x00
3        Output length (MSB)            0x00
4        'h'                           0x68         Output text "hi\n"
5        'i'                           0x69
6        '\n'                          0x0A
7        Type tag: integer             0x02         SerializationType.integer
8        Value LSB                     0x2A         i64 = 42 (little-endian)
9        Value byte 2                  0x00
10       Value byte 3                  0x00
11       Value byte 4                  0x00
12       Value byte 5                  0x00
13       Value byte 6                  0x00
14       Value byte 7                  0x00
15       Value MSB                     0x00
─────────────────────────────────────────────────────────────────
Total: 16 bytes (compute returns 16)
```

#### Example 2: Type Encoding Visual Reference

```
NIL:
┌────┐
│ 00 │  1 byte total
└────┘
type

BOOLEAN (true):
┌────┬────┐
│ 01 │ 01 │  2 bytes total
└────┴────┘
type  value

INTEGER (42):
┌────┬────┬────┬────┬────┬────┬────┬────┬────┐
│ 02 │ 2A │ 00 │ 00 │ 00 │ 00 │ 00 │ 00 │ 00 │  9 bytes total
└────┴────┴────┴────┴────┴────┴────┴────┴────┘
type  ←─────────── i64 value (little-endian) ─────────→

FLOAT (3.14):
┌────┬────────────────────────────────────────┐
│ 03 │     1F 85 EB 51 B8 1E 09 40            │  9 bytes total
└────┴────────────────────────────────────────┘
type  ←──── f64 value (IEEE 754, LE) ────────→

STRING ("hello"):
┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐
│ 04 │ 05 │ 00 │ 00 │ 00 │ 68 │ 65 │ 6C │ 6C │ 6F │  10 bytes total
└────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘
type  ←─── u32 len ──→   ←──────── UTF-8 ─────────→
      (5 in LE)         "hello"
```

---

## Error Protocol

### Error Return Values
**Location**: src/main.zig:143-148

When `compute()` encounters an error, it returns a **negative integer**:

```
return_value = -(error_message_length + 1)
```

**Example**:
- Error message: "syntax error near 'end'" (24 characters)
- Return value: `-25`

**Decoding**:
```javascript
const resultLen = wasmInstance.exports.compute(ptr, codeLen);
if (resultLen < 0) {
  const errorLen = (-resultLen) - 1;
  const errorMsg = readBuffer(ptr, errorLen);
  throw new Error(errorMsg);
}
```

### Error Types
**Location**: src/error.zig:8-13

```zig
pub const ErrorCode = enum(c_int) {
    success = 0,
    compilation_error = -1,   // Lua syntax error
    runtime_error = -2,        // Lua runtime error
    serialization_error = -3,  // Cannot serialize result
};
```

### Error Message Format
**Location**: src/error.zig:60-73

Error messages are written as **plain UTF-8 text** (no type tags) to the I/O buffer.

**Buffer Content on Error**:
```
Offset    Size      Content
─────────────────────────────────────
0         N bytes   Error message (UTF-8)
N         ...       Garbage (ignored)
```

**Example**: Syntax error in `return 42)`

```
Byte     Content                        Hex          Description
─────────────────────────────────────────────────────────────────
0        's'                           0x73         Error message (no type tags)
1        'y'                           0x79
2        'n'                           0x6E
3        't'                           0x74
4        'a'                           0x61
5        'x'                           0x78
6        ' '                           0x20
7        'e'                           0x65
8        'r'                           0x72
9        'r'                           0x72
10       'o'                           0x6F
11       'r'                           0x72
...      ... rest of error message ...
─────────────────────────────────────────────────────────────────
Total: N bytes (compute returns -(N+1))
```

### Return Value Decision Tree

```
compute() return value
        │
        ▼
┌───────────────┐
│ resultLen     │
│  (i32)        │
└───────┬───────┘
        │
    ┌───┴───┐
    │       │
    ▼       ▼
negative  zero or positive
    │       │
    │       └──→ SUCCESS
    │            resultLen = bytes in buffer
    │            Read buffer[0..resultLen]
    │            Deserialize result
    │
    └──→ ERROR
         errorLen = (-resultLen) - 1
         Read buffer[0..errorLen]
         Decode as UTF-8 error message

Example Values:
  50  → Success, 50 bytes of result data
   0  → Success, no output (nil result)
  -1  → Error, 0 bytes (special case)
 -25  → Error, 24 bytes of error message
```

### Error Handling Flow

```
┌──────────────────────────────────────────────────┐
│  compute() execution                             │
├──────────────────────────────────────────────────┤
│                                                  │
│  1. Parse Lua code                              │
│     └─ If syntax error → goto ERROR_HANDLER     │
│                                                  │
│  2. Execute Lua code                            │
│     └─ If runtime error → goto ERROR_HANDLER    │
│                                                  │
│  3. Serialize result                            │
│     └─ If cannot serialize → goto ERROR_HANDLER │
│                                                  │
│  4. Return success (positive length)            │
│                                                  │
└──────────────────────────────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  ERROR_HANDLER          │
         ├─────────────────────────┤
         │  1. Capture error from  │
         │     Lua stack           │
         │  2. Format error to     │
         │     io_buffer           │
         │  3. Return negative     │
         │     length              │
         └─────────────────────────┘
```

**Implementation**: src/main.zig:144-148
```zig
if (result != 0) {
    _ = error_handler.capture_lua_error(L, result);
    const error_len = error_handler.format_error_to_buffer(&io_buffer, IO_BUFFER_SIZE);
    return -@as(i32, @intCast(error_len + 1));
}
```

---

## Memory Ownership Rules

### Ownership Model

**WASM Owns**:
- I/O buffer memory (`io_buffer`)
- Lua VM state (`global_lua_state`)
- All Lua objects (strings, tables, functions)
- Output capture buffers

**JavaScript Owns**:
- External table storage (JavaScript `Map` objects)
- Decoded result objects
- WASM instance and memory objects

### Access Rules

#### Rule 1: No Concurrent Access
The I/O buffer is **not thread-safe**. JavaScript must not write to the buffer while `compute()` is executing.

**Violation Example** (UNSAFE):
```javascript
// DON'T DO THIS
compute(ptr, len); // Still executing...
writeBuffer(ptr, "new code"); // RACE CONDITION!
```

#### Rule 2: Buffer Invalidation
All buffer contents are **invalidated** after each `compute()` call.

**Violation Example** (UNSAFE):
```javascript
// DON'T DO THIS
const result1 = compute(ptr, len1);
const buffer1 = memory.slice(ptr, ptr + result1); // Reference to buffer

const result2 = compute(ptr, len2); // buffer1 is now INVALID!
console.log(buffer1); // Undefined behavior - data was overwritten
```

**Safe Pattern**:
```javascript
const result1 = compute(ptr, len1);
const buffer1Copy = new Uint8Array(memory.slice(ptr, ptr + result1)); // Copy!

const result2 = compute(ptr, len2);
// buffer1Copy is still valid
```

#### Memory Ownership Timeline Diagram

```
JavaScript Context                WASM Context
─────────────────────────────────────────────────────────────────
bufferPtr = get_buffer_ptr() ───→ Returns &io_buffer
                                   [WASM owns buffer]

memory[ptr] = codeBytes      ───→ [JavaScript WRITES to WASM memory]
                                   [Buffer contains input]

compute(ptr, len)            ───→ [WASM READS from buffer]
                                   [Execute Lua]
                                   [WASM WRITES result to buffer]
                                   [WASM owns buffer during execution]

[compute returns]            ←─── [WASM finished with buffer]
                                   [Buffer contains output]

buffer = memory.slice(...)   ───→ [JavaScript READS from WASM memory]
                                   [Should copy immediately]

[buffer data is valid now]
                                   
compute(ptr, len2)           ───→ [BUFFER INVALIDATED - new execution]
                                   
[previous buffer data is INVALID] [Old data overwritten]
```

#### Rule 3: Pointer Stability
The buffer pointer returned by `get_buffer_ptr()` is **stable** for the lifetime of the WASM instance.

**Safe Pattern**:
```javascript
// Cache the pointer - it never changes
const bufferPtr = wasmInstance.exports.get_buffer_ptr();

// Use it for all calls
compute(bufferPtr, len1);
compute(bufferPtr, len2);
compute(bufferPtr, len3);
```

#### Rule 4: No Pointer Arithmetic
JavaScript must not modify the buffer pointer. Always use the exact value returned by `get_buffer_ptr()`.

**Violation Example** (UNSAFE):
```javascript
// DON'T DO THIS
const ptr = get_buffer_ptr();
const offsetPtr = ptr + 100; // WRONG!
compute(offsetPtr, len); // Will read from wrong location
```

### Memory Lifecycle

```
WASM Instance Lifecycle:
┌────────────────────────────────────────────────┐
│ instantiate()                                  │
│   └─ Allocate io_buffer (static)              │
│                                                │
│ init()                                         │
│   └─ Create Lua VM                            │
│                                                │
│ compute() ... compute() ... compute()         │
│   └─ Reuse same io_buffer                     │
│                                                │
│ [WASM instance destroyed]                     │
│   └─ All memory freed automatically           │
└────────────────────────────────────────────────┘
```

---

## Thread Safety

### Single-Threaded Design

lua.wasm is designed for **single-threaded JavaScript environments** (main thread or dedicated worker).

**Assumptions**:
- Only one `compute()` call executes at a time
- JavaScript event loop ensures sequential execution
- No WASM threads or shared memory

### Worker Usage

When using Web Workers, each worker should have its **own WASM instance**:

```javascript
// ✅ SAFE: Each worker has its own instance
// main.js
const worker1 = new Worker('worker.js');
const worker2 = new Worker('worker.js');

// worker.js
const wasmInstance = await loadWasm();
// Each worker has independent memory
```

```javascript
// ❌ UNSAFE: Sharing instance across workers
// main.js
const wasmInstance = await loadWasm();
worker1.postMessage({ instance: wasmInstance }); // DON'T DO THIS
worker2.postMessage({ instance: wasmInstance }); // RACE CONDITIONS!
```

### Async Safety

Because `compute()` is synchronous, there are **no async race conditions** within a single JavaScript context:

```javascript
// ✅ SAFE: Sequential execution
async function runLuaCode() {
  const result1 = compute(ptr, len1); // Blocks until complete
  await saveToDatabase(result1);      // Safe - compute() already finished
  
  const result2 = compute(ptr, len2); // Safe - no overlap
  await saveToDatabase(result2);
}
```

---

## Implementation Examples

### Example 1: Basic Execution

```javascript
// 1. Initialize
const wasmInstance = await WebAssembly.instantiateStreaming(
  fetch('lua.wasm'),
  { env: { /* imports */ } }
);

const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
const init = wasmInstance.exports.init;
const compute = wasmInstance.exports.compute;
const getBufferPtr = wasmInstance.exports.get_buffer_ptr;
const getBufferSize = wasmInstance.exports.get_buffer_size;

// 2. Initialize Lua
if (init() !== 0) {
  throw new Error('Lua initialization failed');
}

// 3. Get buffer info (cache these)
const bufferPtr = getBufferPtr();
const bufferSize = getBufferSize();

// 4. Execute Lua code
const code = 'print("Hello, World!"); return 42';
const encoder = new TextEncoder();
const codeBytes = encoder.encode(code);

if (codeBytes.length > bufferSize) {
  throw new Error(`Code too large: ${codeBytes.length} > ${bufferSize}`);
}

// 5. Write input to buffer
memory.set(codeBytes, bufferPtr);

// 6. Execute
const resultLen = compute(bufferPtr, codeBytes.length);

// 7. Handle result
if (resultLen < 0) {
  const errorLen = (-resultLen) - 1;
  const errorMsg = new TextDecoder().decode(
    memory.slice(bufferPtr, bufferPtr + errorLen)
  );
  console.error('Lua error:', errorMsg);
} else {
  const resultBuffer = memory.slice(bufferPtr, bufferPtr + resultLen);
  const { output, result } = deserializeResult(resultBuffer, resultLen);
  console.log('Output:', output);  // "Hello, World!\n"
  console.log('Result:', result);  // 42
}
```

### Example 2: Deserializing Results

```javascript
function deserializeResult(buffer, totalLength) {
  let offset = 0;

  // Read output length (4 bytes, little-endian)
  const outputLen = 
    buffer[0] | 
    (buffer[1] << 8) | 
    (buffer[2] << 16) | 
    (buffer[3] << 24);
  offset += 4;

  // Read captured output
  let output = '';
  if (outputLen > 0) {
    const outputBytes = buffer.slice(offset, offset + outputLen);
    output = new TextDecoder().decode(outputBytes);
    offset += outputLen;
  }

  // Check for overflow marker "..."
  if (offset + 3 <= totalLength &&
      buffer[offset] === 0x2E &&      // '.'
      buffer[offset + 1] === 0x2E &&
      buffer[offset + 2] === 0x2E) {
    output += '...';
    offset += 3;
  }

  // Read return value type
  if (offset >= totalLength) {
    return { output, result: null };
  }

  const type = buffer[offset++];

  let result = null;
  switch (type) {
    case 0x00: // nil
      result = null;
      break;

    case 0x01: // boolean
      result = buffer[offset] !== 0;
      break;

    case 0x02: // integer
      const intView = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
      const bigInt = intView.getBigInt64(0, true); // little-endian
      result = Number(bigInt);
      break;

    case 0x03: // float
      const floatView = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
      result = floatView.getFloat64(0, true); // little-endian
      break;

    case 0x04: // string
      const strLen = 
        buffer[offset] | 
        (buffer[offset + 1] << 8) | 
        (buffer[offset + 2] << 16) | 
        (buffer[offset + 3] << 24);
      offset += 4;
      const strBytes = buffer.slice(offset, offset + strLen);
      result = new TextDecoder().decode(strBytes);
      break;

    default:
      result = `<unknown type ${type}>`;
  }

  return { output, result };
}
```

### Example 3: Error Handling

```javascript
function executeLua(code) {
  const encoder = new TextEncoder();
  const codeBytes = encoder.encode(code);
  
  if (codeBytes.length > bufferSize) {
    throw new Error(`Code exceeds buffer size: ${codeBytes.length} > ${bufferSize}`);
  }

  // Write to buffer
  memory.set(codeBytes, bufferPtr);

  // Execute
  const resultLen = compute(bufferPtr, codeBytes.length);

  // Check for error
  if (resultLen < 0) {
    const errorLen = (-resultLen) - 1;
    const errorBytes = memory.slice(bufferPtr, bufferPtr + errorLen);
    const errorMsg = new TextDecoder().decode(errorBytes);
    
    // Create structured error object
    const error = new Error(errorMsg);
    error.type = 'LuaError';
    error.code = 'LUA_RUNTIME_ERROR';
    throw error;
  }

  // Success - deserialize result
  const resultBuffer = memory.slice(bufferPtr, bufferPtr + resultLen);
  return deserializeResult(resultBuffer, resultLen);
}

// Usage
try {
  const { output, result } = executeLua('return 1 + 1');
  console.log('Success:', result); // 2
} catch (error) {
  if (error.type === 'LuaError') {
    console.error('Lua execution failed:', error.message);
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

### Example 4: Buffer Size Validation

```javascript
function computeSafe(code) {
  const encoder = new TextEncoder();
  const codeBytes = encoder.encode(code);

  // Check if code fits
  if (codeBytes.length > bufferSize) {
    // Option 1: Reject
    throw new Error(`Code too large: ${codeBytes.length} bytes (max ${bufferSize})`);

    // Option 2: Split into chunks (if code is multiple statements)
    // return executeInChunks(code);

    // Option 3: Compress (if applicable)
    // codeBytes = compress(codeBytes);
  }

  memory.set(codeBytes, bufferPtr);
  return compute(bufferPtr, codeBytes.length);
}
```

### Example 5: Safe vs Unsafe Buffer Access Patterns

```javascript
// ✅ SAFE PATTERN 1: Immediate Copy
const len1 = compute(ptr, codeLen1);
const copy1 = new Uint8Array(memory.slice(ptr, ptr+len1)); // COPY

const len2 = compute(ptr, codeLen2);
const copy2 = new Uint8Array(memory.slice(ptr, ptr+len2)); // COPY

// Both copy1 and copy2 are valid ✓


// ✅ SAFE PATTERN 2: Immediate Processing
const len = compute(ptr, codeLen);
const result = deserializeResult(memory.slice(ptr, ptr+len), len);
// result is a JavaScript object, independent of buffer ✓


// ❌ UNSAFE PATTERN 1: Delayed Read
const len1 = compute(ptr, codeLen1);
// Don't read yet...

const len2 = compute(ptr, codeLen2);  // Buffer overwritten!

const result1 = readBuffer(ptr, len1);  // WRONG DATA ✗


// ❌ UNSAFE PATTERN 2: Reference Without Copy
const len1 = compute(ptr, codeLen1);
const ref1 = memory.slice(ptr, ptr+len1);  // Just a view, not a copy!

const len2 = compute(ptr, codeLen2);  // ref1 now points to NEW data ✗

console.log(ref1);  // WRONG DATA ✗
```

### Example 6: Memory-Efficient Result Copying

```javascript
// Copy result immediately to avoid invalidation
function computeAndCapture(code) {
  const encoder = new TextEncoder();
  const codeBytes = encoder.encode(code);
  
  memory.set(codeBytes, bufferPtr);
  const resultLen = compute(bufferPtr, codeBytes.length);

  if (resultLen < 0) {
    const errorLen = (-resultLen) - 1;
    // Create a COPY of the error message
    const errorCopy = new Uint8Array(memory.slice(bufferPtr, bufferPtr + errorLen));
    return { 
      success: false, 
      error: new TextDecoder().decode(errorCopy) 
    };
  }

  // Create a COPY of the result buffer
  const resultCopy = new Uint8Array(memory.slice(bufferPtr, bufferPtr + resultLen));
  
  // Now safe to call compute() again - we have a copy
  return { 
    success: true, 
    buffer: resultCopy,
    length: resultLen 
  };
}

// Usage
const result1 = computeAndCapture('return 42');
const result2 = computeAndCapture('return "hello"'); // result1.buffer still valid!

console.log(deserializeResult(result1.buffer, result1.length)); // { output: "", result: 42 }
console.log(deserializeResult(result2.buffer, result2.length)); // { output: "", result: "hello" }
```

---

## Performance Characteristics

### Buffer Access Performance

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| `get_buffer_ptr()` | O(1) | Returns static pointer |
| `get_buffer_size()` | O(1) | Returns constant |
| Write to buffer (JS → WASM) | O(n) | `n` = code length, memcpy |
| Read from buffer (WASM → JS) | O(m) | `m` = result length, memcpy |
| `compute()` | O(code complexity) | Depends on Lua execution |

### Memory Usage

| Component | Size | Location |
|-----------|------|----------|
| I/O Buffer | 64 KB | Static data segment |
| Output Capture Buffer | ~63 KB | Static data segment |
| Error Buffer | ~64 KB | Static data segment |
| Lua VM State | ~100-200 KB | Heap |
| Total WASM Memory | 2 MB | Linear memory |

### Optimization Tips

1. **Cache buffer pointer**: Call `get_buffer_ptr()` once at initialization
2. **Reuse TextEncoder/TextDecoder**: Create once, reuse for all calls
3. **Avoid unnecessary copies**: Only copy buffer contents if you need to preserve them
4. **Batch operations**: Execute multiple Lua statements in one `compute()` call when possible
5. **Use Uint8Array.set()**: Faster than byte-by-byte copying for large inputs

---

## Debugging and Diagnostics

### Buffer Inspection

```javascript
function inspectBuffer(ptr, len) {
  const buffer = memory.slice(ptr, ptr + len);
  
  console.log('Buffer contents (hex):');
  let hex = '';
  for (let i = 0; i < Math.min(len, 256); i++) {
    hex += buffer[i].toString(16).padStart(2, '0') + ' ';
    if ((i + 1) % 16 === 0) {
      console.log(hex);
      hex = '';
    }
  }
  if (hex) console.log(hex);

  console.log('\nBuffer contents (UTF-8):');
  try {
    const text = new TextDecoder().decode(buffer);
    console.log(text.substring(0, 500));
  } catch (e) {
    console.log('(not valid UTF-8)');
  }
}

// Usage
const resultLen = compute(bufferPtr, codeLen);
inspectBuffer(bufferPtr, Math.abs(resultLen));
```

### Memory Layout Verification

```javascript
function verifyMemoryLayout() {
  const ptr = getBufferPtr();
  const size = getBufferSize();
  const memorySize = memory.length;

  console.log('Memory Layout:');
  console.log(`  Total WASM memory: ${memorySize} bytes (${(memorySize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  I/O Buffer pointer: 0x${ptr.toString(16)}`);
  console.log(`  I/O Buffer size: ${size} bytes (${(size / 1024).toFixed(2)} KB)`);
  console.log(`  I/O Buffer end: 0x${(ptr + size).toString(16)}`);
  console.log(`  Buffer in valid range: ${ptr + size <= memorySize}`);
}
```

---

## Security Considerations

### Buffer Overflow Protection

**WASM provides memory isolation**: JavaScript cannot access memory outside the WASM linear memory bounds. The browser's WebAssembly implementation prevents out-of-bounds access.

**Input validation**:
```javascript
// Always validate before calling compute()
if (codeBytes.length > bufferSize) {
  throw new Error('Code exceeds buffer size');
}
```

**Internal checks** (src/main.zig:121):
```zig
if (code_len > IO_BUFFER_SIZE) return -1;
```

### Denial of Service

**Protection against infinite loops**:
lua.wasm runs in the WASM sandbox. Infinite loops will block the JavaScript thread but cannot escape the sandbox. Use Web Workers for isolation:

```javascript
// worker.js - Isolated Lua execution
const timeout = setTimeout(() => {
  self.close(); // Terminate worker if execution takes too long
}, 5000);

const result = compute(ptr, len);
clearTimeout(timeout);
self.postMessage(result);
```

### Code Injection

**Lua code is not validated** before execution. Applications should sanitize user input:

```javascript
function sanitizeLuaCode(code) {
  // Example: Block dangerous functions
  const blacklist = ['os.execute', 'io.popen', 'load', 'loadfile'];
  for (const func of blacklist) {
    if (code.includes(func)) {
      throw new Error(`Dangerous function not allowed: ${func}`);
    }
  }
  return code;
}

const safeCode = sanitizeLuaCode(userInput);
compute(bufferPtr, encoder.encode(safeCode).length);
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-10-26 | Complete memory protocol documentation |
| 1.0.0 | 2025-10-20 | Initial implementation |

---

## References

- **Source Files**:
  - `src/main.zig` - Main entry point and buffer management
  - `src/output.zig` - Output capture system
  - `src/result.zig` - Result encoding
  - `src/error.zig` - Error handling
  - `src/serializer.zig` - Type serialization
  - `web/cu-api.js` - JavaScript API
  - `web/lua-deserializer.js` - JavaScript deserializer

- **Related Documentation**:
  - [API_REFERENCE.md](./API_REFERENCE.md) - High-level API documentation
  - [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
  - [TECHNICAL_REFERENCE.md](./TECHNICAL_REFERENCE.md) - Technical deep dive

---

## Contact

For questions or issues related to the memory protocol, please file an issue in the project repository with the `memory-protocol` label.
