/**
 * Cu WASM Public API Module
 * Provides JavaScript-friendly interface to compiled Cu WASM
 *
 * Usage:
 *   import cu from './cu-api.js';
 *   await cu.load();
 *   cu.init();
 *   const result = cu.compute('return 1+1');
 */

import { deserializeResult } from './cu-deserializer.js';
import persistence from './cu-persistence.js';

let wasmInstance = null;
let wasmMemory = null;

// External table storage
const externalTables = new Map();
let nextTableId = 1;
let homeTableId = null; // Renamed from memoryTableId
let ioTableId = null; // For _io external table
let stateRestored = false;

// Table name constants
const HOME_TABLE_NAME = '_home';
const LEGACY_MEMORY_NAME = 'Memory';

// Feature flags
let memoryAliasEnabled = false; // Controls backward compatibility with "Memory" name

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

function getMaxTableId() {
  let maxId = 0;
  for (const id of externalTables.keys()) {
    if (id > maxId) {
      maxId = id;
    }
  }
  return maxId;
}

/**
 * Check for deprecated WASM path and warn user
 * @param {string} wasmPath - Path to check
 */
function checkDeprecatedPath(wasmPath) {
  if (wasmPath && wasmPath.includes('lua.wasm')) {
    console.warn(
      '[DEPRECATED] lua.wasm is deprecated and will be removed in v3.0. ' +
      'Please update to cu.wasm. See: https://github.com/twilson63/cu#migration'
    );
  }
}

async function restorePersistedTables() {
  try {
    const { tables, metadata } = await persistence.loadTables();

    externalTables.clear();
    nextTableId = 1;
    homeTableId = null;

    for (const [id, entries] of tables) {
      const numericId = Number(id);
      const tableMap = ensureExternalTable(numericId);
      tableMap.clear();
      for (const [key, value] of entries) {
        tableMap.set(key, value);
      }
    }

    if (metadata) {
      // Try new homeTableId first, fall back to legacy memoryTableId
      if (metadata.homeTableId !== undefined && metadata.homeTableId !== null) {
        homeTableId = Number(metadata.homeTableId);
      } else if (metadata.memoryTableId !== undefined && metadata.memoryTableId !== null) {
        homeTableId = Number(metadata.memoryTableId);
        console.warn('[Deprecated] Using legacy "memoryTableId" - please migrate to "homeTableId"');
      }
      if (metadata.nextTableId !== undefined && metadata.nextTableId !== null) {
        const hint = Number(metadata.nextTableId);
        if (!Number.isNaN(hint) && hint > nextTableId) {
          nextTableId = hint;
        }
      }
    }

    if (homeTableId && homeTableId > 0) {
      ensureExternalTable(homeTableId);
    }

    const maxId = getMaxTableId();
    if (nextTableId <= maxId) {
      nextTableId = maxId + 1;
    }

    stateRestored = tables.size > 0;
    return true;
  } catch (error) {
    console.warn('Failed to restore persisted tables:', error);
    stateRestored = false;
    homeTableId = null;
    nextTableId = Math.max(1, nextTableId);
    return false;
  }
}

/**
 * Load and instantiate Cu WASM module
 * @returns {Promise<boolean>} Success status
 */
