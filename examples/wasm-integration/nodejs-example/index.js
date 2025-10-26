// Node.js bare WASM integration example for lua.wasm
//
// This example demonstrates:
// - Using Node.js built-in WebAssembly API (no frameworks)
// - Direct WASM memory access
// - Implementing all 5 host functions
// - Difference from high-level lua-api.js wrapper
// - Minimal dependencies (zero npm packages!)

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// External table storage
const externalTables = new Map();

/**
 * Get or create an external table by ID
 */
function getOrCreateTable(tableId) {
  if (!externalTables.has(tableId)) {
    externalTables.set(tableId, new Map());
  }
  return externalTables.get(tableId);
}

/**
 * Host function: js_ext_table_set
 * Store a key-value pair in an external table
 */
function jsExtTableSet(tableId, keyPtr, keyLen, valPtr, valLen) {
  const memory = wasmInstance.exports.memory;
  const memoryView = new Uint8Array(memory.buffer);

  // Read key from WASM memory
  const keyBytes = memoryView.slice(keyPtr, keyPtr + keyLen);
  const key = new TextDecoder().decode(keyBytes);

  // Read value from WASM memory (keep as bytes)
  const value = new Uint8Array(memoryView.slice(valPtr, valPtr + valLen));

  // Store in external table
  const table = getOrCreateTable(tableId);
  table.set(key, value);

  return 0; // Success
}

/**
 * Host function: js_ext_table_get
 * Retrieve a value from an external table
 */
function jsExtTableGet(tableId, keyPtr, keyLen, valPtr, maxLen) {
  const memory = wasmInstance.exports.memory;
  const memoryView = new Uint8Array(memory.buffer);

  // Read key from WASM memory
  const keyBytes = memoryView.slice(keyPtr, keyPtr + keyLen);
  const key = new TextDecoder().decode(keyBytes);

  // Get table and value
  const table = externalTables.get(tableId);
  if (!table) {
    return -1; // Table not found
  }

  const value = table.get(key);
  if (!value) {
    return -1; // Key not found
  }

  // Check buffer size
  if (value.length > maxLen) {
    return -1; // Buffer too small
  }

  // Write value to WASM memory
  memoryView.set(value, valPtr);

  return value.length;
}

/**
 * Host function: js_ext_table_delete
 * Delete a key from an external table
 */
function jsExtTableDelete(tableId, keyPtr, keyLen) {
  const memory = wasmInstance.exports.memory;
  const memoryView = new Uint8Array(memory.buffer);

  // Read key from WASM memory
  const keyBytes = memoryView.slice(keyPtr, keyPtr + keyLen);
  const key = new TextDecoder().decode(keyBytes);

  // Get table and delete key
  const table = externalTables.get(tableId);
  if (table) {
    table.delete(key);
  }

  return 0; // Success
}

/**
 * Host function: js_ext_table_size
 * Get the number of entries in an external table
 */
function jsExtTableSize(tableId) {
  const table = externalTables.get(tableId);
  return table ? table.size : 0;
}

/**
 * Host function: js_ext_table_keys
 * Get all keys from an external table (newline-separated)
 */
function jsExtTableKeys(tableId, bufPtr, maxLen) {
  const memory = wasmInstance.exports.memory;
  const memoryView = new Uint8Array(memory.buffer);

  const table = externalTables.get(tableId);
  if (!table) {
    return -1; // Table not found
  }

  // Serialize keys
  const keys = Array.from(table.keys());
  const serialized = keys.join('\n');
  const bytes = new TextEncoder().encode(serialized);

  if (bytes.length > maxLen) {
    return -1; // Buffer too small
  }

  // Write to WASM memory
  memoryView.set(bytes, bufPtr);

  return bytes.length;
}

// Global WASM instance (for host functions to access)
let wasmInstance = null;

/**
 * Load lua.wasm from various possible locations
 */
async function loadWasmFile() {
  const paths = [
    join(__dirname, '../../../web/lua.wasm'),
    join(__dirname, '../../web/lua.wasm'),
    join(__dirname, './lua.wasm'),
  ];

  for (const path of paths) {
    try {
      const buffer = await readFile(path);
      console.log(`✓ Loaded lua.wasm from: ${path}\n`);
      return buffer;
    } catch (err) {
      // Continue to next path
    }
  }

  throw new Error(`Could not find lua.wasm in any of: ${paths.join(', ')}`);
}

/**
 * Execute Lua code and display results
 */
