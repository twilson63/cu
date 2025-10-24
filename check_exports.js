const fs = require('fs');

class WASI {
    constructor() {}
    args_get() { return 0; }
    args_sizes_get() { return 0; }
    environ_get() { return 0; }
    environ_sizes_get() { return 0; }
    clock_time_get() { return 0; }
    clock_res_get() { return 0; }
    fd_write() { return 0; }
    fd_close() { return 0; }
    fd_seek() { return 0; }
    fd_read() { return 0; }
    fd_fdstat_get() { return 0; }
    fd_prestat_get() { return 0; }
    fd_prestat_dir_name() { return 0; }
    path_open() { return 0; }
    path_filestat_get() { return 0; }
    path_readlink() { return 0; }
    path_symlink() { return 0; }
    proc_exit() { }
    random_get() { return 0; }
    sched_yield() { return 0; }
    sock_accept() { return 0; }
    sock_recv() { return 0; }
    sock_send() { return 0; }
    sock_shutdown() { return 0; }
}

async function checkExports() {
    const wasi = new WASI();
    const buffer = fs.readFileSync('web/lua.wasm');
    const importObject = {
        env: { js_ext_table_set: () => 0, js_ext_table_get: () => -1, js_ext_table_delete: () => 0, js_ext_table_size: () => 0, js_ext_table_keys: () => 0 },
        wasi_snapshot_preview1: wasi
    };
    
    const wasmModule = await WebAssembly.instantiate(buffer, importObject);
    const exports = wasmModule.instance.exports;
    
    console.log('All exports:');
    for (const key of Object.keys(exports)) {
        console.log(`  - ${key} (${typeof exports[key]})`);
    }
}

checkExports();