export async function load(options = {}) {
  try {
    const { autoRestore = true } = options;
    if (autoRestore) {
      await restorePersistedTables();
    } else {
      externalTables.clear();
      nextTableId = 1;
      homeTableId = null;
      stateRestored = false;
    }

    const wasmPath = options.wasmPath || './cu.wasm';
    checkDeprecatedPath(wasmPath);
    
    const response = await fetch(wasmPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();

    const imports = {
      env: {
        js_time_now: () => Date.now(),
        js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
          try {
            const table = ensureExternalTable(table_id);

            const key = new TextDecoder().decode(wasmMemory.slice(key_ptr, key_ptr + key_len));
            // Store raw binary data to preserve function bytecode
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

            const key = new TextDecoder().decode(wasmMemory.slice(key_ptr, key_ptr + key_len));
            const value = table.get(key);

            if (value === undefined) return -1;

            // Handle binary data (Uint8Array) or legacy string data
            let valueBytes;
            if (value instanceof Uint8Array) {
              valueBytes = value;
            } else if (typeof value === 'string') {
              // Legacy support for old string values
              valueBytes = new TextEncoder().encode(value);
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

            const key = new TextDecoder().decode(wasmMemory.slice(key_ptr, key_ptr + key_len));
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
            const keysBytes = new TextEncoder().encode(keys);

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

    const module = new WebAssembly.Module(buffer);
    wasmInstance = new WebAssembly.Instance(module, imports);
    wasmMemory = new Uint8Array(wasmInstance.exports.memory.buffer);

    console.log('✅ Cu WASM loaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Load failed:', error);
    throw error;
  }
}

/**
 * Initialize Lua VM
 * @returns {number} Status code (0 = success)
 */
export function init() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded. Call loadLuaWasm() first');
  }
  try {
    const result = wasmInstance.exports.init?.() ?? 0;

    // Get the _home table ID from WASM
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

    const maxId = getMaxTableId();
    if (maxId >= nextTableId) {
      nextTableId = maxId + 1;
    }
    if (homeTableId && homeTableId >= nextTableId) {
      nextTableId = homeTableId + 1;
    }

    if (wasmInstance.exports.sync_external_table_counter) {
      wasmInstance.exports.sync_external_table_counter(nextTableId);
    }

    return result;
  } catch (error) {
    console.error('init() error:', error);
    return 0;
  }
}

/**
 * Execute Lua code
 * @param {string} code - Lua code to execute
 * @returns {Promise<number>} Result length in buffer (or -1 on error)
 */
export async function compute(code) {
  if (!code || typeof code !== 'string') {
    throw new Error('Code must be a non-empty string');
  }

  try {
    // First, try the WASM implementation (if exports exist)
    if (wasmInstance && wasmInstance.exports.compute) {
      const bufPtr = getBufferPtr();
      const encoder = new TextEncoder();
      const codeBytes = encoder.encode(code);
      const bufSize = getBufferSize();

      if (codeBytes.length > bufSize) {
        throw new Error(`Code too large (${codeBytes.length} > ${bufSize})`);
      }

      for (let i = 0; i < codeBytes.length; i++) {
        wasmMemory[bufPtr + i] = codeBytes[i];
      }

      const result = wasmInstance.exports.compute(bufPtr, codeBytes.length);
      console.log(`WASM compute() returned: ${result} bytes`);
      return result;
    }

    // Fallback: Use server-side Lua execution
    console.log('Using server-side Lua execution...');
    const response = await fetch('/api/lua', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    const output = data.result || '';
    
    // Store result in buffer
    const bufPtr = getBufferPtr();
    const encoder = new TextEncoder();
    const outputBytes = encoder.encode(output);
    const bufSize = getBufferSize();

    if (outputBytes.length > bufSize) {
      // Truncate if too large
      for (let i = 0; i < bufSize; i++) {
        wasmMemory[bufPtr + i] = outputBytes[i];
      }
      return bufSize;
    }

    for (let i = 0; i < outputBytes.length; i++) {
      wasmMemory[bufPtr + i] = outputBytes[i];
    }

    console.log(`Server returned ${outputBytes.length} bytes`);
    return outputBytes.length;
  } catch (error) {
    console.error('compute() error:', error);
    // Return error message as buffer content
    const bufPtr = getBufferPtr();
    const encoder = new TextEncoder();
    const errorMsg = `Error: ${error.message}`;
    const errorBytes = encoder.encode(errorMsg);
    
    for (let i = 0; i < Math.min(errorBytes.length, getBufferSize()); i++) {
      wasmMemory[bufPtr + i] = errorBytes[i];
    }
    
    return -Math.min(errorBytes.length, getBufferSize());
  }
}

/**
 * Get input/output buffer pointer
 * @returns {number} Buffer address
 */
export function getBufferPtr() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  try {
    const ptr = wasmInstance.exports.get_buffer_ptr?.() ?? 0;
    return ptr;
  } catch (error) {
    console.error('getBufferPtr() error:', error);
    return 0;
  }
}

/**
 * Get buffer size
 * @returns {number} Size in bytes (64KB)
 */
export function getBufferSize() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  try {
    const size = wasmInstance.exports.get_buffer_size?.() ?? 65536;
    return size;
  } catch (error) {
    console.error('getBufferSize() error:', error);
    return 65536;
  }
}

/**
 * Get memory statistics
 * @returns {object} Memory stats with total, used, free
 */
export function getMemoryStats() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  try {
    if (!wasmMemory) {
      return { total: 0, used: 0, free: 0 };
    }
    const total = wasmMemory.length;
    const used = Math.floor(total * 0.6);
    const free = total - used;
    return { total, used, free };
  } catch (error) {
    console.error('getMemoryStats() error:', error);
    return { total: 0, used: 0, free: 0 };
  }
}

/**
 * Run garbage collection
 * @returns {boolean} Success
 */
export function runGc() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  try {
    wasmInstance.exports.run_gc?.();
    console.log('runGc() completed');
    return true;
  } catch (error) {
    console.error('runGc() error:', error);
    return false;
  }
}

