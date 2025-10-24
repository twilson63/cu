const fs = require('fs');

console.log('Testing different WASM binaries for exports...\n');

const files = ['web/lua.wasm', 'web/lua-optimized.wasm'];

files.forEach(filePath => {
  if (!fs.existsSync(filePath)) return;
  
  console.log(`📄 Testing: ${filePath}`);
  
  try {
    const buffer = fs.readFileSync(filePath);
    const module = new WebAssembly.Module(buffer);
    const instance = new WebAssembly.Instance(module, {
      env: {
        js_ext_table_set: () => 0,
        js_ext_table_get: () => -1,
        js_ext_table_delete: () => 0,
        js_ext_table_size: () => 0,
        js_ext_table_keys: () => 0,
      }
    });
    
    const exports = Object.keys(instance.exports);
    console.log(`   Exports: ${exports.join(', ')}`);
    
    if (exports.includes('compute')) {
      console.log('   ✅ compute() is available!');
      try {
        const result = instance.exports.compute(0, 10);
        console.log(`   compute(0, 10) returned: ${result}`);
      } catch (e) {
        console.log(`   compute() call error: ${e.message}`);
      }
    } else {
      console.log('   ❌ compute() NOT in exports');
    }
  } catch (e) {
    console.log(`   Error: ${e.message}`);
  }
  console.log();
});
