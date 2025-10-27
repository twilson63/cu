/**
 * Deserializer for Lua WASM result format
 * Matches the serialization format in src/result.zig
 */

const SerializationType = {
  NIL: 0,
  BOOLEAN: 1,
  INTEGER: 2,
  FLOAT: 3,
  STRING: 4,
  TABLE: 5,
  FUNCTION: 6,
  ERROR: 255
};

/**
 * Deserialize the result buffer from Lua compute()
 * @param {Uint8Array} buffer - Raw buffer data
 * @param {number} totalLength - Total bytes to read
 * @returns {{output: string, result: any}} Deserialized result
 */
export function deserializeResult(buffer, totalLength) {
  if (totalLength <= 0) {
    return { output: '', result: null };
  }

  // First 4 bytes: output length (little-endian u32)
  if (totalLength < 4) {
    return { output: '', result: null };
  }

  const outputLen = 
    buffer[0] | 
    (buffer[1] << 8) | 
    (buffer[2] << 16) | 
    (buffer[3] << 24);

  let offset = 4;
  let output = '';

  // Read captured output (print statements)
  if (outputLen > 0 && offset + outputLen <= totalLength) {
    const outputBytes = buffer.slice(offset, offset + outputLen);
    output = new TextDecoder().decode(outputBytes);
    offset += outputLen;
  }

  // Check for overflow marker
  if (offset + 3 <= totalLength && 
      buffer[offset] === 46 && // '.'
      buffer[offset + 1] === 46 && 
      buffer[offset + 2] === 46) {
    output += '...';
    offset += 3;
  }

  // Deserialize the return value
  let result = null;
  if (offset < totalLength) {
    const decoded = deserializeValue(buffer, offset, totalLength);
    result = decoded.value;
  }

  return { output, result };
}

/**
 * Deserialize a single value
 * @param {Uint8Array} buffer
 * @param {number} offset
 * @param {number} maxLen
 * @returns {{value: any, bytesRead: number}}
 */
function deserializeValue(buffer, offset, maxLen) {
  if (offset >= maxLen) {
    return { value: null, bytesRead: 0 };
  }

  const type = buffer[offset];
  offset++;

  switch (type) {
    case SerializationType.NIL:
      return { value: null, bytesRead: 1 };

    case SerializationType.BOOLEAN:
      if (offset < maxLen) {
        return { value: buffer[offset] !== 0, bytesRead: 2 };
      }
      return { value: null, bytesRead: 1 };

    case SerializationType.INTEGER:
      if (offset + 8 <= maxLen) {
        // Read 8-byte integer (little-endian)
        const bytes = buffer.slice(offset, offset + 8);
        const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
        const value = view.getBigInt64(0, true); // little-endian
        // Convert to number if safe
        if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
          return { value: Number(value), bytesRead: 9 };
        }
        return { value: value, bytesRead: 9 };
      }
      return { value: null, bytesRead: 1 };

    case SerializationType.FLOAT:
      if (offset + 8 <= maxLen) {
        // Read 8-byte float (little-endian)
        const bytes = buffer.slice(offset, offset + 8);
        const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
        const value = view.getFloat64(0, true); // little-endian
        return { value: value, bytesRead: 9 };
      }
      return { value: null, bytesRead: 1 };

    case SerializationType.STRING:
      if (offset + 4 <= maxLen) {
        // Read string length (4-byte little-endian)
        const strLen = 
          buffer[offset] | 
          (buffer[offset + 1] << 8) | 
          (buffer[offset + 2] << 16) | 
          (buffer[offset + 3] << 24);
        offset += 4;

        if (offset + strLen <= maxLen) {
          const strBytes = buffer.slice(offset, offset + strLen);
          const str = new TextDecoder().decode(strBytes);
          return { value: str, bytesRead: 5 + strLen };
        }
      }
      return { value: null, bytesRead: 1 };

    case SerializationType.TABLE:
      // Tables are returned as string representation
      return { value: '<table>', bytesRead: 1 };

    case SerializationType.FUNCTION:
      return { value: '<function>', bytesRead: 1 };

    case SerializationType.ERROR:
      if (offset + 4 <= maxLen) {
        // Error message follows same format as string
        const errLen = 
          buffer[offset] | 
          (buffer[offset + 1] << 8) | 
          (buffer[offset + 2] << 16) | 
          (buffer[offset + 3] << 24);
        offset += 4;

        if (offset + errLen <= maxLen) {
          const errBytes = buffer.slice(offset, offset + errLen);
          const errMsg = new TextDecoder().decode(errBytes);
          return { value: new Error(errMsg), bytesRead: 5 + errLen };
        }
      }
      return { value: new Error('Unknown error'), bytesRead: 1 };

    default:
      return { value: `<unknown type ${type}>`, bytesRead: 1 };
  }
}

export default { deserializeResult };