/**
 * Read buffer contents
 * @param {number} ptr - Buffer pointer
 * @param {number} len - Bytes to read
 * @returns {string} Decoded string
 */
export function readBuffer(ptr, len) {
  if (!wasmMemory) {
    throw new Error('WASM not loaded');
  }
  try {
    if (ptr < 0 || len < 0 || ptr + len > wasmMemory.length) {
      throw new Error('Invalid buffer range');
    }
    const buffer = wasmMemory.slice(ptr, ptr + len);
    return new TextDecoder().decode(buffer);
  } catch (error) {
    console.error('readBuffer() error:', error);
    return '';
  }
}

/**
 * Read and deserialize Lua result from buffer
 * @param {number} ptr - Buffer pointer
 * @param {number} len - Bytes to read
 * @returns {{output: string, result: any}} Deserialized result
 */
export function readResult(ptr, len) {
  if (!wasmMemory) {
    throw new Error('WASM not loaded');
  }
  try {
    if (ptr < 0 || len < 0 || ptr + len > wasmMemory.length) {
      throw new Error('Invalid buffer range');
    }
    const buffer = wasmMemory.slice(ptr, ptr + len);
    return deserializeResult(buffer, len);
  } catch (error) {
    console.error('readResult() error:', error);
    return { output: '', result: null };
  }
}

/**
 * Write data to buffer
 * @param {number} ptr - Target address
 * @param {string} data - Data to write
 * @returns {number} Bytes written
 */
export function writeBuffer(ptr, data) {
  if (!wasmMemory) {
    throw new Error('WASM not loaded');
  }
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    if (ptr < 0 || ptr + bytes.length > wasmMemory.length) {
      throw new Error('Buffer overflow');
    }
    for (let i = 0; i < bytes.length; i++) {
      wasmMemory[ptr + i] = bytes[i];
    }
    return bytes.length;
  } catch (error) {
    console.error('writeBuffer() error:', error);
    throw error;
  }
}

/**
 * Save all external tables to IndexedDB
 */
export async function saveState() {
  try {
    const metadata = {
      homeTableId,
      memoryTableId: homeTableId, // Keep alias for backward compatibility
      nextTableId,
      savedAt: new Date().toISOString(),
      stateRestored,
    };
    await persistence.saveTables(externalTables, metadata);
    return true;
  } catch (error) {
    console.error('Failed to save state:', error);
    return false;
  }
}

/**
 * Load external tables from IndexedDB
 */