function executeLua(code) {
  console.log(`Lua code: ${code}`);

  const exports = wasmInstance.exports;
  const memory = new Uint8Array(exports.memory.buffer);

  // Get buffer info
  const bufferPtr = exports.get_buffer_ptr();
  const bufferSize = exports.get_buffer_size();

  // Encode code
  const codeBytes = new TextEncoder().encode(code);
  if (codeBytes.length > bufferSize) {
    throw new Error('Code too large for buffer');
  }

  // Write code to buffer
  memory.set(codeBytes, bufferPtr);

  // Execute
  const resultLen = exports.compute(bufferPtr, codeBytes.length);

  // Handle result
  if (resultLen < 0) {
    // Error
    const errorLen = -resultLen - 1;
    const errorBytes = memory.slice(bufferPtr, bufferPtr + errorLen);
    const errorMsg = new TextDecoder().decode(errorBytes);
    console.log(`✗ Lua error: ${errorMsg}`);
  } else if (resultLen > 0) {
    // Success
    const resultBytes = memory.slice(bufferPtr, bufferPtr + resultLen);

    // First 4 bytes are output length (little-endian)
    const outputLen = new DataView(resultBytes.buffer, resultBytes.byteOffset, 4).getUint32(0, true);

    if (outputLen > 0) {
      const outputBytes = resultBytes.slice(4, 4 + outputLen);
      const output = new TextDecoder().decode(outputBytes);
      console.log(`Output: ${output.trim()}`);
    }

    // Parse return value (simplified)
    if (resultBytes.length > 4 + outputLen) {
      const returnBytes = resultBytes.slice(4 + outputLen);
      console.log(`✓ Result: ${returnBytes.length} bytes returned`);

      // Try to parse simple types
      if (returnBytes.length >= 2) {
        const typeTag = returnBytes[0];
        
        if (typeTag === 0x03 && returnBytes.length >= 9) {
          // Number
          const view = new DataView(returnBytes.buffer, returnBytes.byteOffset + 1, 8);
          const num = view.getFloat64(0, true);
          console.log(`  Number value: ${num}`);
        } else if (typeTag === 0x04 && returnBytes.length >= 5) {
          // String
          const view = new DataView(returnBytes.buffer, returnBytes.byteOffset + 1, 4);
          const strLen = view.getUint32(0, true);
          if (returnBytes.length >= 5 + strLen) {
            const str = new TextDecoder().decode(returnBytes.slice(5, 5 + strLen));
            console.log(`  String value: '${str}'`);
          }
        }
      }
    }
  } else {
    console.log('✓ No result');
  }
}

/**
 * Display memory statistics
 */
function showMemoryStats() {
  const exports = wasmInstance.exports;
  const bufferPtr = exports.get_buffer_ptr();

  // Call get_memory_stats
  exports.get_memory_stats(bufferPtr);

  // Read stats (12 bytes: 3 × u32)
  const memory = new Uint8Array(exports.memory.buffer);
  const statsBytes = memory.slice(bufferPtr, bufferPtr + 12);
  const view = new DataView(statsBytes.buffer, statsBytes.byteOffset, 12);

  const ioBufferSize = view.getUint32(0, true);
  const luaMemoryUsed = view.getUint32(4, true);
  const wasmPages = view.getUint32(8, true);

  console.log('Memory Statistics:');
  console.log(`  I/O Buffer Size: ${ioBufferSize} bytes (${ioBufferSize / 1024} KB)`);
  console.log(`  Lua Memory Used: ${luaMemoryUsed} bytes`);
  console.log(`  WASM Pages: ${wasmPages} (${wasmPages * 64 / 1024} MB)`);
  console.log(`  Total WASM Memory: ${wasmPages * 65536} bytes (${wasmPages * 64 / 1024} MB)`);
}

/**
 * Main entry point
 */
async function main() {
  console.log('Lua WASM Integration Example (Node.js Bare WASM)');
  console.log('=================================================\n');

  console.log('NOTE: This example uses Node.js built-in WebAssembly API directly.');
  console.log('No npm packages required!\n');

  // Load WASM file
  const wasmBuffer = await loadWasmFile();

  // Create import object with host functions
  const imports = {
    env: {
      js_ext_table_set: jsExtTableSet,
      js_ext_table_get: jsExtTableGet,
      js_ext_table_delete: jsExtTableDelete,
      js_ext_table_size: jsExtTableSize,
      js_ext_table_keys: jsExtTableKeys,
    },
  };

  // Instantiate WASM module
  const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
  wasmInstance = instance;

  console.log('✓ WASM module instantiated\n');

  // Initialize Lua VM
  console.log('Initializing Lua VM...');
  const initResult = instance.exports.init();
  if (initResult !== 0) {
    throw new Error(`Lua initialization failed: ${initResult}`);
  }
  console.log('✓ Lua VM initialized successfully\n');

  // Get buffer info
  const bufferPtr = instance.exports.get_buffer_ptr();
  const bufferSize = instance.exports.get_buffer_size();

  console.log('Buffer info:');
  console.log(`  Pointer: 0x${bufferPtr.toString(16)}`);
  console.log(`  Size: ${bufferSize} bytes\n`);

  // Run examples
  console.log('=== Example 1: Basic Arithmetic ===');
  executeLua('return 2 + 2');
  console.log();

  console.log('=== Example 2: String Operations ===');
  executeLua("return 'Hello ' .. 'from Lua!'");
  console.log();

  console.log('=== Example 3: External Table Persistence (1st call) ===');
  executeLua('_home.counter = (_home.counter or 0) + 1; return _home.counter');
  console.log();

  console.log('=== Example 4: External Table Persistence (2nd call) ===');
  executeLua('_home.counter = (_home.counter or 0) + 1; return _home.counter');
  console.log();

  console.log('=== Example 5: Print Output ===');
  executeLua("print('Hello from Lua!'); return 'done'");
  console.log();

  console.log('=== Example 6: Error Handling ===');
  executeLua('return 1 / 0');
  console.log();

  console.log('=== Example 7: Memory Statistics ===');
  showMemoryStats();
  console.log();

  // Show external table contents
  console.log('=== External Table Contents ===');
  for (const [tableId, table] of externalTables.entries()) {
    console.log(`Table ID ${tableId}: ${table.size} entries`);
    for (const [key, value] of table.entries()) {
      console.log(`  '${key}': ${value.length} bytes`);
    }
  }

  console.log('\n✓ All examples completed successfully!');
  console.log('\nKey Differences from lua-api.js:');
  console.log('  - Direct WebAssembly.instantiate() instead of wrapper');
  console.log('  - Manual memory management with Uint8Array views');
  console.log('  - Direct access to WASM exports (init, compute, etc.)');
  console.log('  - No deserialization helpers (raw bytes)');
  console.log('  - Zero dependencies (only Node.js built-ins)');
}

// Run main and handle errors
main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
