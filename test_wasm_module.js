const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Lua WASM Module\n');

// Read WASM binary
const wasmPath = path.join(__dirname, 'web', 'lua.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);

console.log(`📦 WASM Binary: ${(wasmBuffer.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`✅ Binary loaded from: ${wasmPath}\n`);

// Create minimal imports for external table functions
const imports = {
  env: {
    js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
      console.log(`  [ext_table] SET table=${table_id}, key_len=${key_len}, val_len=${val_len}`);
      return 0;
    },
    js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, val_len) => {
      console.log(`  [ext_table] GET table=${table_id}, key_len=${key_len}`);
      return -1; // Not found
    },
    js_ext_table_delete: (table_id, key_ptr, key_len) => {
      console.log(`  [ext_table] DELETE table=${table_id}, key_len=${key_len}`);
      return 0;
    },
    js_ext_table_size: (table_id) => {
      return 0;
    },
    js_ext_table_keys: (table_id, buf_ptr, buf_len) => {
      return 0;
    },
  },
};

try {
  console.log('📥 Instantiating WebAssembly module...\n');
  const wasmModule = new WebAssembly.Module(wasmBuffer);
  const instance = new WebAssembly.Instance(wasmModule, imports);
  
  const exports = instance.exports;
  
  console.log('✅ Module instantiated successfully!\n');
  console.log('📋 Exported Functions:\n');
  
  // Check each expected export
  const expectedExports = [
    'memory',
    'init',
    'compute',
    'get_buffer_ptr',
    'get_buffer_size',
    'get_memory_stats',
    'run_gc'
  ];
  
  let foundCount = 0;
  const exportedNames = Object.keys(exports);
  
  expectedExports.forEach(name => {
    const exists = name in exports;
    const symbol = exists ? '✅' : '❌';
    const type = exists ? typeof exports[name] : 'missing';
    console.log(`${symbol} ${name.padEnd(20)} : ${type}`);
    if (exists) foundCount++;
  });
  
  console.log(`\n📊 Found ${foundCount}/${expectedExports.length} expected exports\n`);
  
  // Test init()
  if (typeof exports.init === 'function') {
    console.log('🧪 Testing init()...');
    try {
      const result = exports.init();
      console.log(`✅ init() returned: ${result}\n`);
    } catch (e) {
      console.log(`❌ init() failed: ${e.message}\n`);
    }
  }
  
  // Test get_buffer_ptr()
  if (typeof exports.get_buffer_ptr === 'function') {
    console.log('🧪 Testing get_buffer_ptr()...');
    try {
      const ptr = exports.get_buffer_ptr();
      console.log(`✅ get_buffer_ptr() returned: ${ptr}\n`);
    } catch (e) {
      console.log(`❌ get_buffer_ptr() failed: ${e.message}\n`);
    }
  }
  
  // Test get_buffer_size()
  if (typeof exports.get_buffer_size === 'function') {
    console.log('🧪 Testing get_buffer_size()...');
    try {
      const size = exports.get_buffer_size();
      console.log(`✅ get_buffer_size() returned: ${size} bytes\n`);
    } catch (e) {
      console.log(`❌ get_buffer_size() failed: ${e.message}\n`);
    }
  }
  
  // Test compute() if available
  if (typeof exports.compute === 'function' && exports.memory) {
    console.log('🧪 Testing compute() with Lua code...');
    try {
      const bufPtr = exports.get_buffer_ptr();
      const memory = new Uint8Array(exports.memory.buffer);
      
      // Write simple Lua code: "return 1 + 1"
      const code = 'return 1 + 1';
      for (let i = 0; i < code.length; i++) {
        memory[bufPtr + i] = code.charCodeAt(i);
      }
      
      console.log(`  Input code: "${code}"`);
      const result = exports.compute(bufPtr, code.length);
      console.log(`✅ compute() returned: ${result}`);
      
      // Try to read output
      if (result > 0) {
        const output = new TextDecoder().decode(memory.slice(bufPtr, bufPtr + result));
        console.log(`  Output: "${output}"\n`);
      } else {
        console.log(`  (No output data)\n`);
      }
    } catch (e) {
      console.log(`❌ compute() failed: ${e.message}\n`);
    }
  }
  
  console.log('✅ Module tests completed successfully!\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
