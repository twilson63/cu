const fs = require('fs');
const wasmBuffer = fs.readFileSync('./web/lua.wasm');

const wasmModule = new WebAssembly.Module(wasmBuffer);

// Minimal WASI implementation
const wasi_stubs = {
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    args_get: () => 0,
    args_sizes_get: () => 0,
    clock_time_get: () => 0,
    clock_res_get: () => 0,
    fd_write: () => 0,
    fd_read: () => 0,
    fd_close: () => 0,
    fd_seek: () => 0,
    fd_fdstat_get: () => 0,
    fd_prestat_get: () => 1,
    fd_prestat_dir_name: () => 0,
    fd_filestat_get: () => 0,
    proc_exit: () => {},
    path_open: () => 0,
    path_filestat_get: () => 0,
    random_get: () => 0,
    poll_oneoff: () => 0,
};

const imports = {
    wasi_snapshot_preview1: wasi_stubs,
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
    console.log('WASM EXPORTS VERIFICATION (WASI Build)');
    console.log('='.repeat(60) + '\n');

    const requiredFunctions = [
        'init', 'compute', 'get_buffer_ptr', 'get_buffer_size',
        'get_memory_stats', 'run_gc'
    ];

    const foundFunctions = {};

    console.log('Checking for required exports:\n');

    for (const fn of requiredFunctions) {
        const value = exports[fn];
        const found = value && typeof value === 'function';
        foundFunctions[fn] = found;
        const status = found ? '✅' : '❌';
        console.log(`  ${status} ${fn.padEnd(25)} ${found ? '[FOUND - callable]' : '[MISSING]'}`);
    }

    console.log('\nOther exports:');
    for (const [name, value] of Object.entries(exports)) {
        if (!requiredFunctions.includes(name)) {
            console.log(`  ℹ️  ${name.padEnd(25)} [${typeof value}]`);
        }
    }

    const allFound = requiredFunctions.every(fn => foundFunctions[fn]);
    const passCount = Object.values(foundFunctions).filter(v => v).length;

    console.log('\n' + '='.repeat(60));
    console.log(`RESULT: ${passCount}/${requiredFunctions.length} required functions exported`);
    if (allFound) {
        console.log('✅ SUCCESS - All required functions are present and callable');
    } else {
        console.log('❌ FAILURE - Some required functions are missing');
    }
    console.log('='.repeat(60) + '\n');

} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
}
