# lua.wasm Memory Protocol - Quick Reference

**One-page reference for the I/O buffer protocol**

---

## Buffer Basics

| Property | Value |
|----------|-------|
| Buffer Size | 64 KB (65,536 bytes) |
| Alignment | 16 bytes |
| Location | Static WASM memory |
| Reuse | Yes (synchronous) |

```javascript
// Get buffer info (call once, cache forever)
const bufferPtr = wasmInstance.exports.get_buffer_ptr();
const bufferSize = wasmInstance.exports.get_buffer_size(); // 65536
```

---

## API Functions

### `init() -> i32`
- Returns: `0` = success, `-1` = error
- Call once after WASM instantiation

### `get_buffer_ptr() -> usize`
- Returns: Memory address of I/O buffer
- Cache this value (never changes)

### `get_buffer_size() -> usize`
- Returns: `65536`

### `compute(ptr, len) -> i32`
- Parameters: `ptr` = buffer pointer, `len` = code length
- Returns: 
  - `>= 0`: Success, result length in bytes
  - `< 0`: Error, `errorLen = (-returnValue) - 1`

---

## Usage Flow

```javascript
// 1. Write Lua code to buffer
const codeBytes = new TextEncoder().encode("return 42");
memory.set(codeBytes, bufferPtr);

// 2. Execute
const resultLen = compute(bufferPtr, codeBytes.length);

// 3. Handle result
if (resultLen < 0) {
  // Error case
  const errorLen = (-resultLen) - 1;
  const errorMsg = new TextDecoder().decode(
    memory.slice(bufferPtr, bufferPtr + errorLen)
  );
  console.error(errorMsg);
} else {
  // Success case
  const resultBuffer = memory.slice(bufferPtr, bufferPtr + resultLen);
  const { output, result } = deserializeResult(resultBuffer);
  console.log(output, result);
}
```

---

## Return Values

| Return | Meaning | Buffer Content |
|--------|---------|----------------|
| `> 0` | Success | Encoded result (output + value) |
| `0` | Success | Empty result (nil) |
| `-1` | Error | Empty error message |
| `< -1` | Error | UTF-8 error message |

**Error length formula**: `errorLen = (-returnValue) - 1`

Example: `-25` → 24 bytes of error message

---

## Buffer Format

### Success Response

```
[0..3]     u32 output_len (little-endian)
[4..4+M]   UTF-8 captured output (print statements)
[4+M..]    Type tag (1 byte) + encoded return value
```

### Error Response

```
[0..N]     UTF-8 error message (no structure)
```

---

## Type Encoding

| Lua Type | Tag | Data Size | Total |
|----------|-----|-----------|-------|
| `nil` | `0x00` | 0 | 1 byte |
| `boolean` | `0x01` | 1 byte (0 or 1) | 2 bytes |
| `integer` | `0x02` | 8 bytes (i64, LE) | 9 bytes |
| `float` | `0x03` | 8 bytes (f64, LE) | 9 bytes |
| `string` | `0x04` | 4 bytes len + UTF-8 | 5 + N bytes |

**LE** = Little-endian byte order

---

## Deserialization Code

```javascript
function deserializeResult(buffer, totalLength) {
  let offset = 0;

  // Read output length
  const outputLen = buffer[0] | (buffer[1] << 8) | 
                    (buffer[2] << 16) | (buffer[3] << 24);
  offset += 4;

  // Read output text
  let output = '';
  if (outputLen > 0) {
    output = new TextDecoder().decode(
      buffer.slice(offset, offset + outputLen)
    );
    offset += outputLen;
  }

  // Read return value
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
      const intView = new DataView(
        buffer.buffer, 
        buffer.byteOffset + offset, 
        8
      );
      result = Number(intView.getBigInt64(0, true)); // LE
      break;

    case 0x03: // float
      const floatView = new DataView(
        buffer.buffer, 
        buffer.byteOffset + offset, 
        8
      );
      result = floatView.getFloat64(0, true); // LE
      break;

    case 0x04: // string
      const strLen = buffer[offset] | (buffer[offset+1] << 8) | 
                     (buffer[offset+2] << 16) | (buffer[offset+3] << 24);
      offset += 4;
      result = new TextDecoder().decode(
        buffer.slice(offset, offset + strLen)
      );
      break;

    default:
      result = `<unknown type ${type}>`;
  }

  return { output, result };
}
```

---

## Memory Safety Rules

### ✅ DO

- **Copy buffer immediately** after `compute()` if you need to preserve it
- **Cache buffer pointer** (never changes)
- **Validate code length** before calling `compute()`
- **Process results synchronously**

### ❌ DON'T

- **Store buffer references** across `compute()` calls
- **Access buffer during execution** (not thread-safe)
- **Modify buffer pointer** (use exact value from `get_buffer_ptr()`)
- **Exceed buffer size** (max 65,536 bytes)