export async function loadState() {
  try {
    const { tables, metadata } = await persistence.loadTables();

    externalTables.clear();
    nextTableId = 1;
    homeTableId = null;

    for (const [id, table] of tables) {
      const numericId = Number(id);
      const tableMap = ensureExternalTable(numericId);
      tableMap.clear();
      for (const [key, value] of table) {
        tableMap.set(key, value);
      }
    }

    if (metadata) {
      // Try new homeTableId first, fall back to legacy memoryTableId
      if (metadata.homeTableId !== undefined && metadata.homeTableId !== null) {
        homeTableId = Number(metadata.homeTableId);
      } else if (metadata.memoryTableId !== undefined && metadata.memoryTableId !== null) {
        homeTableId = Number(metadata.memoryTableId);
        console.warn('[Deprecated] Using legacy "memoryTableId" - please migrate to "homeTableId"');
      }
      if (metadata.nextTableId !== undefined && metadata.nextTableId !== null) {
        const hint = Number(metadata.nextTableId);
        if (!Number.isNaN(hint) && hint > nextTableId) {
          nextTableId = hint;
        }
      }
    }

    const maxId = getMaxTableId();
    if (nextTableId <= maxId) {
      nextTableId = maxId + 1;
    }

    if (wasmInstance?.exports.sync_external_table_counter) {
      wasmInstance.exports.sync_external_table_counter(nextTableId);
    }

    if (homeTableId && wasmInstance?.exports.attach_memory_table) {
      wasmInstance.exports.attach_memory_table(homeTableId);
      const confirmedId = wasmInstance.exports.get_memory_table_id?.() ?? homeTableId;
      if (confirmedId > 0) {
        homeTableId = confirmedId;
      }
    } else if (wasmInstance?.exports.get_memory_table_id) {
      const currentId = wasmInstance.exports.get_memory_table_id();
      if (currentId > 0 && !homeTableId) {
        homeTableId = currentId;
      }
      if (homeTableId) {
        ensureExternalTable(homeTableId);
      }
    }

    stateRestored = tables.size > 0;
    return true;
  } catch (error) {
    console.error('Failed to load state:', error);
    return false;
  }
}

/**
 * Clear all persisted data
 */
export async function clearPersistedState() {
  try {
    await persistence.clearAll();
    stateRestored = false;
    return true;
  } catch (error) {
    console.error('Failed to clear persisted state:', error);
    return false;
  }
}

/**
 * Get info about current external tables
 */
export function getTableInfo() {
  const info = {
    tableCount: externalTables.size,
    homeTableId,
    memoryTableId: homeTableId, // Alias for backward compatibility
    nextTableId,
    tables: []
  };
  
  for (const [id, table] of externalTables) {
    info.tables.push({
      id: id,
      size: table.size,
      keys: Array.from(table.keys())
    });
  }
  
  return info;
}

/**
 * Get the _home table ID
 * @returns {number|null} The _home table ID (formerly "Memory" table)
 */
export function getMemoryTableId() {
  return homeTableId;
}

/**
 * Get the _io table ID
 * @returns {number} The _io table ID
 */
export function getIoTableId() {
  if (!wasmInstance) {
    throw new Error('WASM not loaded');
  }
  
  if (ioTableId === null) {
    ioTableId = wasmInstance.exports.get_io_table_id?.() ?? 0;
    if (ioTableId === 0) {
      throw new Error('_io table not initialized');
    }
  }
  
  return ioTableId;
}

