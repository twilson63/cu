import fs from 'fs';
import { WASI } from 'wasi';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function testFunctionSerialization() {
    console.log('Testing Function Serialization Phase 1...\n');
    
    // Load WASM module
    const wasmBuffer = fs.readFileSync(`${__dirname}/web/lua.wasm`);
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    
    // Create WASI instance
    const wasi = new WASI({
        args: [],
        env: {},
        preopens: {}
    });
    
    // Instantiate module
    const instance = await WebAssembly.instantiate(wasmModule, {
        wasi_snapshot_preview1: wasi.wasiImport
    });
    
    const exports = instance.exports;
    const memory = exports.memory;
    
    // Initialize Lua state
    const L = exports.lua_init();
    if (!L) {
        console.error('Failed to initialize Lua state');
        return;
    }
    
    console.log('✓ Lua state initialized');
    
    // Helper to read string from memory
    function readString(ptr, len) {
        const bytes = new Uint8Array(memory.buffer, ptr, len);
        return new TextDecoder().decode(bytes);
    }
    
    // Helper to write string to memory
    function writeString(str) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(str);
        const ptr = exports.lua_malloc(bytes.length + 1);
        const mem = new Uint8Array(memory.buffer, ptr, bytes.length + 1);
        mem.set(bytes);
        mem[bytes.length] = 0;
        return ptr;
    }
    
    // Test 1: Serialize a simple Lua function
    console.log('\nTest 1: Simple Lua function');
    const luaCode1 = writeString(`
        function testFunc()
            return 42
        end
        _G.testFunc = testFunc
    `);
    
    let result = exports.lua_eval(L, luaCode1);
    exports.lua_free(luaCode1);
    
    if (result !== 0) {
        console.error('Failed to create test function');
        return;
    }
    
    // Try to serialize the function
    const key1 = writeString('testFunc');
    const bufferPtr = exports.lua_malloc(1024);
    
    // Get the function from global
    const getCode = writeString('return _G.testFunc');
    result = exports.lua_eval(L, getCode);
    exports.lua_free(getCode);
    
    if (result === 0) {
        // Try to serialize (this will test our new function serialization code)
        const serialized = exports.lua_serialize_value(L, -1, bufferPtr, 1024);
        
        if (serialized > 0) {
            const buffer = new Uint8Array(memory.buffer, bufferPtr, serialized);
            console.log(`✓ Function serialized: ${serialized} bytes`);
            console.log(`  Type byte: 0x${buffer[0].toString(16).padStart(2, '0')}`);
            
            // Expected type for Lua function: 0x05 (function_bytecode)
            if (buffer[0] === 0x05) {
                console.log('✓ Correctly identified as Lua function bytecode');
            } else if (buffer[0] === 0x06) {
                console.log('✓ Identified as C function reference');
            } else {
                console.log('✗ Unexpected type byte');
            }
        } else {
            console.log('✗ Function serialization returned no data or error');
        }
    }
    
    exports.lua_free(bufferPtr);
    exports.lua_free(key1);
    
    // Test 2: Try to serialize a C function
    console.log('\nTest 2: C function (print)');
    const getCode2 = writeString('return print');
    result = exports.lua_eval(L, getCode2);
    exports.lua_free(getCode2);
    
    if (result === 0) {
        const bufferPtr2 = exports.lua_malloc(1024);
        const serialized = exports.lua_serialize_value(L, -1, bufferPtr2, 1024);
        
        if (serialized > 0) {
            const buffer = new Uint8Array(memory.buffer, bufferPtr2, serialized);
            console.log(`✓ C function handled: ${serialized} bytes`);
            console.log(`  Type byte: 0x${buffer[0].toString(16).padStart(2, '0')}`);
            
            if (buffer[0] === 0x06 && buffer[1] === 0xFF) {
                console.log('✓ Correctly marked as unsupported C function');
            }
        } else {
            console.log('✗ C function handling failed');
        }
        
        exports.lua_free(bufferPtr2);
    }
    
    // Test 3: Verify existing types still work
    console.log('\nTest 3: Verify backward compatibility');
    const testCode = writeString(`
        _G.testString = "Hello"
        _G.testNumber = 123
        _G.testBool = true
        _G.testNil = nil
    `);
    
    result = exports.lua_eval(L, testCode);
    exports.lua_free(testCode);
    
    const types = ['testString', 'testNumber', 'testBool', 'testNil'];
    const expectedTypes = [0x04, 0x02, 0x01, 0x00]; // string, integer, boolean, nil
    
    for (let i = 0; i < types.length; i++) {
        const keyPtr = writeString(types[i]);
        const getCodePtr = writeString(`return _G.${types[i]}`);
        result = exports.lua_eval(L, getCodePtr);
        
        if (result === 0) {
            const bufferPtr3 = exports.lua_malloc(256);
            const serialized = exports.lua_serialize_value(L, -1, bufferPtr3, 256);
            
            if (serialized > 0) {
                const buffer = new Uint8Array(memory.buffer, bufferPtr3, 1);
                if (buffer[0] === expectedTypes[i]) {
                    console.log(`✓ ${types[i]}: Type 0x${buffer[0].toString(16).padStart(2, '0')} correct`);
                } else {
                    console.log(`✗ ${types[i]}: Expected 0x${expectedTypes[i].toString(16).padStart(2, '0')}, got 0x${buffer[0].toString(16).padStart(2, '0')}`);
                }
            }
            exports.lua_free(bufferPtr3);
        }
        
        exports.lua_free(keyPtr);
        exports.lua_free(getCodePtr);
    }
    
    // Clean up
    exports.lua_close(L);
    console.log('\n✓ All Phase 1 tests completed');
}

testFunctionSerialization().catch(console.error);