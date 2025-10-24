// Quick test to verify function serialization works
import fs from 'fs';

const wasmBytes = fs.readFileSync('./web/lua.wasm');
let memArray = null;

const imports = {
  env: {
    js_time_now: () => Date.now(),
    js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
      console.log(`js_ext_table_set called: table=${table_id}, key_len=${key_len}, val_len=${val_len}`);
      
      // Read the value to check if it's serialized function bytecode
      const valueBytes = new Uint8Array(memArray.buffer, val_ptr, val_len);
      console.log('  First bytes of value:', Array.from(valueBytes.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')));
      
      // Check serialization type
      if (valueBytes[0] === 0x05) {
        console.log('  ✅ Function bytecode detected (type 0x05)');
        const len = valueBytes[1] | (valueBytes[2] << 8) | (valueBytes[3] << 16) | (valueBytes[4] << 24);
        console.log(`  Bytecode length: ${len} bytes`);
      } else if (valueBytes[0] === 0x06) {
        console.log('  ✅ Function reference detected (type 0x06)');
      } else {
        console.log(`  Value type: 0x${valueBytes[0].toString(16)}`);
      }
      
      return 0;
    },
    js_ext_table_get: () => -1,
    js_ext_table_delete: () => 0,
    js_ext_table_size: () => 0,
    js_ext_table_keys: () => 0,
  }
};

async function test() {
  console.log('Testing function serialization in WASM...\n');
  
  const module = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(module, imports);
  
  // Use the instance's memory
  memArray = new Uint8Array(instance.exports.memory.buffer);
  
  console.log('Initializing Lua...');
  const initResult = instance.exports.init();
  console.log(`Init result: ${initResult}\n`);
  
  // Test code that stores a function in Memory
  const testCode = `
-- Store a simple Lua function in Memory
Memory.test = function(x) 
  return x * 2 
end

-- Store a C function reference
Memory.print_func = print

return "Functions stored"
`;
  
  const encoder = new TextEncoder();
  const codeBytes = encoder.encode(testCode);
  const bufferPtr = instance.exports.get_buffer_ptr();
  
  // Copy code to buffer
  for (let i = 0; i < codeBytes.length; i++) {
    memArray[bufferPtr + i] = codeBytes[i];
  }
  
  console.log('Executing Lua code to store functions...\n');
  const result = instance.exports.compute(bufferPtr, codeBytes.length);
  
  if (result > 0) {
    const output = new TextDecoder().decode(memArray.slice(bufferPtr, bufferPtr + result));
    console.log('Output:', output);
  } else if (result < 0) {
    const error = new TextDecoder().decode(memArray.slice(bufferPtr, bufferPtr + Math.abs(result)));
    console.log('Error:', error);
  }
}

test().catch(console.error);