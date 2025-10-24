const fs = require('fs');
const wasmBuffer = fs.readFileSync('./web/lua2.wasm');

const wasmModule = new WebAssembly.Module(wasmBuffer);

const imports = {
    env: {
        js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => 0,
        js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => 0,
        js_ext_table_delete: (tableId, keyPtr, keyLen) => 0,
        js_ext_table_size: (tableId) => 0,
        js_ext_table_keys: (tableId, bufPtr, maxLen) => 0,
    }
};

try {
    const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
    const exports = wasmInstance.exports;

    console.log('\n' + '='.repeat(60));
    console.log('WASM EXPORTS ANALYSIS (lua2.wasm - build-lib)');
    console.log('='.repeat(60) + '\n');

    console.log('Total exported items:', Object.keys(exports).length);
    console.log('\nExported Functions:');
    console.log('-'.repeat(60));

    const requiredFunctions = [
        'init', 'compute', 'get_buffer_ptr', 'get_buffer_size',
        'get_memory_stats', 'run_gc'
    ];

    const foundFunctions = {};

    for (const [name, value] of Object.entries(exports)) {
        const type = typeof value;
        const isFunction = type === 'function';
        
        if (requiredFunctions.includes(name)) {
            foundFunctions[name] = isFunction;
            console.log(`  ✅ ${name.padEnd(25)} [${type}]`);
        } else {
            console.log(`  ⚠️  ${name.padEnd(25)} [${type}]`);
        }
    }

    console.log('\nFound: ' + Object.values(foundFunctions).filter(v => v).length);
    console.log('Has _start: ' + ('_start' in exports));

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
