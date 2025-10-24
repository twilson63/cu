const fs = require('fs');

console.log('🧪 Minimal Lua WASM Test\n');

// Create minimal stub implementations
const stubs = {};

// Auto-generate stubs that just return 0 or log
const stubList = [
    'js_ext_table_get', 'js_ext_table_set', 'js_ext_table_size', 
    '__multi3', 'strlen', 'strcmp', 'strerror', 'fopen', 'freopen',
    'ferror', 'fclose', 'getc', 'feof', 'fread', 'strstr', 'free',
    'realloc', 'fprintf', 'fflush', 'fwrite', 'fputs', 'fputc',
    'strspn', 'isalnum', 'toupper', 'ldexp', 'fgets', 'memcmp',
    'strchr', 'abort', 'memchr', 'tmpfile', 'clearerr', 'ungetc',
    'localeconv', 'isxdigit', 'fseek', 'ftell', 'setvbuf', 'time',
    'acos', 'asin', 'atan2', 'cos', 'exp', 'fmod', 'log', 'log2',
    'log10', 'sin', 'tan', 'getenv', 'pow', 'strpbrk', 'strtod',
    'strcpy', 'snprintf', 'clock', 'gmtime', 'localtime', 'strftime',
    'difftime', 'system', 'exit', 'remove', 'rename', 'setlocale',
    'mktime', 'iscntrl', 'tolower', 'ispunct', 'frexp', 'strcoll',
    'js_ext_table_delete', 'js_ext_table_keys'
];

stubList.forEach(name => {
    stubs[name] = (...args) => {
        // Special handling for some functions
        if (name === 'strlen') {
            // Simple strlen implementation
            const memory = wasmInstance?.exports.memory;
            if (memory && args[0]) {
                const view = new Uint8Array(memory.buffer);
                let len = 0;
                let ptr = args[0];
                while (view[ptr] !== 0 && len < 1000) {
                    len++;
                    ptr++;
                }
                return len;
            }
        }
        if (name === 'abort') {
            throw new Error('Abort called');
        }
        if (name === 'exit') {
            throw new Error(`Exit called with code: ${args[0]}`);
        }
        
        // Default: return 0
        return 0;
    };
});

let wasmInstance = null;

async function test() {
    try {
        // Load WASM
        const wasmBuffer = fs.readFileSync('web/lua.wasm');
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        
        // Create instance with stubs
        wasmInstance = new WebAssembly.Instance(wasmModule, { env: stubs });
        const exports = wasmInstance.exports;
        
        console.log('✅ WASM loaded successfully');
        console.log('Exports:', Object.keys(exports));
        console.log('Memory pages:', exports.memory.buffer.byteLength / 65536);
        console.log('');
        
        // Test 1: Get buffer info
        console.log('=== Buffer Info ===');
        try {
            const ptr = exports.get_buffer_ptr();
            const size = exports.get_buffer_size();
            console.log(`Buffer pointer: ${ptr}`);
            console.log(`Buffer size: ${size}`);
            console.log('');
        } catch (e) {
            console.error('Buffer error:', e.message);
        }
        
        // Test 2: Initialize
        console.log('=== Initialize Lua ===');
        try {
            const result = exports.init();
            console.log(`init() returned: ${result}`);
            if (result === 0) {
                console.log('✅ Success!');
            } else {
                console.log('❌ Failed');
            }
            console.log('');
        } catch (e) {
            console.error('Init error:', e.message);
        }
        
        // Test 3: Try to run code
        console.log('=== Execute Lua Code ===');
        try {
            const code = 'return 42';
            const encoder = new TextEncoder();
            const codeBytes = encoder.encode(code);
            
            const bufferPtr = exports.get_buffer_ptr();
            const memory = new Uint8Array(exports.memory.buffer);
            
            // Write code to buffer
            for (let i = 0; i < codeBytes.length; i++) {
                memory[bufferPtr + i] = codeBytes[i];
            }
            
            console.log(`Executing: "${code}"`);
            const result = exports.compute(bufferPtr, codeBytes.length);
            console.log(`compute() returned: ${result}`);
            
            if (result > 0) {
                // Try to read result
                const resultView = memory.slice(bufferPtr, bufferPtr + Math.min(result, 100));
                console.log('Result bytes:', Array.from(resultView).map(b => 
                    b >= 32 && b <= 126 ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2, '0')}`
                ).join(''));
            }
        } catch (e) {
            console.error('Compute error:', e.message);
        }
        
        // Test 4: Memory stats
        console.log('\n=== Memory Stats ===');
        try {
            // Allocate space for stats at end of buffer
            const bufferPtr = exports.get_buffer_ptr();
            const bufferSize = exports.get_buffer_size();
            const statsPtr = bufferPtr + bufferSize - 24;
            
            exports.get_memory_stats(statsPtr);
            
            const view = new DataView(exports.memory.buffer);
            console.log('IO Buffer Size:', view.getBigUint64(statsPtr, true));
            console.log('Lua Memory Used:', view.getBigUint64(statsPtr + 8, true));
            console.log('WASM Pages:', view.getBigUint64(statsPtr + 16, true));
        } catch (e) {
            console.error('Stats error:', e.message);
        }
        
    } catch (error) {
        console.error('❌ Fatal:', error.message);
    }
}

test();