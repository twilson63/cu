/**
 * Node.js test utilities for Cu WASM testing
 */

const fs = require('fs');
const path = require('path');

// Storage for external tables (mimics browser Map)
const externalTables = new Map();
let nextTableId = 1;
let homeTableId = null;
let ioTableId = null;

let wasmInstance = null;
let wasmMemory = null;

function ensureExternalTable(tableId) {
  const id = Number(tableId);
  if (!externalTables.has(id)) {
    externalTables.set(id, new Map());
  }
  if (id >= nextTableId) {
    nextTableId = id + 1;
  }
  return externalTables.get(id);
}

/**
 * Load Cu WASM module
 */
async function loadWasm(wasmPath = path.join(__dirname, '../web/cu.wasm')) {
  const wasmBuffer = fs.readFileSync(wasmPath);

  const imports = {
    env: {
      js_time_now: () => Date.now(),
      js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
        try {
          const table = ensureExternalTable(table_id);
          const key = Buffer.from(wasmMemory.slice(key_ptr, key_ptr + key_len)).toString('utf8');
          const valueBytes = wasmMemory.slice(val_ptr, val_ptr + val_len);
          const valueCopy = new Uint8Array(valueBytes);
          table.set(key, valueCopy);
          return 0;
        } catch (e) {
          console.error('js_ext_table_set error:', e);
          return -1;
        }
      },
      js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
        try {
          const table = externalTables.get(table_id);
          if (!table) return -1;

          const key = Buffer.from(wasmMemory.slice(key_ptr, key_ptr + key_len)).toString('utf8');
          const value = table.get(key);

          if (value === undefined) return -1;

          let valueBytes;
          if (value instanceof Uint8Array) {
            valueBytes = value;
          } else if (typeof value === 'string') {
            valueBytes = Buffer.from(value, 'utf8');
          } else {
            return -1;
          }

          if (valueBytes.length > max_len) return -1;

          for (let i = 0; i < valueBytes.length; i++) {
            wasmMemory[val_ptr + i] = valueBytes[i];
          }

          return valueBytes.length;
        } catch (e) {
          console.error('js_ext_table_get error:', e);
          return -1;
        }
      },
      js_ext_table_delete: (table_id, key_ptr, key_len) => {
        try {
          const table = externalTables.get(table_id);
          if (!table) return -1;

          const key = Buffer.from(wasmMemory.slice(key_ptr, key_ptr + key_len)).toString('utf8');
          table.delete(key);
          return 0;
        } catch (e) {
          console.error('js_ext_table_delete error:', e);
          return -1;
        }
      },
      js_ext_table_size: (table_id) => {
        const table = externalTables.get(table_id);
        return table ? table.size : 0;
      },
      js_ext_table_keys: (table_id, buf_ptr, max_len) => {
        try {
          const table = externalTables.get(table_id);
          if (!table) return -1;

          const keys = Array.from(table.keys()).join('\n');
          const keysBytes = Buffer.from(keys, 'utf8');

          if (keysBytes.length > max_len) return -1;

          for (let i = 0; i < keysBytes.length; i++) {
            wasmMemory[buf_ptr + i] = keysBytes[i];
          }

          return keysBytes.length;
        } catch (e) {
          console.error('js_ext_table_keys error:', e);
          return -1;
        }
      },
    },
  };

  const wasmModule = await WebAssembly.instantiate(wasmBuffer, imports);
  wasmInstance = wasmModule.instance;
  wasmMemory = new Uint8Array(wasmInstance.exports.memory.buffer);

  return wasmInstance;
}

/**
 * Initialize Lua VM
 */
function init() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded. Call loadWasm() first');
  }

  const result = wasmInstance.exports.init?.() ?? 0;

  const exportedId = wasmInstance.exports.get_memory_table_id?.() ?? 0;
  if (homeTableId && homeTableId !== exportedId && wasmInstance.exports.attach_memory_table) {
    wasmInstance.exports.attach_memory_table(homeTableId);
  } else if (!homeTableId && exportedId > 0) {
    homeTableId = exportedId;
  }

  const confirmedId = wasmInstance.exports.get_memory_table_id?.() ?? exportedId;
  if (confirmedId > 0) {
    homeTableId = confirmedId;
    ensureExternalTable(homeTableId);
  }

  if (wasmInstance.exports.sync_external_table_counter) {
    wasmInstance.exports.sync_external_table_counter(nextTableId);
  }

  return result;
}

