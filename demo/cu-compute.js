// Lua Compute Module - Direct WASM function access
// Handles WASI import shimming and exposes compute() function

class LuaCompute {
    constructor() {
        this.instance = null;
        this.memory = null;
        this.bufferPtr = 0;
        this.bufferSize = 0;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }

    // Get complete WASI import object
    getWasiImports() {
        return {
            wasi_snapshot_preview1: {
                // Process
                proc_exit: (code) => {
                    if (code !== 0) console.warn(`WASI proc_exit(${code})`);
                },
                proc_raise: (sig) => 0,

                // Arguments
                args_get: (ptrArgv, ptrArgvBufSize) => 0,
                args_sizes_get: (ptrArgc, ptrArgvBufSize) => 0,

                // Environment
                environ_get: (ptrEnviron, ptrEnvironBufSize) => 0,
                environ_sizes_get: (ptrEnvironc, ptrEnvironBufSize) => 0,

                // Clock
                clock_res_get: (id, ptrResolution) => 0,
                clock_time_get: (id, precision, ptrTime) => 0,

                // File descriptors
                fd_advise: (fd, offset, len, advice) => 0,
                fd_allocate: (fd, offset, len) => 0,
                fd_close: (fd) => 0,
                fd_datasync: (fd) => 0,
                fd_fdstat_get: (fd, ptrStat) => 0,
                fd_fdstat_set_flags: (fd, flags) => 0,
                fd_fdstat_set_rights: (fd, fsRightsBase, fsRightsInheriting) => 0,
                fd_filestat_get: (fd, ptrFilestat) => 0,
                fd_filestat_set_size: (fd, size) => 0,
                fd_filestat_set_times: (fd, atim, mtim, fstFlags) => 0,
                fd_pread: (fd, ptrIovs, iovsLen, offset, ptrNread) => 0,
                fd_prestat_dir_name: (fd, ptrPath, pathLen) => 0,
                fd_prestat_get: (fd, ptrPrestat) => 0,
                fd_pwrite: (fd, ptrIovs, iovsLen, offset, ptrNwritten) => 0,
                fd_read: (fd, ptrIovs, iovsLen, ptrNread) => 0,
                fd_readdir: (fd, ptrDirent, direntSize, cookie, ptrNwritten) => 0,
                fd_renumber: (from, to) => 0,
                fd_seek: (fd, offset, whence, ptrNewoffset) => 0,
                fd_sync: (fd) => 0,
                fd_tell: (fd, ptrOffset) => 0,
                fd_write: (fd, ptrIovs, iovsLen, ptrNwritten) => 0,

                // Paths
                path_create_directory: (fd, ptrPath, pathLen) => 0,
                path_filestat_get: (fd, flags, ptrPath, pathLen, ptrFilestat) => 0,
                path_filestat_set_times: (fd, flags, ptrPath, pathLen, atim, mtim, fstFlags) => 0,
                path_link: (oldFd, oldFlags, ptrOldPath, oldPathLen, newFd, ptrNewPath, newPathLen) => 0,
                path_open: (fd, dirflags, ptrPath, pathLen, oflags, fsRightsBase, fsRightsInheriting, fdflags, ptrOpenfd) => 0,
                path_readlink: (fd, ptrPath, pathLen, ptrBuf, bufLen, ptrNread) => 0,
                path_remove_directory: (fd, ptrPath, pathLen) => 0,
                path_rename: (fd, ptrOldPath, oldPathLen, newFd, ptrNewPath, newPathLen) => 0,
                path_symlink: (ptrOldPath, oldPathLen, fd, ptrNewPath, newPathLen) => 0,
                path_unlink_file: (fd, ptrPath, pathLen) => 0,

                // Polling
                poll_oneoff: (ptrIn, ptrOut, nsubscriptions, ptrNevents) => 0,

                // Scheduling
                sched_yield: () => 0,

                // Sockets
                sock_accept: (fd, flags, ptrFd) => 0,
                sock_bind: (fd, ptrAddr, addrLen) => 0,
                sock_connect: (fd, ptrAddr, addrLen) => 0,
                sock_listen: (fd, backlog) => 0,
                sock_opt_get: (fd, level, optname, ptrOptval, ptrOptvalLen) => 0,
                sock_opt_set: (fd, level, optname, ptrOptval, optvalLen) => 0,
                sock_recv: (fd, ptrIovs, iovsLen, riFlags, ptrNread, ptrRoFlags) => 0,
                sock_send: (fd, ptrIovs, iovsLen, siFlags, ptrNwritten) => 0,
                sock_shutdown: (fd, how) => 0,

                // Random
                random_get: (ptrBuf, bufLen) => {
                    const buf = new Uint8Array(this.memory.buffer, ptrBuf, bufLen);
                    for (let i = 0; i < bufLen; i++) {
                        buf[i] = Math.floor(Math.random() * 256);
                    }
                    return 0;
                },
            },
            env: {
                js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => 0,
                js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => -1,
                js_ext_table_delete: (tableId, keyPtr, keyLen) => 0,
                js_ext_table_size: (tableId) => 0,
                js_ext_table_keys: (tableId, bufPtr, maxLen) => 0,
            }
        };
    }

    async load(wasmPath) {
        try {
            const response = await fetch(wasmPath);
            const wasmBuffer = await response.arrayBuffer();
            const wasmModule = await WebAssembly.instantiate(wasmBuffer, this.getWasiImports());

            this.instance = wasmModule.instance;
            this.memory = this.instance.exports.memory;

            // Initialize Lua
            if (typeof this.instance.exports.init === 'function') {
                const initResult = this.instance.exports.init();
                if (initResult !== 0) {
                    throw new Error(`Lua init() failed: ${initResult}`);
                }
            }

            // Get buffer info
            if (typeof this.instance.exports.get_buffer_ptr === 'function') {
                this.bufferPtr = this.instance.exports.get_buffer_ptr();
            }
            if (typeof this.instance.exports.get_buffer_size === 'function') {
                this.bufferSize = this.instance.exports.get_buffer_size();
            }

            console.log('✅ Lua WASM module loaded successfully');
            console.log(`   Buffer: 0x${this.bufferPtr.toString(16)}, Size: ${this.bufferSize} bytes`);
            return this;
        } catch (error) {
            console.error('❌ Failed to load WASM:', error);
            throw error;
        }
    }

    compute(code) {
        if (!this.instance) {
            throw new Error('WASM module not loaded. Call load() first.');
        }

        if (typeof this.instance.exports.compute !== 'function') {
            throw new Error('compute() function not exported from WASM module');
        }

        // Encode input
        const input = this.encoder.encode(code);
        if (input.length > this.bufferSize) {
            throw new Error(`Code too large: ${input.length} > ${this.bufferSize}`);
        }

        // Write to buffer
        const memoryView = new Uint8Array(this.memory.buffer);
        memoryView.set(input, this.bufferPtr);

        // Call compute
        const resultLen = this.instance.exports.compute(this.bufferPtr, input.length);
        if (resultLen < 0) {
            throw new Error(`Compute error: code ${resultLen}`);
        }

        // Read output
        const output = new Uint8Array(this.memory.buffer, this.bufferPtr, resultLen);
        return this.decoder.decode(output);
    }

    // Alias for backward compatibility
    eval(code) {
        return this.compute(code);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LuaCompute };
}
