#!/usr/bin/env node

/**
 * Backward Compatibility Test
 * Verifies that Memory and _home both work and point to the same table
 */

const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🧪 Backward Compatibility Test\n');
  
  // Load WASM
  const wasmPath = path.join(__dirname, 'web/lua.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);
  
  // Simple imports for external table bridge
  const externalTables = new Map();
  let nextTableId = 1;
  
  const imports = {
    env: {
      js_time_now: () => Date.now() / 1000,
      js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
        if (!externalTables.has(tableId)) {
          externalTables.set(tableId, new Map());
        }
        const key = readString(keyPtr, keyLen);
        const value = readBytes(valPtr, valLen);
        externalTables.get(tableId).set(key, value);
        return 0;
      },
      js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
        if (!externalTables.has(tableId)) return -1;
        const key = readString(keyPtr, keyLen);
        const value = externalTables.get(tableId).get(key);
        if (!value) return -1;
        writeBytes(valPtr, value, maxLen);
        return value.length;
      },
      js_ext_table_delete: (tableId, keyPtr, keyLen) => {
        if (!externalTables.has(tableId)) return -1;
        const key = readString(keyPtr, keyLen);
        externalTables.get(tableId).delete(key);
        return 0;
      },
      js_ext_table_size: (tableId) => {
        if (!externalTables.has(tableId)) return 0;
        return externalTables.get(tableId).size;
      },
      js_ext_table_keys: (tableId, bufPtr, maxLen) => {
        if (!externalTables.has(tableId)) return -1;
        const keys = Array.from(externalTables.get(tableId).keys()).join('\n');
        const bytes = Buffer.from(keys, 'utf-8');
        writeBytes(bufPtr, bytes, maxLen);
        return bytes.length;
      },
    }
  };
  
  const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
  const wasm = instance.exports;
  const memory = wasm.memory;
  
  function readString(ptr, len) {
    const bytes = new Uint8Array(memory.buffer, ptr, len);
    return Buffer.from(bytes).toString('utf-8');
  }
  
  function readBytes(ptr, len) {
    return new Uint8Array(memory.buffer, ptr, len);
  }
  
  function writeBytes(ptr, bytes, maxLen) {
    const len = Math.min(bytes.length, maxLen);
    const dest = new Uint8Array(memory.buffer, ptr, len);
    dest.set(bytes.slice(0, len));
  }
  
  function compute(code) {
    const bufPtr = wasm.get_buffer_ptr();
    const bufSize = wasm.get_buffer_size();
    const buffer = new Uint8Array(memory.buffer, bufPtr, bufSize);
    
    const codeBytes = Buffer.from(code, 'utf-8');
    if (codeBytes.length > bufSize) {
      throw new Error('Code too large');
    }
    
    buffer.set(codeBytes);
    const result = wasm.compute(bufPtr, codeBytes.length);
    
    if (result < 0) {
      const errorLen = Math.abs(result) - 1;
      const errorBytes = buffer.slice(0, errorLen);
      throw new Error(Buffer.from(errorBytes).toString('utf-8'));
    }
    
    const output = buffer.slice(0, result);
    return Buffer.from(output).toString('utf-8');
  }
  
  // Initialize
  console.log('Initializing Lua WASM...');
  const initResult = wasm.init();
  if (initResult !== 0) {
    throw new Error('Failed to initialize Lua');
  }
  console.log('✓ Initialized\n');
  
  // Test 1: Both exist
  console.log('Test 1: Checking if both _home and Memory exist...');
  try {
    compute('assert(_home ~= nil, "_home should exist")');
    compute('assert(Memory ~= nil, "Memory should exist")');
    console.log('✅ Both _home and Memory exist\n');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
  
  // Test 2: Same table
  console.log('Test 2: Verifying they are the same table...');
  try {
    compute('assert(rawequal(_home, Memory), "_home and Memory must be same table")');
    console.log('✅ _home and Memory are the same table\n');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
  
  // Test 3: Write via _home, read via Memory
  console.log('Test 3: Write via _home, read via Memory...');
  try {
    compute('_home.test_value = "hello"');
    compute('assert(Memory.test_value == "hello")');
    console.log('✅ Cross-name access works\n');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
  
  // Test 4: Function storage
  console.log('Test 4: Function storage via both names...');
  try {
    compute('function _home.double(x) return x * 2 end');
    compute('assert(Memory.double(5) == 10)');
    console.log('✅ Functions work via both names\n');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
  
  // Test 5: Counter increment
  console.log('Test 5: Counter operations...');
  try {
    compute('_home.counter = 0');
    compute('_home.counter = _home.counter + 1');
    compute('Memory.counter = Memory.counter + 1');
    compute('assert(_home.counter == 2, "Counter should be 2, got: " .. tostring(_home.counter))');
    console.log('✅ Counter operations work correctly\n');
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
  
  // Get table IDs
  const homeTableId = wasm.get_memory_table_id();
  console.log(`ℹ️  _home table ID: ${homeTableId}`);
  console.log(`ℹ️  External tables: ${externalTables.size}`);
  
  console.log('\n🎉 All backward compatibility tests passed!');
  console.log('\n✅ VERDICT: Migration successful, full backward compatibility maintained');
}

main().catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
