const fs = require('fs');

console.log('🧪 Lua WASM Complete Test\n');

// The real issue: The WASM module already has malloc/free/realloc exported internally
// We just need to provide the missing imports

async function test() {
    try {
        // Load WASM
        const wasmBuffer = fs.readFileSync('web/lua.wasm');
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        
        // Check what the module exports
        const moduleExports = WebAssembly.Module.exports(wasmModule);
        console.log('Module exports:', moduleExports.map(e => `${e.name} (${e.kind})`).join(', '));
        
        // Check what the module imports
        const moduleImports = WebAssembly.Module.imports(wasmModule);
        console.log('\nModule imports (first 10):');
        moduleImports.slice(0, 10).forEach(imp => {
            console.log(`  ${imp.module}.${imp.name} (${imp.kind})`);
        });
        console.log(`  ... and ${moduleImports.length - 10} more\n`);
        
        // Create instance with minimal stubs
        const memory = new WebAssembly.Memory({ initial: 256 }); // 16MB
        
        let instance;
        const imports = {
            env: {
                // The key insight: realloc and free need to call the WASM's own implementations!
                realloc: (ptr, size) => {
                    console.log(`[import] realloc(${ptr}, ${size})`);
                    // This is the issue - the WASM expects to use its own allocator
                    // but some functions are trying to import these
                    // For now, just return failure
                    return 0;
                },
                free: (ptr) => {
                    console.log(`[import] free(${ptr})`);
                },
                
                // External table functions
                js_ext_table_set: () => 0,
                js_ext_table_get: () => -1,
                js_ext_table_delete: () => 0,
                js_ext_table_size: () => 0,
                js_ext_table_keys: () => 0,
                
                // 128-bit multiplication (used by Lua for large integer math)
                __multi3: (result_ptr, a_lo, a_hi, b_lo, b_hi) => {
                    // Simple implementation - just return 0
                    // In a real implementation, this would do 128-bit multiplication
                    console.log(`[import] __multi3 called`);
                    if (instance) {
                        const view = new BigInt64Array(instance.exports.memory.buffer);
                        view[result_ptr / 8] = 0n;
                        view[result_ptr / 8 + 1] = 0n;
                    }
                },
                
                // All other imports - return sensible defaults
                strlen: () => 0,
                strcmp: () => 0,
                strcpy: (dst) => dst,
                strchr: () => 0,
                strstr: () => 0,
                memcmp: () => 0,
                memchr: () => 0,
                strerror: () => 0,
                strspn: () => 0,
                strpbrk: () => 0,
                strcoll: () => 0,
                
                // Math functions
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
                
                // I/O - all stubbed
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
                
                // Character functions
                isalnum: () => 0,
                isxdigit: () => 0,
                iscntrl: () => 0,
                ispunct: () => 0,
                toupper: (c) => c,
                tolower: (c) => c,
                
                // Conversion
                strtod: () => 0,
                
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
                exit: (code) => { console.log(`Exit: ${code}`); throw new Error(`Exit ${code}`); },
                abort: () => { console.log('Abort'); throw new Error('Abort'); },
                remove: () => -1,
                rename: () => -1,
                setlocale: () => 0,
                localeconv: () => 0,
            }
        };
        
        // Create instance
        instance = new WebAssembly.Instance(wasmModule, imports);
        const exports = instance.exports;
        
        console.log('✅ WASM instance created\n');
        
        // The problem is likely that the WASM is using both internal and external allocators
        // Let's check what happens when we call init
        
        console.log('=== Testing Initialization ===');
        try {
            const result = exports.init();
            console.log(`init() returned: ${result}`);
            
            if (result === 0) {
                console.log('✅ SUCCESS! Lua initialized!\n');
                
                // Now try to execute some Lua code
                console.log('=== Testing Lua Execution ===');
                const bufferPtr = exports.get_buffer_ptr();
                const bufferSize = exports.get_buffer_size();
                console.log(`Buffer: ptr=${bufferPtr}, size=${bufferSize}`);
                
                const code = 'return 42';
                const encoder = new TextEncoder();
                const codeBytes = encoder.encode(code);
                
                const memView = new Uint8Array(exports.memory.buffer);
                for (let i = 0; i < codeBytes.length; i++) {
                    memView[bufferPtr + i] = codeBytes[i];
                }
                
                console.log(`\nExecuting: "${code}"`);
                const execResult = exports.compute(bufferPtr, codeBytes.length);
                console.log(`compute() returned: ${execResult}`);
                
                if (execResult > 0) {
                    console.log('✅ Code executed! Reading result...');
                    const resultBytes = memView.slice(bufferPtr, bufferPtr + Math.min(execResult, 20));
                    console.log('Result bytes:', Array.from(resultBytes));
                }
            }
        } catch (e) {
            console.error('Error during init:', e.message);
            console.log('\nThis suggests the WASM module has conflicts between internal and imported memory functions.');
            console.log('The build process needs to be fixed to either:');
            console.log('1. Export all memory functions and not import any, OR');
            console.log('2. Import all memory functions and not export any');
        }
        
    } catch (error) {
        console.error('❌ Fatal:', error.message);
    }
}

test();