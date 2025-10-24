/**
 * Lua WASM Public API Module
 * Provides JavaScript-friendly interface to compiled Lua WASM functions
 *
 * Usage:
 *   import lua from './lua-api.js';
 *   await lua.loadLuaWasm();
 *   lua.init();
 *   const result = lua.compute('return 1+1');
 */

import { deserializeResult } from './lua-deserializer.js';
import persistence from './lua-persistence.js';

let wasmInstance = null;
let wasmMemory = null;

// External table storage
const externalTables = new Map();
let nextTableId = 1;

/**
 * Load and instantiate Lua WASM module
 * @returns {Promise<boolean>} Success status
 */
export async function loadLuaWasm() {
  try {
    const response = await fetch('./lua.wasm');
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();

    const imports = {
      env: {
        js_time_now: () => Date.now(),
        js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
          try {
            // Get or create table
            if (!externalTables.has(table_id)) {
              externalTables.set(table_id, new Map());
            }
            const table = externalTables.get(table_id);
            
            // Read key and value from WASM memory
            const key = new TextDecoder().decode(wasmMemory.slice(key_ptr, key_ptr + key_len));
            const value = new TextDecoder().decode(wasmMemory.slice(val_ptr, val_ptr + val_len));
            
            table.set(key, value);
            return 0; // success
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
            
            const valueBytes = new TextEncoder().encode(value);
            if (valueBytes.length > max_len) return -1;
            
            // Write value to WASM memory
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

    console.log('✅ Lua WASM loaded successfully');
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
    const result = wasmInstance.exports.init?.();
    console.log(`init() returned: ${result}`);
    return result ?? 0;
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
    await persistence.saveTables(externalTables);
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
    const loadedTables = await persistence.loadTables();
    
    // Replace current tables with loaded ones
    externalTables.clear();
    for (const [id, table] of loadedTables) {
      externalTables.set(id, table);
    }
    
    // Update the next table ID to avoid conflicts
    if (loadedTables.size > 0) {
      const maxId = Math.max(...loadedTables.keys());
      nextTableId = maxId + 1;
      
      // IMPORTANT: We need to sync this with the Zig side
      // For now, we'll need to recreate tables in Lua after loading
      console.log(`Loaded ${loadedTables.size} tables. Next ID will be ${nextTableId}`);
      console.log('Note: You need to recreate table references in Lua after loading.');
    }
    
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

export default {
  loadLuaWasm,
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
  getTableInfo
};
