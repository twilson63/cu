const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Lua Execution with Better Import Stubs\n');

// Memory management
let memory;
let HEAP8, HEAPU8, HEAP32;
let memoryBase = 0;
let tableBase = 0;
let tempRet0 = 0;

// Simple memory allocator
let freePtr = 0x100000; // Start at 1MB
function malloc(size) {
    const ptr = freePtr;
    freePtr += size;
    return ptr;
}

// Helper to read C string from memory
function readCString(ptr) {
    if (!ptr) return null;
    let str = '';
    let i = ptr;
    while (HEAPU8[i] !== 0) {
        str += String.fromCharCode(HEAPU8[i]);
        i++;
    }
    return str;
}

// Helper to write C string to memory
function writeCString(str, ptr) {
    for (let i = 0; i < str.length; i++) {
        HEAPU8[ptr + i] = str.charCodeAt(i);
    }
    HEAPU8[ptr + str.length] = 0;
    return ptr;
}

// Create more realistic import implementations
const imports = {
    env: {
        // External table functions (required by the module)
        js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
            console.log(`[js_ext_table_set] table_id=${table_id}, key_len=${key_len}, val_len=${val_len}`);
            return 0;
        },
        js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
            console.log(`[js_ext_table_get] table_id=${table_id}, key_len=${key_len}, max_len=${max_len}`);
            return -1; // Not found
        },
        js_ext_table_delete: (table_id, key_ptr, key_len) => {
            console.log(`[js_ext_table_delete] table_id=${table_id}, key_len=${key_len}`);
            return 0;
        },
        js_ext_table_size: (table_id) => {
            console.log(`[js_ext_table_size] table_id=${table_id}`);
            return 0;
        },
        js_ext_table_keys: (table_id, buf_ptr, max_len) => {
            console.log(`[js_ext_table_keys] table_id=${table_id}, max_len=${max_len}`);
            return 0;
        },
        
        // Memory management
        malloc: (size) => {
            const ptr = malloc(size);
            console.log(`[malloc] size=${size} -> ${ptr}`);
            return ptr;
        },
        free: (ptr) => {
            console.log(`[free] ptr=${ptr}`);
        },
        realloc: (ptr, size) => {
            console.log(`[realloc] ptr=${ptr}, size=${size}`);
            if (!ptr) return malloc(size);
            // Simple implementation - just allocate new
            const newPtr = malloc(size);
            if (ptr && size > 0) {
                // Copy old data (simplified)
                for (let i = 0; i < size; i++) {
                    HEAPU8[newPtr + i] = HEAPU8[ptr + i];
                }
            }
            return newPtr;
        },
        calloc: (num, size) => {
            const totalSize = num * size;
            const ptr = malloc(totalSize);
            // Zero memory
            for (let i = 0; i < totalSize; i++) {
                HEAPU8[ptr + i] = 0;
            }
            console.log(`[calloc] num=${num}, size=${size} -> ${ptr}`);
            return ptr;
        },
        
        // String functions
        strlen: (ptr) => {
            let len = 0;
            while (HEAPU8[ptr + len] !== 0) len++;
            console.log(`[strlen] ptr=${ptr} -> ${len}`);
            return len;
        },
        strcmp: (ptr1, ptr2) => {
            const str1 = readCString(ptr1);
            const str2 = readCString(ptr2);
            console.log(`[strcmp] "${str1}" vs "${str2}"`);
            return str1 < str2 ? -1 : str1 > str2 ? 1 : 0;
        },
        strcpy: (dst, src) => {
            let i = 0;
            while (HEAPU8[src + i] !== 0) {
                HEAPU8[dst + i] = HEAPU8[src + i];
                i++;
            }
            HEAPU8[dst + i] = 0;
            console.log(`[strcpy] copied ${i} chars`);
            return dst;
        },
        strchr: (str, ch) => {
            console.log(`[strchr] looking for char ${ch}`);
            let ptr = str;
            while (HEAPU8[ptr] !== 0) {
                if (HEAPU8[ptr] === ch) return ptr;
                ptr++;
            }
            return 0;
        },
        strstr: (haystack, needle) => {
            console.log(`[strstr] searching...`);
            return 0; // Not found
        },
        memcpy: (dst, src, len) => {
            for (let i = 0; i < len; i++) {
                HEAPU8[dst + i] = HEAPU8[src + i];
            }
            return dst;
        },
        memmove: (dst, src, len) => {
            // Handle overlapping regions
            if (dst < src) {
                for (let i = 0; i < len; i++) {
                    HEAPU8[dst + i] = HEAPU8[src + i];
                }
            } else {
                for (let i = len - 1; i >= 0; i--) {
                    HEAPU8[dst + i] = HEAPU8[src + i];
                }
            }
            return dst;
        },
        memset: (ptr, value, len) => {
            for (let i = 0; i < len; i++) {
                HEAPU8[ptr + i] = value;
            }
            return ptr;
        },
        memcmp: (ptr1, ptr2, len) => {
            for (let i = 0; i < len; i++) {
                if (HEAPU8[ptr1 + i] < HEAPU8[ptr2 + i]) return -1;
                if (HEAPU8[ptr1 + i] > HEAPU8[ptr2 + i]) return 1;
            }
            return 0;
        },
        memchr: (ptr, value, len) => {
            for (let i = 0; i < len; i++) {
                if (HEAPU8[ptr + i] === value) return ptr + i;
            }
            return 0;
        },
        
        // Math functions
        __multi3: (a, b, c, d, e, f, g, h) => {
            console.log(`[__multi3] 128-bit multiplication`);
            tempRet0 = 0;
            return 0;
        },
        pow: Math.pow,
        cos: Math.cos,
        sin: Math.sin,
        tan: Math.tan,
        acos: Math.acos,
        asin: Math.asin,
        atan2: Math.atan2,
        exp: Math.exp,
        log: Math.log,
        log10: Math.log10,
        log2: Math.log2,
        floor: Math.floor,
        ceil: Math.ceil,
        sqrt: Math.sqrt,
        fabs: Math.abs,
        fmod: (x, y) => x % y,
        ldexp: (x, exp) => x * Math.pow(2, exp),
        frexp: (value, exp) => {
            console.log(`[frexp] value=${value}`);
            return 0;
        },
        modf: (value, intpart) => {
            const intVal = Math.floor(value);
            HEAP32[intpart >> 2] = intVal;
            return value - intVal;
        },
        
        // I/O stubs (all return failure)
        fopen: (filename, mode) => {
            console.log(`[fopen] filename=${readCString(filename)}, mode=${readCString(mode)}`);
            return 0; // NULL
        },
        fclose: (file) => 0,
        fread: () => 0,
        fwrite: () => 0,
        feof: () => 1,
        ferror: () => 0,
        fflush: () => 0,
        fseek: () => -1,
        ftell: () => -1,
        fgets: () => 0,
        fputs: () => -1,
        fputc: () => -1,
        getc: () => -1,
        ungetc: () => -1,
        fprintf: () => 0,
        fscanf: () => 0,
        vfprintf: () => 0,
        printf: (fmt, ...args) => {
            console.log(`[printf] format=${readCString(fmt)}`);
            return 0;
        },
        sprintf: (str, fmt, ...args) => {
            console.log(`[sprintf] format=${readCString(fmt)}`);
            return 0;
        },
        snprintf: (str, size, fmt, ...args) => {
            console.log(`[snprintf] format=${readCString(fmt)}`);
            return 0;
        },
        
        // Character classification
        isalnum: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 1 : 0,
        isalpha: (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 1 : 0,
        isdigit: (c) => c >= 48 && c <= 57 ? 1 : 0,
        isxdigit: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) ? 1 : 0,
        isspace: (c) => (c === 32 || c === 9 || c === 10 || c === 13) ? 1 : 0,
        iscntrl: (c) => c < 32 || c === 127 ? 1 : 0,
        ispunct: (c) => 0,
        isupper: (c) => c >= 65 && c <= 90 ? 1 : 0,
        islower: (c) => c >= 97 && c <= 122 ? 1 : 0,
        toupper: (c) => (c >= 97 && c <= 122) ? c - 32 : c,
        tolower: (c) => (c >= 65 && c <= 90) ? c + 32 : c,
        
        // String conversion
        strtod: (str, endptr) => {
            console.log(`[strtod] str=${readCString(str)}`);
            return 0.0;
        },
        strtol: (str, endptr, base) => {
            console.log(`[strtol] str=${readCString(str)}, base=${base}`);
            return 0;
        },
        strtoul: (str, endptr, base) => {
            console.log(`[strtoul] str=${readCString(str)}, base=${base}`);
            return 0;
        },
        strtoll: (str, endptr, base) => {
            console.log(`[strtoll] str=${readCString(str)}, base=${base}`);
            return 0;
        },
        atoi: (str) => {
            const s = readCString(str);
            return parseInt(s) || 0;
        },
        atof: (str) => {
            const s = readCString(str);
            return parseFloat(s) || 0.0;
        },
        
        // More string functions
        strspn: () => 0,
        strpbrk: () => 0,
        strerror: (errnum) => {
            const errorStr = `Error ${errnum}`;
            const ptr = malloc(errorStr.length + 1);
            writeCString(errorStr, ptr);
            return ptr;
        },
        strcoll: () => 0,
        strncpy: (dst, src, n) => {
            let i;
            for (i = 0; i < n && HEAPU8[src + i] !== 0; i++) {
                HEAPU8[dst + i] = HEAPU8[src + i];
            }
            for (; i < n; i++) {
                HEAPU8[dst + i] = 0;
            }
            return dst;
        },
        strncmp: (s1, s2, n) => {
            for (let i = 0; i < n; i++) {
                const c1 = HEAPU8[s1 + i];
                const c2 = HEAPU8[s2 + i];
                if (c1 === 0 || c1 !== c2) {
                    return c1 - c2;
                }
            }
            return 0;
        },
        
        // Time functions
        time: (t) => {
            const timestamp = Math.floor(Date.now() / 1000);
            if (t) {
                HEAP32[t >> 2] = timestamp;
            }
            return timestamp;
        },
        clock: () => Date.now(),
        gmtime: () => 0,
        localtime: () => 0,
        mktime: () => 0,
        strftime: () => 0,
        difftime: (t1, t0) => t1 - t0,
        
        // System functions
        getenv: (name) => {
            console.log(`[getenv] name=${readCString(name)}`);
            return 0;
        },
        system: (command) => {
            console.log(`[system] command=${readCString(command)}`);
            return -1;
        },
        exit: (status) => {
            throw new Error(`Program exit with status: ${status}`);
        },
        abort: () => {
            throw new Error('Program aborted');
        },
        atexit: () => 0,
        
        // File system stubs
        remove: () => -1,
        rename: () => -1,
        tmpfile: () => 0,
        tmpnam: () => 0,
        clearerr: () => {},
        setvbuf: () => 0,
        freopen: () => 0,
        setbuf: () => {},
        
        // Locale
        setlocale: (category, locale) => 0,
        localeconv: () => 0,
        
        // More I/O
        perror: (s) => {
            console.log(`[perror] ${readCString(s)}`);
        },
        puts: (s) => {
            console.log(`[puts] ${readCString(s)}`);
            return 1;
        },
        getchar: () => -1,
        putchar: (c) => {
            console.log(`[putchar] ${String.fromCharCode(c)}`);
            return c;
        },
    }
};

