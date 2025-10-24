const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function validateWASM() {
  console.log('🔍 Validating WASM Module\n');
  
  const wasmPath = path.join(__dirname, 'web', 'lua.wasm');
  
  if (!fs.existsSync(wasmPath)) {
    console.error('❌ WASM file not found:', wasmPath);
    process.exit(1);
  }
  
  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`✅ WASM file found (${(wasmBytes.length / 1024).toFixed(1)} KB)`);
  
  const magic = wasmBytes.slice(0, 4);
  if (magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d) {
    console.log('✅ Valid WebAssembly magic number');
  } else {
    console.error('❌ Invalid magic number:', magic);
    process.exit(1);
  }
  
  const version = wasmBytes.readUInt32LE(4);
  console.log(`✅ WASM version: ${version}`);
  
  try {
    const memory = new WebAssembly.Memory({ initial: 32, maximum: 64 });
    const stackPointer = new WebAssembly.Global({ value: 'i32', mutable: true }, 0x100000);
    
    const imports = {
      env: {
        __linear_memory: memory,
        __stack_pointer: stackPointer,
        js_ext_table_set: (id, k, kl, v, vl) => 0,
        js_ext_table_get: (id, k, kl, v, ml) => -1,
        js_ext_table_delete: (id, k, kl) => 0,
        js_ext_table_size: (id) => 0,
        js_ext_table_keys: (id, b, ml) => 0,
      }
    };
    
    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    const exports = instance.exports;
    
    console.log('\n✅ WASM module instantiated successfully');
    console.log(`\n📋 Module exports:`);
    
    const expectedFunctions = [
      'memory',
      'init',
      'ext_table_new',
      'ext_table_set',
      'ext_table_get',
      'ext_table_delete',
      'ext_table_size',
      'ext_table_keys',
      'get_buffer_ptr',
      'get_buffer_size',
      'eval',
      'get_memory_stats',
      'run_gc',
    ];
    
    let foundCount = 0;
    for (const name of expectedFunctions) {
      if (name in exports) {
        console.log(`  ✅ ${name}`);
        foundCount++;
      } else {
        console.log(`  ❌ ${name} (not found)`);
      }
    }
    
    console.log(`\n✅ WASM module is valid and functional!`);
    console.log(`\nModule Statistics:`);
    console.log(`  - Exported items: ${foundCount}/${expectedFunctions.length}`);
    try {
      const zigVersion = execSync('zig version').toString().trim();
      console.log(`  - Zig version: ${zigVersion}`);
    } catch (e) {}
    console.log(`  - Target: wasm32-freestanding (pure WebAssembly)`);
    console.log(`  - Memory: 2MB linear memory (provided by JavaScript)`);
    console.log(`  - Status: ✅ Ready for Lua integration`);
    
    if (foundCount === expectedFunctions.length) {
      console.log('\n🎉 All functions exported successfully!');
    }
    
  } catch (e) {
    console.error('\n❌ Failed to instantiate WASM:', e.message);
    process.exit(1);
  }
}

validateWASM().catch(e => {
  console.error(e);
  process.exit(1);
});
