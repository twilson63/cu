// wasm-loader.js - Load WASM module with proper imports

async function loadWasmModule(wasmPath) {
  const memory = new WebAssembly.Memory({ initial: 32, maximum: 64 });
  const stackPointer = new WebAssembly.Global(
    { value: 'i32', mutable: true },
    0x100000
  );

  const imports = {
    env: {
      __linear_memory: memory,
      __stack_pointer: stackPointer,
      js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
        console.log(`js_ext_table_set called: tableId=${tableId}`);
        return 0;
      },
      js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
        console.log(`js_ext_table_get called: tableId=${tableId}`);
        return -1;
      },
      js_ext_table_delete: (tableId, keyPtr, keyLen) => {
        console.log(`js_ext_table_delete called: tableId=${tableId}`);
        return 0;
      },
      js_ext_table_size: (tableId) => {
        console.log(`js_ext_table_size called: tableId=${tableId}`);
        return 0;
      },
      js_ext_table_keys: (tableId, bufPtr, maxLen) => {
        console.log(`js_ext_table_keys called: tableId=${tableId}`);
        return 0;
      },
    }
  };

  try {
    const response = await fetch(wasmPath);
    const wasmBuffer = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
    
    return {
      instance,
      memory,
      exports: instance.exports
    };
  } catch (error) {
    console.error('Failed to load WASM:', error);
    throw error;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadWasmModule };
}