async function testLuaExecution() {
    try {
        // Load WASM module
        const wasmPath = path.join(__dirname, 'web/lua.wasm');
        console.log(`Loading WASM from: ${wasmPath}\n`);
        
        const wasmBuffer = fs.readFileSync(wasmPath);
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        const instance = new WebAssembly.Instance(wasmModule, imports);
        
        // Setup memory views
        memory = instance.exports.memory;
        HEAP8 = new Int8Array(memory.buffer);
        HEAPU8 = new Uint8Array(memory.buffer);
        HEAP32 = new Int32Array(memory.buffer);
        
        const exports = instance.exports;
        console.log('✅ WASM module loaded\n');
        console.log('Exports:', Object.keys(exports).join(', '));
        console.log('Memory size:', memory.buffer.byteLength, 'bytes\n');
        
        // Test 1: Initialize Lua
        console.log('=== Test 1: Initialize Lua ===');
        try {
            const initResult = exports.init();
            console.log(`init() returned: ${initResult}`);
            if (initResult === 0) {
                console.log('✅ Lua initialized successfully!\n');
            } else {
                console.log('❌ Lua initialization failed\n');
            }
        } catch (e) {
            console.log('❌ Exception during init():', e.message, '\n');
        }
        
        // Test 2: Try simple Lua execution
        console.log('=== Test 2: Execute Simple Lua Code ===');
        try {
            const bufferPtr = exports.get_buffer_ptr();
            const bufferSize = exports.get_buffer_size();
            console.log(`Buffer at: ${bufferPtr}, size: ${bufferSize}`);
            
            // Try different Lua expressions
            const testCodes = [
                'return 42',
                'return 2 + 2',
                'return "Hello"',
                'print("test")',
                'return nil',
            ];
            
            for (const code of testCodes) {
                console.log(`\nTrying: "${code}"`);
                
                // Write code to buffer
                const encoder = new TextEncoder();
                const codeBytes = encoder.encode(code);
                const memView = new Uint8Array(memory.buffer);
                
                for (let i = 0; i < codeBytes.length; i++) {
                    memView[bufferPtr + i] = codeBytes[i];
                }
                
                // Execute
                const result = exports.compute(bufferPtr, codeBytes.length);
                console.log(`compute() returned: ${result}`);
                
                if (result > 0) {
                    // Try to read result
                    const resultBytes = memView.slice(bufferPtr, bufferPtr + result);
                    console.log('Result bytes:', Array.from(resultBytes));
                    
                    try {
                        const decoder = new TextDecoder();
                        const resultStr = decoder.decode(resultBytes);
                        console.log('Result string:', resultStr);
                    } catch (e) {
                        console.log('Could not decode result as string');
                    }
                }
            }
        } catch (e) {
            console.log('❌ Exception during compute():', e.message);
            console.log(e.stack);
        }
        
        // Test 3: Memory stats
        console.log('\n=== Test 3: Memory Statistics ===');
        try {
            const statsPtr = malloc(24); // 3 * 8 bytes
            exports.get_memory_stats(statsPtr);
            
            const view = new BigUint64Array(memory.buffer);
            const offset = statsPtr / 8;
            console.log('IO Buffer Size:', view[offset]);
            console.log('Lua Memory Used:', view[offset + 1]);
            console.log('WASM Pages:', view[offset + 2]);
        } catch (e) {
            console.log('❌ Exception during get_memory_stats():', e.message);
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        console.error(error.stack);
    }
}

testLuaExecution();