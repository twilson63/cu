const fs = require('fs');

console.log('🔍 DETAILED WASM EXPORT INSPECTION\n');

const wasmPath = './web/lua.wasm';
const buffer = fs.readFileSync(wasmPath);

// Parse WASM binary structure
const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);

// Check magic number
const magic = view.getUint32(0, true);
console.log(`Magic Number: 0x${magic.toString(16).padStart(8, '0')} ${magic === 0x6d736100 ? '✅ Valid WASM' : '❌ Invalid'}\n`);

// Detailed memory inspection
console.log('📊 WASM Module Structure:\n');
console.log(`File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (${buffer.length.toLocaleString()} bytes)\n`);

// Load and instantiate
const imports = {
  env: {
    js_ext_table_set: () => 0,
    js_ext_table_get: () => -1,
    js_ext_table_delete: () => 0,
    js_ext_table_size: () => 0,
    js_ext_table_keys: () => 0,
  },
};

try {
  const module = new WebAssembly.Module(buffer);
  const instance = new WebAssembly.Instance(module, imports);
  
  console.log('✅ Module instantiated\n');
  
  // Get all exports
  const exports = instance.exports;
  const exportNames = Object.keys(exports);
  
  console.log(`📤 Total Exports: ${exportNames.length}\n`);
  console.log('Export Details:\n');
  
  exportNames.forEach((name, idx) => {
    const exp = exports[name];
    let type = typeof exp;
    let details = '';
    
    if (type === 'object') {
      if (exp instanceof WebAssembly.Memory) {
        const pages = exp.buffer.byteLength / 65536;
        details = `- Memory: ${pages} pages (${(exp.buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`;
      }
    } else if (type === 'function') {
      details = '- Callable function';
    } else if (type === 'number') {
      details = `- Number: ${exp}`;
    }
    
    console.log(`  ${(idx + 1).toString().padStart(2)}) ${name.padEnd(25)} [${type.padEnd(8)}] ${details}`);
  });
  
  console.log('\n');
  
  // Check for expected functions
  console.log('🎯 Expected Functions:\n');
  const expected = ['init', 'compute', 'get_buffer_ptr', 'get_buffer_size', 'get_memory_stats', 'run_gc'];
  const found = expected.filter(name => name in exports);
  const missing = expected.filter(name => !(name in exports));
  
  if (found.length > 0) {
    console.log(`✅ Found (${found.length}):`);
    found.forEach(name => console.log(`   - ${name}`));
  }
  
  if (missing.length > 0) {
    console.log(`\n❌ Missing (${missing.length}):`);
    missing.forEach(name => console.log(`   - ${name}`));
  }
  
  console.log('\n');
  
  // Try to access memory if available
  if ('memory' in exports) {
    const memory = exports.memory;
    console.log('💾 Memory Details:\n');
    console.log(`  Size: ${(memory.buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Type: ${memory.constructor.name}`);
    console.log(`  Readable: ✅ Yes`);
    console.log(`  Pages: ${memory.buffer.byteLength / 65536}\n`);
  }
  
  // Status summary
  console.log('📋 STATUS SUMMARY:\n');
  console.log(`  Module Valid: ✅ Yes`);
  console.log(`  Module Instantiated: ✅ Yes`);
  console.log(`  Functions Exported: ${found.length > 0 ? '❌ No (1/5 expected)' : '❌ No'}`);
  console.log(`  Memory Available: ${('memory' in exports) ? '✅ Yes' : '❌ No'}`);
  console.log(`  Status: ${missing.length > 0 ? '⚠️ PHASE 6 NEEDED' : '✅ READY'}`);
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
}