/**
 * Execute Lua code
 */
function compute(code) {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }

  const bufPtr = wasmInstance.exports.get_buffer_ptr();
  const bufSize = wasmInstance.exports.get_buffer_size();
  const codeBytes = Buffer.from(code, 'utf8');

  if (codeBytes.length > bufSize) {
    throw new Error(`Code too large (${codeBytes.length} > ${bufSize})`);
  }

  for (let i = 0; i < codeBytes.length; i++) {
    wasmMemory[bufPtr + i] = codeBytes[i];
  }

  return wasmInstance.exports.compute(bufPtr, codeBytes.length);
}

/**
 * Get buffer pointer
 */
function getBufferPtr() {
  return wasmInstance.exports.get_buffer_ptr();
}

/**
 * Read result from buffer
 */
function readResult(ptr, len) {
  if (len === 0) {
    return { result: null, output: '' };
  }

  const buffer = wasmMemory.slice(ptr, ptr + len);
  return deserializeResult(buffer, len);
}

/**
 * Deserialize result (simplified version from cu-deserializer.js)
 */
function deserializeResult(buffer, len) {
  if (len === 0) {
    return { result: null, output: '' };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  // Read output string length
  if (len < 4) {
    return { result: null, output: '' };
  }
  
  const outputLen = view.getUint32(0, true);
  let offset = 4;
  
  // Read output string
  let output = '';
  if (outputLen > 0 && offset + outputLen <= len) {
    const outputBytes = buffer.slice(offset, offset + outputLen);
    output = Buffer.from(outputBytes).toString('utf8');
    offset += outputLen;
  }
  
  // Read result type
  if (offset >= len) {
    return { result: null, output };
  }
  
  const resultType = view.getUint8(offset);
  offset += 1;
  
  let result = null;
  
  switch (resultType) {
    case 0x00: // nil
      result = null;
      break;
    
    case 0x01: // boolean
      if (offset < len) {
        result = view.getUint8(offset) !== 0;
      }
      break;
    
    case 0x02: // integer
      if (offset + 8 <= len) {
        result = Number(view.getBigInt64(offset, true));
      }
      break;
    
    case 0x03: // float
      if (offset + 8 <= len) {
        result = view.getFloat64(offset, true);
      }
      break;
    
    case 0x04: // string
      if (offset + 4 <= len) {
        const strLen = view.getUint32(offset, true);
        offset += 4;
        if (offset + strLen <= len) {
          const strBytes = buffer.slice(offset, offset + strLen);
          result = Buffer.from(strBytes).toString('utf8');
        }
      }
      break;
    
    default:
      result = null;
  }
  
  return { result, output };
}

/**
 * Helper to serialize JavaScript objects to Lua-compatible format
 */
function serializeObject(obj) {
  if (obj === null || obj === undefined) {
    return new Uint8Array([0x00]); // nil
  }
  
  if (typeof obj === 'boolean') {
    return new Uint8Array([0x01, obj ? 1 : 0]);
  }
  
  if (typeof obj === 'number') {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, 0x02); // integer type
    view.setBigInt64(1, BigInt(Math.floor(obj)), true);
    return new Uint8Array(buffer);
  }
  
  if (typeof obj === 'string') {
    const strBytes = Buffer.from(obj, 'utf8');
    const buffer = new ArrayBuffer(5 + strBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, 0x04); // string type
    view.setUint32(1, strBytes.length, true);
    new Uint8Array(buffer).set(strBytes, 5);
    return new Uint8Array(buffer);
  }
  
  if (Array.isArray(obj)) {
    const arrayTableId = nextTableId++;
    ensureExternalTable(arrayTableId);
    
    obj.forEach((item, index) => {
      const serialized = serializeObject(item);
      const table = externalTables.get(arrayTableId);
      table.set(String(index + 1), serialized);
    });
    
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, arrayTableId, true);
    return new Uint8Array(buffer);
  }
  
  if (typeof obj === 'object') {
    const objTableId = nextTableId++;
    ensureExternalTable(objTableId);
    
    for (const [key, value] of Object.entries(obj)) {
      const serialized = serializeObject(value);
      const table = externalTables.get(objTableId);
      table.set(key, serialized);
    }
    
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, objTableId, true);
    return new Uint8Array(buffer);
  }
  
  return new Uint8Array([0x00]); // fallback to nil
}

