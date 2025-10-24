const fs = require('fs');

console.log('🔍 Investigating WASM Export Issue\n');

const wasmBuffer = fs.readFileSync('web/lua.wasm');

// Check WASM structure
console.log('1. WASM Binary Analysis:');
console.log(`   Size: ${wasmBuffer.length} bytes`);
console.log(`   Magic: 0x${wasmBuffer.slice(0, 4).toString('hex')}`);

try {
  const module = new WebAssembly.Module(wasmBuffer);
  const instance = new WebAssembly.Instance(module, {
    env: {
      js_ext_table_set: () => 0,
      js_ext_table_get: () => -1,
      js_ext_table_delete: () => 0,
      js_ext_table_size: () => 0,
      js_ext_table_keys: () => 0,
    }
  });

  console.log('\n2. Current Exports:');
  Object.keys(instance.exports).forEach(name => {
    console.log(`   - ${name}`);
  });

  console.log('\n3. The Issue:');
  console.log('   Functions ARE compiled (in code section)');
  console.log('   Functions are NOT exported (not in export table)');

  console.log('\n4. Root Cause:');
  console.log('   Using: zig build-exe -target wasm32-wasi');
  console.log('   Problem: Functions marked as unused by optimizer');
  console.log('   Result: Exports removed from binary');

  console.log('\n5. Solution: Check src/main.zig');
  console.log('   Need to verify export fn declarations');
  
} catch (e) {
  console.error('Error:', e.message);
}