---

## Common Patterns

### Pattern 1: Single Execution
```javascript
const code = "return 42";
const codeBytes = encoder.encode(code);
memory.set(codeBytes, bufferPtr);

const resultLen = compute(bufferPtr, codeBytes.length);
if (resultLen >= 0) {
  const result = deserializeResult(
    memory.slice(bufferPtr, bufferPtr + resultLen),
    resultLen
  );
}
```

### Pattern 2: Multiple Executions with Preservation
```javascript
// Execute and preserve result 1
const len1 = compute(bufferPtr, code1Len);
const result1Copy = new Uint8Array(
  memory.slice(bufferPtr, bufferPtr + len1)
); // COPY!

// Execute and preserve result 2
const len2 = compute(bufferPtr, code2Len);
const result2Copy = new Uint8Array(
  memory.slice(bufferPtr, bufferPtr + len2)
); // COPY!

// Both copies are still valid
const data1 = deserializeResult(result1Copy, len1);
const data2 = deserializeResult(result2Copy, len2);
```

### Pattern 3: Error Handling
```javascript
function executeLua(code) {
  const codeBytes = encoder.encode(code);
  
  if (codeBytes.length > bufferSize) {
    throw new Error('Code too large');
  }

  memory.set(codeBytes, bufferPtr);
  const resultLen = compute(bufferPtr, codeBytes.length);

  if (resultLen < 0) {
    const errorLen = (-resultLen) - 1;
    const errorMsg = decoder.decode(
      memory.slice(bufferPtr, bufferPtr + errorLen)
    );
    throw new Error(errorMsg);
  }

  return deserializeResult(
    memory.slice(bufferPtr, bufferPtr + resultLen),
    resultLen
  );
}
```

---

## Performance Tips

1. **Cache TextEncoder/TextDecoder**
   ```javascript
   const encoder = new TextEncoder();
   const decoder = new TextDecoder();
   // Reuse for all calls
   ```

2. **Use Uint8Array.set() for large inputs**
   ```javascript
   memory.set(codeBytes, bufferPtr); // Fast memcpy
   ```

3. **Copy only when necessary**
   ```javascript
   // If processing immediately, no copy needed
   const result = deserializeResult(memory.slice(...));
   ```

4. **Batch Lua statements when possible**
   ```javascript
   // Better: One call
   compute("a=1; b=2; return a+b");
   
   // Worse: Three calls
   compute("a=1");
   compute("b=2");
   compute("return a+b");
   ```

---

## Debugging

### Inspect Buffer Contents
```javascript
function inspectBuffer(ptr, len) {
  const buffer = memory.slice(ptr, ptr + len);
  
  // Hex dump
  console.log('Hex:');
  for (let i = 0; i < Math.min(len, 128); i += 16) {
    const chunk = buffer.slice(i, i + 16);
    const hex = Array.from(chunk)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.log(`${i.toString(16).padStart(4, '0')}: ${hex}`);
  }
  
  // UTF-8 (if possible)
  try {
    console.log('UTF-8:', new TextDecoder().decode(buffer));
  } catch (e) {
    console.log('(not valid UTF-8)');
  }
}
```

### Verify Memory Layout
```javascript
console.log('Buffer ptr:', `0x${bufferPtr.toString(16)}`);
console.log('Buffer size:', bufferSize);
console.log('Buffer end:', `0x${(bufferPtr + bufferSize).toString(16)}`);
console.log('Total memory:', memory.length);
console.log('Valid:', (bufferPtr + bufferSize <= memory.length));
```

---

## Common Issues

### Issue: "Buffer overwritten"
**Cause**: Storing buffer reference instead of copying
**Fix**: Create copy with `new Uint8Array(memory.slice(...))`

### Issue: "Wrong data returned"
**Cause**: Using stale buffer reference
**Fix**: Read buffer immediately after each `compute()`

### Issue: "Code too large"
**Cause**: Input exceeds 64KB
**Fix**: Split code into multiple calls or reduce size

### Issue: "Invalid UTF-8"
**Cause**: Trying to decode binary result data as text
**Fix**: Use proper deserialization (check type tags first)

---

## Source Code References

- **Buffer allocation**: `src/main.zig:16`
- **compute() function**: `src/main.zig:119-152`
- **Result encoding**: `src/result.zig:10-52`
- **Error handling**: `src/error.zig:60-73`
- **Type serialization**: `src/serializer.zig:7-84`

---

## See Also

- [MEMORY_PROTOCOL.md](./MEMORY_PROTOCOL.md) - Complete specification
- [API_REFERENCE.md](./API_REFERENCE.md) - High-level API documentation
- [TECHNICAL_REFERENCE.md](./TECHNICAL_REFERENCE.md) - Technical deep dive