/**
 * Helper to deserialize Lua binary data
 */
function deserializeObject(buffer) {
  if (!buffer || buffer.length === 0) {
    return null;
  }
  
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const type = view.getUint8(0);
  
  switch (type) {
    case 0x00: // nil
      return null;
    
    case 0x01: // boolean
      if (buffer.length < 2) return null;
      return view.getUint8(1) !== 0;
    
    case 0x02: // integer
      if (buffer.length < 9) return null;
      return Number(view.getBigInt64(1, true));
    
    case 0x03: // float
      if (buffer.length < 9) return null;
      return view.getFloat64(1, true);
    
    case 0x04: // string
      if (buffer.length < 5) return null;
      const strLen = view.getUint32(1, true);
      if (buffer.length < 5 + strLen) return null;
      const strBytes = buffer.slice(5, 5 + strLen);
      return Buffer.from(strBytes).toString('utf8');
    
    case 0x07: // table_ref
      if (buffer.length < 5) return null;
      const tableId = view.getUint32(1, true);
      const table = externalTables.get(tableId);
      if (!table) return null;
      
      const keys = Array.from(table.keys());
      const isArray = keys.every((key, idx) => key === String(idx + 1));
      
      if (isArray) {
        const result = [];
        for (let i = 1; i <= keys.length; i++) {
          const value = table.get(String(i));
          if (value !== undefined) {
            result.push(deserializeObject(value));
          }
        }
        return result;
      } else {
        const result = {};
        for (const [key, value] of table) {
          result[key] = deserializeObject(value);
        }
        return result;
      }
    
    default:
      return null;
  }
}

/**
 * Get _io table ID
 */
function getIoTableId() {
  if (ioTableId === null) {
    ioTableId = wasmInstance.exports.get_io_table_id?.() ?? 0;
    if (ioTableId === 0) {
      throw new Error('_io table not initialized');
    }
  }
  return ioTableId;
}

/**
 * Set input data for _io.input
 */
function setInput(data) {
  const tableId = getIoTableId();
  const serialized = serializeObject(data);
  const table = ensureExternalTable(tableId);
  table.set('input', serialized);
}

/**
 * Get output data from _io.output
 */
function getOutput() {
  const tableId = getIoTableId();
  const table = externalTables.get(tableId);
  if (!table) return null;
  
  const serialized = table.get('output');
  if (!serialized) return null;
  
  return deserializeObject(serialized);
}

/**
 * Set metadata for _io.meta
 */
function setMetadata(meta) {
  const tableId = getIoTableId();
  const serialized = serializeObject(meta);
  const table = ensureExternalTable(tableId);
  table.set('meta', serialized);
}

/**
 * Clear all _io table contents
 */
function clearIo() {
  if (!wasmInstance) return;
  
  wasmInstance.exports.clear_io_table?.();
  
  if (ioTableId !== null) {
    const table = externalTables.get(ioTableId);
    if (table) {
      table.delete('input');
      table.delete('output');
      table.delete('meta');
    }
  }
}

/**
 * Reset state for next test
 */
function reset() {
  externalTables.clear();
  nextTableId = 1;
  homeTableId = null;
  ioTableId = null;
  wasmInstance = null;
  wasmMemory = null;
}

module.exports = {
  loadWasm,
  init,
  compute,
  getBufferPtr,
  readResult,
  setInput,
  getOutput,
  setMetadata,
  clearIo,
  reset,
  externalTables,
};
