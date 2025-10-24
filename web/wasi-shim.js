// WASI Shim - Provides minimal WASI imports for WebAssembly
class WasiShim {
    constructor() {
        this.memory = null;
        this.view = null;
    }

    setMemory(memory) {
        this.memory = memory;
        this.view = new DataView(memory.buffer);
    }

    getImports() {
        return {
            wasi_snapshot_preview1: {
                proc_exit: (code) => { throw new Error(`proc_exit: ${code}`); },
                environ_get: () => 0,
                environ_sizes_get: (ptrEnvironc, ptrEnvironBufSize) => 0,
                args_get: () => 0,
                args_sizes_get: (ptrArgc, ptrArgvBufSize) => 0,
                random_get: (ptr, len) => 0,
                clock_res_get: (id, resolution) => 0,
                clock_time_get: (id, precision, time) => 0,
                fd_advise: () => 0,
                fd_allocate: () => 0,
                fd_close: () => 0,
                fd_datasync: () => 0,
                fd_fdstat_get: () => 0,
                fd_fdstat_set_flags: () => 0,
                fd_fdstat_set_rights: () => 0,
                fd_filestat_get: () => 0,
                fd_filestat_set_size: () => 0,
                fd_filestat_set_times: () => 0,
                fd_pread: () => 0,
                fd_prestat_dir_name: () => 0,
                fd_prestat_get: () => 0,
                fd_pwrite: () => 0,
                fd_read: () => 0,
                fd_readdir: () => 0,
                fd_renumber: () => 0,
                fd_seek: () => 0,
                fd_sync: () => 0,
                fd_tell: () => 0,
                fd_write: (fd, iovs, iovsLen, nwritten) => 0,
                path_create_directory: () => 0,
                path_filestat_get: () => 0,
                path_filestat_set_times: () => 0,
                path_link: () => 0,
                path_open: () => 0,
                path_readlink: () => 0,
                path_remove_directory: () => 0,
                path_rename: () => 0,
                path_symlink: () => 0,
                path_unlink_file: () => 0,
                poll_oneoff: () => 0,
                proc_raise: () => 0,
                sched_yield: () => 0,
                sock_accept: () => 0,
                sock_bind: () => 0,
                sock_connect: () => 0,
                sock_listen: () => 0,
                sock_opt_get: () => 0,
                sock_opt_set: () => 0,
                sock_recv: () => 0,
                sock_send: () => 0,
                sock_shutdown: () => 0,
            },
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WasiShim };
}
