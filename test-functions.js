const fs = require('fs');
const path = require('path');

async function testFunctions() {
  const wasmPath = path.join(__dirname, 'web', 'lua.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);
  
  const memory = new WebAssembly.Memory({ initial: 32, maximum: 64 });
  const stackPointer = new WebAssembly.Global({ value: 'i32', mutable: true }, 0x100000);
  
  const imports = {
    env: {
      __linear_memory: memory,
      __stack_pointer: stackPointer,
      js_ext_table_set: (id, k, kl, v, vl) => { console.log('  Called js_ext_table_set'); return 0; },
      js_ext_table_get: (id, k, kl, v, ml) => { console.log('  Called js_ext_table_get'); return -1; },
      js_ext_table_delete: (id, k, kl) => { console.log('  Called js_ext_table_delete'); return 0; },
      js_ext_table_size: (id) => { console.log('  Called js_ext_table_size'); return 0; },
      js_ext_table_keys: (id, b, ml) => { console.log('  Called js_ext_table_keys'); return 0; },
    }
  };
  
  const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
  const exp = instance.exports;
  
  console.log('🧪 Testing WASM Functions\n');
  
  const tests = [
    { name: 'init', fn: () => exp.init?.() },
    { name: 'ext_table_new', fn: () => exp.ext_table_new?.() },
    { name: 'get_buffer_ptr', fn: () => exp.get_buffer_ptr?.() },
    { name: 'get_buffer_size', fn: () => exp.get_buffer_size?.() },
    { name: 'eval', fn: () => exp.eval?.(5) },
    { name: 'run_gc', fn: () => exp.run_gc?.() },
  ];
  
  for (const test of tests) {
    try {
      if (typeof exp[test.name] === 'function') {
        console.log(`✅ ${test.name}()`);
        const result = test.fn();
        if (result !== undefined) {
          console.log(`   → returned: ${result}`);
        }
      } else {
        console.log(`❌ ${test.name} not found`);
      }
    } catch (e) {
      console.log(`⚠️  ${test.name} error: ${e.message}`);
    }
  }
}

testFunctions().catch(console.error);
