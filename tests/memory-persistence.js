const fs = require('fs');
const path = require('path');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function deserializeResult(buffer) {
  if (buffer.length === 0) {
    return { output: '', result: null };
  }

  if (buffer.length < 4) {
    return { output: '', result: null };
  }

  const outputLen =
    buffer[0] |
    (buffer[1] << 8) |
    (buffer[2] << 16) |
    (buffer[3] << 24);

  let offset = 4;
  let output = '';

  if (outputLen > 0 && offset + outputLen <= buffer.length) {
    const outputBytes = buffer.slice(offset, offset + outputLen);
    output = textDecoder.decode(outputBytes);
    offset += outputLen;
  }

  if (
    offset + 3 <= buffer.length &&
    buffer[offset] === 46 &&
    buffer[offset + 1] === 46 &&
    buffer[offset + 2] === 46
  ) {
    output += '...';
    offset += 3;
  }

  if (offset >= buffer.length) {
    return { output, result: null };
  }

  const type = buffer[offset];
  offset += 1;

  switch (type) {
    case 0: // nil
      return { output, result: null };
    case 1: // boolean
      return { output, result: buffer[offset] !== 0 };
    case 2: { // integer (little-endian i64)
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
      const value = Number(view.getBigInt64(0, true));
      return { output, result: value };
    }
    case 3: { // float (little-endian f64)
      const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
      const value = view.getFloat64(0, true);
      return { output, result: value };
    }
    case 4: { // string
      const strLen =
        buffer[offset] |
        (buffer[offset + 1] << 8) |
        (buffer[offset + 2] << 16) |
        (buffer[offset + 3] << 24);
      const strBytes = buffer.slice(offset + 4, offset + 4 + strLen);
      return { output, result: textDecoder.decode(strBytes) };
    }
    default:
      return { output, result: null };
  }
}

async function instantiateRuntime(persistedTables = new Map()) {
  const wasmPath = path.resolve(__dirname, '../web/lua.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);

  const externalTables = new Map();
  for (const [id, table] of persistedTables) {
    externalTables.set(Number(id), new Map(table));
  }

  let memoryView;

  function ensureTable(tableId) {
    if (!externalTables.has(tableId)) {
      externalTables.set(tableId, new Map());
    }
    return externalTables.get(tableId);
  }

  const imports = {
    env: {
      js_time_now() {
        return Date.now();
      },
      js_ext_table_set(tableId, keyPtr, keyLen, valPtr, valLen) {
        try {
          const table = ensureTable(tableId);
          const key = textDecoder.decode(memoryView.slice(keyPtr, keyPtr + keyLen));
          const value = textDecoder.decode(memoryView.slice(valPtr, valPtr + valLen));
          table.set(key, value);
          return 0;
        } catch (error) {
          console.error('js_ext_table_set error:', error);
          return -1;
        }
      },
      js_ext_table_get(tableId, keyPtr, keyLen, valPtr, maxLen) {
        try {
          const table = externalTables.get(tableId);
          if (!table) return -1;
          const key = textDecoder.decode(memoryView.slice(keyPtr, keyPtr + keyLen));
          const value = table.get(key);
          if (value === undefined) return -1;
          const valueBytes = textEncoder.encode(value);
          if (valueBytes.length > maxLen) return -1;
          for (let i = 0; i < valueBytes.length; i++) {
            memoryView[valPtr + i] = valueBytes[i];
          }
          return valueBytes.length;
        } catch (error) {
          console.error('js_ext_table_get error:', error);
          return -1;
        }
      },
      js_ext_table_delete(tableId, keyPtr, keyLen) {
        try {
          const table = externalTables.get(tableId);
          if (!table) return -1;
          const key = textDecoder.decode(memoryView.slice(keyPtr, keyPtr + keyLen));
          table.delete(key);
          return 0;
        } catch (error) {
          console.error('js_ext_table_delete error:', error);
          return -1;
        }
      },
      js_ext_table_size(tableId) {
        const table = externalTables.get(tableId);
        return table ? table.size : 0;
      },
      js_ext_table_keys(tableId, bufPtr, maxLen) {
        try {
          const table = externalTables.get(tableId);
          if (!table) return -1;
          const keys = Array.from(table.keys()).join('\n');
          const keyBytes = textEncoder.encode(keys);
          if (keyBytes.length > maxLen) return -1;
          for (let i = 0; i < keyBytes.length; i++) {
            memoryView[bufPtr + i] = keyBytes[i];
          }
          return keyBytes.length;
        } catch (error) {
          console.error('js_ext_table_keys error:', error);
          return -1;
        }
      },
    },
  };

  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  memoryView = new Uint8Array(instance.exports.memory.buffer);

  return { instance, memoryView, externalTables };
}

function runLua(runtime, code) {
  const { instance, memoryView } = runtime;
  const ptr = instance.exports.get_buffer_ptr();
  const size = instance.exports.get_buffer_size();
  const codeBytes = textEncoder.encode(code);
  if (codeBytes.length > size) {
    throw new Error('Code too large for IO buffer');
  }
  for (let i = 0; i < codeBytes.length; i++) {
    memoryView[ptr + i] = codeBytes[i];
  }
  const len = instance.exports.compute(ptr, codeBytes.length);
  if (len < 0) {
    const errLen = Math.min(-len, size);
    const errBytes = memoryView.slice(ptr, ptr + errLen);
    const errorMsg = textDecoder.decode(errBytes);
    throw new Error(errorMsg);
  }
  const resultBytes = memoryView.slice(ptr, ptr + len);
  return deserializeResult(resultBytes);
}

function cloneTables(tables) {
  const clone = new Map();
  for (const [id, table] of tables.entries()) {
    clone.set(id, new Map(table.entries()))
  }
  return clone;
}

(async () => {
  const runtimeA = await instantiateRuntime();
  runtimeA.instance.exports.init();
  const memoryIdA = runtimeA.instance.exports.get_memory_table_id();
  if (!memoryIdA) {
    throw new Error('Memory table ID was not created');
  }

  const first = runLua(runtimeA, 'Memory.counter = (Memory.counter or 0) + 1; return Memory.counter');
  if (first.result !== 1) {
    throw new Error(`Expected Memory.counter to be 1, got ${first.result}`);
  }

  const persistedTables = cloneTables(runtimeA.externalTables);
  let maxId = 0;
  for (const id of persistedTables.keys()) {
    if (id > maxId) maxId = id;
  }
  const nextTableId = maxId + 1;

  const runtimeB = await instantiateRuntime(persistedTables);
  runtimeB.instance.exports.init();
  runtimeB.instance.exports.sync_external_table_counter(nextTableId);
  runtimeB.instance.exports.attach_memory_table(memoryIdA);
  const memoryIdB = runtimeB.instance.exports.get_memory_table_id();
  if (memoryIdB !== memoryIdA) {
    throw new Error(`Expected Memory ID ${memoryIdA}, got ${memoryIdB}`);
  }

  const restored = runLua(runtimeB, 'return Memory.counter');
  if (restored.result !== 1) {
    throw new Error(`Expected Memory.counter to persist as 1, got ${restored.result}`);
  }

  const incremented = runLua(runtimeB, 'Memory.counter = Memory.counter + 1; return Memory.counter');
  if (incremented.result !== 2) {
    throw new Error(`Expected Memory.counter to increment to 2, got ${incremented.result}`);
  }

  console.log('✅ Memory persistence smoke test passed');
})().catch((error) => {
  console.error('❌ Memory persistence smoke test failed');
  console.error(error);
  process.exit(1);
});
