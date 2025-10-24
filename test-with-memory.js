const fs = require('fs');

console.log('🧪 Lua WASM Test with Memory Management\n');

// Simple memory allocator
class MemoryAllocator {
    constructor(memory, heapStart = 0x20000, heapSize = 0x20000) {
        this.memory = memory;
        this.heapStart = heapStart;
        this.heapSize = heapSize;
        this.nextPtr = heapStart;
        this.allocations = new Map();
        
        console.log(`Memory allocator initialized: start=0x${heapStart.toString(16)}, size=0x${heapSize.toString(16)}`);
    }
    
    malloc(size) {
        if (size === 0) return 0;
        
        // Align to 8 bytes
        size = (size + 7) & ~7;
        
        if (this.nextPtr + size > this.heapStart + this.heapSize) {
            console.error(`Out of memory! Requested ${size}, available ${this.heapStart + this.heapSize - this.nextPtr}`);
            return 0;
        }
        
        const ptr = this.nextPtr;
        this.nextPtr += size;
        this.allocations.set(ptr, size);
        
        console.log(`malloc(${size}) -> 0x${ptr.toString(16)}`);
        return ptr;
    }
    
    free(ptr) {
        if (ptr === 0) return;
        console.log(`free(0x${ptr.toString(16)})`);
        this.allocations.delete(ptr);
    }
    
    realloc(ptr, newSize) {
        console.log(`realloc(0x${ptr.toString(16)}, ${newSize})`);
        
        if (newSize === 0) {
            this.free(ptr);
            return 0;
        }
        
        if (ptr === 0) {
            return this.malloc(newSize);
        }
        
        const oldSize = this.allocations.get(ptr) || 0;
        const newPtr = this.malloc(newSize);
        
        if (newPtr && oldSize) {
            // Copy old data
            const memory = new Uint8Array(this.memory.buffer);
            const copySize = Math.min(oldSize, newSize);
            for (let i = 0; i < copySize; i++) {
                memory[newPtr + i] = memory[ptr + i];
            }
        }
        
        this.free(ptr);
        return newPtr;
    }
}

let allocator = null;
let wasmInstance = null;

