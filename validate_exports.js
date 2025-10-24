const fs = require('fs');
const path = require('path');

// Simplified WASI implementation
class WASI {
    constructor() {
        this.memory = null;
    }
    
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

async function validateExports() {
    try {
        const wasmPath = path.join(__dirname, 'web/lua.wasm');
        const buffer = fs.readFileSync(wasmPath);
        
        const wasi = new WASI();
        
        // Create import object
        const importObject = {
            env: {
                js_ext_table_set: () => 0,
                js_ext_table_get: () => -1,
                js_ext_table_delete: () => 0,
                js_ext_table_size: () => 0,
                js_ext_table_keys: () => 0
            },
            wasi_snapshot_preview1: wasi
        };
        
        const wasmModule = await WebAssembly.instantiate(buffer, importObject);
        const exports = wasmModule.instance.exports;
        
        console.log('✅ WASM Instantiated\n');
        
        // Check for required exports
        const required = ['memory', 'compute', 'init', 'get_buffer_ptr'];
        const found = [];
        const missing = [];
        
        for (const fn of required) {
            if (fn in exports) {
                found.push(fn);
                const type = typeof exports[fn];
                console.log(`✅ ${fn} (${type})`);
            } else {
                missing.push(fn);
                console.log(`❌ ${fn} - MISSING`);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log(`Found: ${found.length}/${required.length}`);
        
        if (missing.length === 0) {
            console.log('✅ ALL REQUIRED EXPORTS PRESENT\n');
            return true;
        } else {
            console.log(`❌ Missing: ${missing.join(', ')}\n`);
            return false;
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        return false;
    }
}

validateExports().then(ok => process.exit(ok ? 0 : 1));