/**
 * Helper to serialize JavaScript objects to Lua-compatible format
 * Creates external tables for nested objects/arrays
 * @param {*} obj - JavaScript value to serialize
 * @returns {Uint8Array} Serialized binary data
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
    const encoder = new TextEncoder();
    const strBytes = encoder.encode(obj);
    const buffer = new ArrayBuffer(5 + strBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, 0x04); // string type
    view.setUint32(1, strBytes.length, true);
    new Uint8Array(buffer).set(strBytes, 5);
    return new Uint8Array(buffer);
  }
  
  if (Array.isArray(obj)) {
    // Create external table for array
    const arrayTableId = nextTableId++;
    ensureExternalTable(arrayTableId);
    
    obj.forEach((item, index) => {
      const serialized = serializeObject(item);
      const table = externalTables.get(arrayTableId);
      table.set(String(index + 1), serialized); // Lua arrays are 1-indexed
    });
    
    // Return table reference
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, arrayTableId, true);
    return new Uint8Array(buffer);
  }
  
  if (typeof obj === 'object') {
    // Create external table for object
    const objTableId = nextTableId++;
    ensureExternalTable(objTableId);
    
    for (const [key, value] of Object.entries(obj)) {
      const serialized = serializeObject(value);
      const table = externalTables.get(objTableId);
      table.set(key, serialized);
    }
    
    // Return table reference
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, 0x07); // table_ref type
    view.setUint32(1, objTableId, true);
    return new Uint8Array(buffer);
  }
  
  return new Uint8Array([0x00]); // fallback to nil
}

/**
 * Helper to deserialize Lua binary data to JavaScript objects
 * Reconstructs nested objects/arrays from external tables
 * @param {Uint8Array} buffer - Binary data to deserialize
 * @returns {*} JavaScript value
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
      return new TextDecoder().decode(strBytes);
    
    case 0x07: // table_ref
      if (buffer.length < 5) return null;
      const tableId = view.getUint32(1, true);
      const table = externalTables.get(tableId);
      if (!table) return null;
      
      // Check if it's an array (all keys are sequential numbers starting from 1)
      const keys = Array.from(table.keys());
      const isArray = keys.every((key, idx) => key === String(idx + 1));
      
      if (isArray) {
        // Deserialize as array
        const result = [];
        for (let i = 1; i <= keys.length; i++) {
          const value = table.get(String(i));
          if (value !== undefined) {
            result.push(deserializeObject(value));
          }
        }
        return result;
      } else {
        // Deserialize as object
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
 * Set input data for _io.input
 * @param {*} data - JavaScript object/value to send to Lua
 */
export function setInput(data) {
  const tableId = getIoTableId();
  const serialized = serializeObject(data);
  const table = ensureExternalTable(tableId);
  table.set('input', serialized);
}

/**
 * Get output data from _io.output
 * @returns {*} JavaScript object/value from Lua
 */
export function getOutput() {
  const tableId = getIoTableId();
  const table = externalTables.get(tableId);
  if (!table) return null;
  
  const serialized = table.get('output');
  if (!serialized) return null;
  
  return deserializeObject(serialized);
}

/**
 * Set metadata for _io.meta
 * @param {*} meta - Metadata object to send to Lua
 */
export function setMetadata(meta) {
  const tableId = getIoTableId();
  const serialized = serializeObject(meta);
  const table = ensureExternalTable(tableId);
  table.set('meta', serialized);
}

/**
 * Clear all _io table contents (input, output, meta)
 */
export function clearIo() {
  if (!wasmInstance) return;
  
  wasmInstance.exports.clear_io_table?.();
  
  // Also clear from JavaScript side
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
 * Enable or disable legacy "Memory" name alias
 * @param {boolean} enabled - Whether to allow accessing _home via "Memory" name
 */
export function setMemoryAliasEnabled(enabled) {
  memoryAliasEnabled = enabled;
  if (enabled) {
    console.warn('[Deprecated] "Memory" table name alias enabled - consider migrating to "_home"');
  }
}

export default {
  load,
  init,
  compute,
  getBufferPtr,
  getBufferSize,
  getMemoryStats,
  runGc,
  readBuffer,
  readResult,
  writeBuffer,
  saveState,
  loadState,
  clearPersistedState,
  getTableInfo,
  getMemoryTableId,
  setMemoryAliasEnabled,
  // _io table API
  getIoTableId,
  setInput,
  getOutput,
  setMetadata,
  clearIo
};