async function test() {
    try {
        // Load WASM
        const wasmBuffer = fs.readFileSync('web/lua.wasm');
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        
        // Create imports
        const imports = {
            env: {
                // Memory management
                realloc: (ptr, size) => allocator ? allocator.realloc(ptr, size) : 0,
                free: (ptr) => allocator ? allocator.free(ptr) : undefined,
                
                // External table functions
                js_ext_table_set: () => { console.log('js_ext_table_set'); return 0; },
                js_ext_table_get: () => { console.log('js_ext_table_get'); return -1; },
                js_ext_table_delete: () => { console.log('js_ext_table_delete'); return 0; },
                js_ext_table_size: () => 0,
                js_ext_table_keys: () => 0,
                
                // String functions (minimal implementations)
                strlen: (ptr) => {
                    if (!wasmInstance) return 0;
                    const mem = new Uint8Array(wasmInstance.exports.memory.buffer);
                    let len = 0;
                    while (mem[ptr + len] !== 0 && len < 10000) len++;
                    return len;
                },
                strcmp: (s1, s2) => {
                    if (!wasmInstance) return 0;
                    const mem = new Uint8Array(wasmInstance.exports.memory.buffer);
                    let i = 0;
                    while (true) {
                        const c1 = mem[s1 + i];
                        const c2 = mem[s2 + i];
                        if (c1 === 0 || c2 === 0 || c1 !== c2) {
                            return c1 - c2;
                        }
                        i++;
                    }
                },
                strcpy: (dst, src) => {
                    if (!wasmInstance) return dst;
                    const mem = new Uint8Array(wasmInstance.exports.memory.buffer);
                    let i = 0;
                    while (mem[src + i] !== 0) {
                        mem[dst + i] = mem[src + i];
                        i++;
                    }
                    mem[dst + i] = 0;
                    return dst;
                },
                strchr: (str, ch) => {
                    if (!wasmInstance) return 0;
                    const mem = new Uint8Array(wasmInstance.exports.memory.buffer);
                    let ptr = str;
                    while (mem[ptr] !== 0) {
                        if (mem[ptr] === ch) return ptr;
                        ptr++;
                    }
                    return 0;
                },
                strstr: () => 0,
                memcmp: (p1, p2, n) => {
                    if (!wasmInstance) return 0;
                    const mem = new Uint8Array(wasmInstance.exports.memory.buffer);
                    for (let i = 0; i < n; i++) {
                        const diff = mem[p1 + i] - mem[p2 + i];
                        if (diff !== 0) return diff;
                    }
                    return 0;
                },
                memchr: () => 0,
                
                // Math
                __multi3: () => 0,
                pow: Math.pow,
                exp: Math.exp,
                log: Math.log,
                log2: Math.log2,
                log10: Math.log10,
                sin: Math.sin,
                cos: Math.cos,
                tan: Math.tan,
                asin: Math.asin,
                acos: Math.acos,
                atan2: Math.atan2,
                fmod: (x, y) => x % y,
                ldexp: (x, exp) => x * Math.pow(2, exp),
                frexp: () => 0,
                
                // I/O stubs
                fprintf: () => 0,
                sprintf: () => 0,
                snprintf: () => 0,
                fopen: () => 0,
                fclose: () => 0,
                fread: () => 0,
                fwrite: () => 0,
                feof: () => 1,
                ferror: () => 0,
                fflush: () => 0,
                fputs: () => 0,
                fputc: () => 0,
                fgets: () => 0,
                getc: () => -1,
                ungetc: () => 0,
                fseek: () => -1,
                ftell: () => -1,
                freopen: () => 0,
                clearerr: () => {},
                setvbuf: () => 0,
                tmpfile: () => 0,
                
                // Character
                isalnum: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ? 1 : 0,
                isxdigit: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) ? 1 : 0,
                iscntrl: (c) => c < 32 || c === 127 ? 1 : 0,
                ispunct: () => 0,
                toupper: (c) => c >= 97 && c <= 122 ? c - 32 : c,
                tolower: (c) => c >= 65 && c <= 90 ? c + 32 : c,
                
                // String conversion
                strtod: () => 0.0,
                strspn: () => 0,
                strpbrk: () => 0,
                strerror: () => 0,
                strcoll: () => 0,
                
                // Time
                time: () => Math.floor(Date.now() / 1000),
                clock: () => Date.now(),
                gmtime: () => 0,
                localtime: () => 0,
                mktime: () => 0,
                strftime: () => 0,
                difftime: (t1, t0) => t1 - t0,
                
                // System
                getenv: () => 0,
                system: () => -1,
                exit: (code) => { throw new Error(`Exit ${code}`); },
                abort: () => { throw new Error('Abort'); },
                remove: () => -1,
                rename: () => -1,
                setlocale: () => 0,
                localeconv: () => 0,
            }
        };
        
        // Create instance
        wasmInstance = new WebAssembly.Instance(wasmModule, imports);
        const exports = wasmInstance.exports;
        
        // Initialize allocator with WASM memory
        allocator = new MemoryAllocator(exports.memory);
        
        console.log('✅ WASM loaded successfully\n');
        console.log('Memory size:', exports.memory.buffer.byteLength, 'bytes');
        console.log('Memory pages:', exports.memory.buffer.byteLength / 65536);
        console.log('');
        
        // Test 1: Initialize
        console.log('=== Initialize Lua ===');
        const initResult = exports.init();
        console.log(`\ninit() returned: ${initResult}`);
        if (initResult === 0) {
            console.log('✅ Lua initialized successfully!\n');
        } else {
            console.log('❌ Lua initialization failed\n');
            return;
        }
        
        // Test 2: Execute simple Lua code
        console.log('=== Execute Lua Code ===');
        const testCodes = [
            'return 42',
            'return 1 + 1',
            'return "hello"',
            'return true',
            'return nil',
        ];
        
        const bufferPtr = exports.get_buffer_ptr();
        const memory = new Uint8Array(exports.memory.buffer);
        
        for (const code of testCodes) {
            console.log(`\nTesting: "${code}"`);
            
            // Write code to buffer
            const encoder = new TextEncoder();
            const codeBytes = encoder.encode(code);
            for (let i = 0; i < codeBytes.length; i++) {
                memory[bufferPtr + i] = codeBytes[i];
            }
            
            // Execute
            const result = exports.compute(bufferPtr, codeBytes.length);
            console.log(`compute() returned: ${result}`);
            
            if (result > 0) {
                // Read result
                const resultBytes = memory.slice(bufferPtr, bufferPtr + Math.min(result, 100));
                console.log('Result bytes (first 10):', Array.from(resultBytes.slice(0, 10)));
                
                // Try to interpret result
                const firstByte = resultBytes[0];
                console.log(`Type byte: ${firstByte} (${firstByte === 0 ? 'nil' : firstByte === 1 ? 'bool' : firstByte === 2 ? 'int' : firstByte === 3 ? 'float' : firstByte === 4 ? 'string' : 'unknown'})`);
            }
        }
        
        // Test 3: Memory stats
        console.log('\n=== Memory Statistics ===');
        const statsPtr = allocator.malloc(24);
        exports.get_memory_stats(statsPtr);
        
        const dataView = new DataView(exports.memory.buffer);
        console.log('IO Buffer Size:', dataView.getBigUint64(statsPtr, true));
        console.log('Lua Memory Used:', dataView.getBigUint64(statsPtr + 8, true));
        console.log('WASM Pages:', dataView.getBigUint64(statsPtr + 16, true));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

test();