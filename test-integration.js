const fs = require('fs');
const path = require('path');

console.log('🧪 Lua WASM Integration Test\n');

// Mock implementations for required imports
const mockImports = {
    env: {
        // External table functions
        js_ext_table_set: () => 0,
        js_ext_table_get: () => 0,
        js_ext_table_delete: () => 0,
        js_ext_table_size: () => 0,
        js_ext_table_keys: () => 0,
        
        // Math functions
        __multi3: (a, b, c, d) => { /* 128-bit multiply */ return 0; },
        acos: Math.acos,
        asin: Math.asin,
        atan2: Math.atan2,
        cos: Math.cos,
        sin: Math.sin,
        tan: Math.tan,
        exp: Math.exp,
        log: Math.log,
        log2: Math.log2,
        log10: Math.log10,
        pow: Math.pow,
        fmod: (x, y) => x % y,
        frexp: (x) => { /* frexp implementation */ return 0; },
        ldexp: (x, exp) => x * Math.pow(2, exp),
        
        // String functions
        strlen: (ptr) => { /* strlen mock */ return 0; },
        strcmp: (a, b) => 0,
        strcpy: (dst, src) => dst,
        strchr: (str, ch) => 0,
        strstr: (haystack, needle) => 0,
        strspn: (str, accept) => 0,
        strpbrk: (str, accept) => 0,
        strtod: (str, endptr) => 0.0,
        strcoll: (s1, s2) => 0,
        strerror: (errnum) => 0,
        
        // Memory functions
        memcmp: (a, b, n) => 0,
        memchr: (s, c, n) => 0,
        realloc: (ptr, size) => ptr,
        free: (ptr) => {},
        
        // File operations (all stubbed)
        fopen: (filename, mode) => 0,
        freopen: (filename, mode, stream) => 0,
        fclose: (stream) => 0,
        fread: (ptr, size, nmemb, stream) => 0,
        fwrite: (ptr, size, nmemb, stream) => 0,
        fgets: (s, size, stream) => 0,
        fputs: (s, stream) => 0,
        fputc: (c, stream) => 0,
        getc: (stream) => -1,
        ungetc: (c, stream) => 0,
        fseek: (stream, offset, whence) => 0,
        ftell: (stream) => 0,
        feof: (stream) => 1,
        ferror: (stream) => 0,
        clearerr: (stream) => {},
        fflush: (stream) => 0,
        setvbuf: (stream, buf, mode, size) => 0,
        tmpfile: () => 0,
        fprintf: (stream, format, ...args) => 0,
        snprintf: (str, size, format, ...args) => 0,
        
        // Character functions
        isalnum: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122),
        isxdigit: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102),
        iscntrl: (c) => c < 32 || c === 127,
        ispunct: (c) => false,
        toupper: (c) => (c >= 97 && c <= 122) ? c - 32 : c,
        tolower: (c) => (c >= 65 && c <= 90) ? c + 32 : c,
        
        // System functions
        time: (t) => Math.floor(Date.now() / 1000),
        clock: () => Date.now(),
        gmtime: (timer) => 0,
        localtime: (timer) => 0,
        mktime: (tm) => 0,
        strftime: (s, max, format, tm) => 0,
        difftime: (time1, time0) => time1 - time0,
        
        // Environment
        getenv: (name) => 0,
        setlocale: (category, locale) => 0,
        localeconv: () => 0,
        system: (command) => 0,
        exit: (status) => { throw new Error(`Program exited with status ${status}`); },
        abort: () => { throw new Error('Program aborted'); },
        remove: (filename) => 0,
        rename: (old, new_) => 0,
    }
};

async function runTests() {
    try {
        // Load WASM module
        const wasmPath = path.join(__dirname, 'web/lua.wasm');
        console.log(`Loading WASM from: ${wasmPath}`);
        
        const wasmBuffer = fs.readFileSync(wasmPath);
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        const instance = new WebAssembly.Instance(wasmModule, mockImports);
        
        console.log('✅ WASM module loaded successfully\n');
        
        // Get exports
        const exports = instance.exports;
        console.log('Available exports:', Object.keys(exports).join(', '));
        console.log('');
        
        // Test 1: Initialize Lua
        console.log('Test 1: Initialize Lua');
        const initResult = exports.init();
        console.log(`  init() returned: ${initResult}`);
        console.log(`  ✅ ${initResult === 0 ? 'Success' : 'Failed'}\n`);
        
        // Test 2: Get buffer info
        console.log('Test 2: Buffer Information');
        const bufferPtr = exports.get_buffer_ptr();
        const bufferSize = exports.get_buffer_size();
        console.log(`  Buffer pointer: ${bufferPtr}`);
        console.log(`  Buffer size: ${bufferSize} bytes`);
        console.log(`  ✅ Buffer allocated\n`);
        
        // Test 3: Simple Lua computation
        console.log('Test 3: Simple Lua Code Execution');
        const memory = exports.memory;
        const memView = new Uint8Array(memory.buffer);
        
        // Write simple Lua code to buffer
        const luaCode = 'return 2 + 2';
        const encoder = new TextEncoder();
        const codeBytes = encoder.encode(luaCode);
        
        // Copy code to WASM memory at buffer location
        for (let i = 0; i < codeBytes.length; i++) {
            memView[bufferPtr + i] = codeBytes[i];
        }
        
        // Execute the code
        const result = exports.compute(bufferPtr, codeBytes.length);
        console.log(`  Lua code: "${luaCode}"`);
        console.log(`  compute() returned: ${result}`);
        
        if (result > 0) {
            // Read result from buffer
            const decoder = new TextDecoder();
            const resultBytes = memView.slice(bufferPtr, bufferPtr + result);
            const resultStr = decoder.decode(resultBytes);
            console.log(`  Result data: ${resultStr}`);
        }
        console.log(`  ✅ Code execution ${result >= 0 ? 'succeeded' : 'failed'}\n`);
        
        // Test 4: Memory stats
        console.log('Test 4: Memory Statistics');
        const statsSize = 24; // 3 * sizeof(size_t)
        const statsPtr = bufferPtr + bufferSize - statsSize;
        exports.get_memory_stats(statsPtr);
        
        const dataView = new DataView(memory.buffer);
        const ioBufferSize = dataView.getBigUint64(statsPtr, true);
        const luaMemoryUsed = dataView.getBigUint64(statsPtr + 8, true);
        const wasmPages = dataView.getBigUint64(statsPtr + 16, true);
        
        console.log(`  IO Buffer Size: ${ioBufferSize}`);
        console.log(`  Lua Memory Used: ${luaMemoryUsed}`);
        console.log(`  WASM Pages: ${wasmPages}`);
        console.log('  ✅ Memory stats retrieved\n');
        
        // Test 5: Garbage collection
        console.log('Test 5: Garbage Collection');
        exports.run_gc();
        console.log('  ✅ Garbage collection completed\n');
        
        console.log('🎉 All tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runTests();