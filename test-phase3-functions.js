#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load the WASM module
async function loadWasm() {
    const wasmPath = path.join(__dirname, 'web', 'lua.wasm');
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    
    // Create memory
    const memory = new WebAssembly.Memory({ 
        initial: 256,  // 16MB
        maximum: 256 
    });
    
    // Import object
    const importObject = {
        env: {
            memory: memory,
            js_time_now: () => Date.now(),
            js_ext_table_get: () => 0,
            js_ext_table_set: () => 0,
            js_ext_table_size: () => 0,
        }
    };
    
    const instance = await WebAssembly.instantiate(wasmModule, importObject);
    return { instance, memory };
}

// Helper to create a C string in WASM memory
function createCString(memory, instance, str) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str + '\0');
    const ptr = instance.exports.lua_malloc(bytes.length);
    if (!ptr) throw new Error('Failed to allocate memory');
    
    const memView = new Uint8Array(memory.buffer);
    memView.set(bytes, ptr);
    return ptr;
}

// Helper to read a C string from WASM memory
function readCString(memory, ptr) {
    if (!ptr) return null;
    const memView = new Uint8Array(memory.buffer);
    let end = ptr;
    while (memView[end] !== 0) end++;
    const decoder = new TextDecoder();
    return decoder.decode(memView.subarray(ptr, end));
}

async function testFunctionSerialization() {
    console.log('Testing Phase 3: Function Deserialization and Loading\n');
    
    const { instance, memory } = await loadWasm();
    const exports = instance.exports;
    
    // Initialize Lua
    const L = exports.lua_new_state();
    if (!L) {
        console.error('Failed to create Lua state');
        return;
    }
    
    // Open standard libraries
    exports.lua_open_libs(L);
    
    console.log('=== Test 1: Serialize and Deserialize Simple Lua Function ===');
    {
        // Create a simple Lua function
        const code = `
            function test_func(x)
                return x * 2
            end
            return test_func
        `;
        
        const codePtr = createCString(memory, instance, code);
        const result = exports.lua_run_code(L, codePtr);
        exports.lua_free(codePtr);
        
        if (result !== 0) {
            console.error('Failed to create test function');
            return;
        }
        
        // Function is now on stack
        console.log('Created test function');
        
        // Serialize the function
        const bufferSize = 1024;
        const bufferPtr = exports.lua_malloc(bufferSize);
        if (!bufferPtr) {
            console.error('Failed to allocate buffer');
            return;
        }
        
        // Get the IO buffer for serialization
        const ioBufferPtr = exports.lua_get_io_buffer();
        
        // Serialize the function (it's at stack position -1)
        const serializedSize = exports.lua_serialize_value(L, -1, ioBufferPtr, bufferSize);
        if (serializedSize <= 0) {
            console.error('Failed to serialize function');
            exports.lua_free(bufferPtr);
            return;
        }
        
        console.log(`Serialized function to ${serializedSize} bytes`);
        
        // Copy serialized data to our buffer
        const memView = new Uint8Array(memory.buffer);
        const serializedData = new Uint8Array(serializedSize);
        serializedData.set(memView.subarray(ioBufferPtr, ioBufferPtr + serializedSize));
        
        // Pop the original function
        exports.lua_settop(L, -2);
        
        // Now deserialize the function
        memView.set(serializedData, ioBufferPtr);
        const deserializeResult = exports.lua_deserialize_value(L, ioBufferPtr, serializedSize);
        
        if (deserializeResult !== 0) {
            console.error('Failed to deserialize function');
            exports.lua_free(bufferPtr);
            return;
        }
        
        console.log('Successfully deserialized function');
        
        // Test the deserialized function
        exports.lua_pushinteger(L, 21);  // Push argument
        if (exports.lua_pcall(L, 1, 1, 0) !== 0) {
            const errorPtr = exports.lua_tostring(L, -1);
            const error = readCString(memory, errorPtr);
            console.error('Error calling deserialized function:', error);
            exports.lua_pop(L, 1);
        } else {
            const result = exports.lua_tointeger(L, -1);
            console.log(`Deserialized function(21) = ${result}`);
            if (result === 42) {
                console.log('✓ Function works correctly after deserialization!');
            } else {
                console.log('✗ Function returned unexpected result');
            }
            exports.lua_pop(L, 1);
        }
        
        exports.lua_free(bufferPtr);
    }
    
    console.log('\n=== Test 2: Serialize and Deserialize Function with Closure ===');
    {
        // Create a function with closure
        const code = `
            local counter = 10
            function increment(x)
                counter = counter + x
                return counter
            end
            return increment
        `;
        
        const codePtr = createCString(memory, instance, code);
        const result = exports.lua_run_code(L, codePtr);
        exports.lua_free(codePtr);
        
        if (result !== 0) {
            console.error('Failed to create closure function');
            return;
        }
        
        console.log('Created closure function');
        
        // Serialize the function
        const ioBufferPtr = exports.lua_get_io_buffer();
        const serializedSize = exports.lua_serialize_value(L, -1, ioBufferPtr, 1024);
        
        if (serializedSize <= 0) {
            console.error('Failed to serialize closure');
            return;
        }
        
        console.log(`Serialized closure to ${serializedSize} bytes`);
        
        // Copy and deserialize
        const memView = new Uint8Array(memory.buffer);
        const serializedData = new Uint8Array(serializedSize);
        serializedData.set(memView.subarray(ioBufferPtr, ioBufferPtr + serializedSize));
        
        exports.lua_settop(L, -2);  // Pop original
        
        memView.set(serializedData, ioBufferPtr);
        const deserializeResult = exports.lua_deserialize_value(L, ioBufferPtr, serializedSize);
        
        if (deserializeResult !== 0) {
            console.error('Failed to deserialize closure');
            return;
        }
        
        console.log('Successfully deserialized closure');
        
        // Test the deserialized closure
        exports.lua_pushinteger(L, 5);
        if (exports.lua_pcall(L, 1, 1, 0) !== 0) {
            const errorPtr = exports.lua_tostring(L, -1);
            const error = readCString(memory, errorPtr);
            console.error('Error calling deserialized closure:', error);
            exports.lua_pop(L, 1);
        } else {
            const result = exports.lua_tointeger(L, -1);
            console.log(`Deserialized closure(5) = ${result}`);
            console.log('Note: Upvalues may not persist correctly in Phase 1');
            exports.lua_pop(L, 1);
        }
    }
    
    console.log('\n=== Test 3: Attempt to Serialize C Function ===');
    {
        // Get a C function (print)
        exports.lua_getglobal(L, createCString(memory, instance, 'print'));
        
        if (exports.lua_isfunction(L, -1)) {
            console.log('Got C function: print');
            
            const ioBufferPtr = exports.lua_get_io_buffer();
            const serializedSize = exports.lua_serialize_value(L, -1, ioBufferPtr, 1024);
            
            if (serializedSize > 0) {
                console.log(`Serialized C function reference to ${serializedSize} bytes`);
                
                // Try to deserialize it
                const memView = new Uint8Array(memory.buffer);
                const serializedData = new Uint8Array(serializedSize);
                serializedData.set(memView.subarray(ioBufferPtr, ioBufferPtr + serializedSize));
                
                exports.lua_settop(L, -2);  // Pop original
                
                memView.set(serializedData, ioBufferPtr);
                const deserializeResult = exports.lua_deserialize_value(L, ioBufferPtr, serializedSize);
                
                if (deserializeResult === 0) {
                    console.log('Deserialized C function reference');
                    if (exports.lua_isfunction(L, -1)) {
                        console.log('✓ C function reference restored as function');
                    } else if (exports.lua_isnil(L, -1)) {
                        console.log('✓ C function reference restored as nil (expected for unsupported)');
                    }
                } else {
                    console.log('✗ Failed to deserialize C function reference');
                }
            } else {
                console.log('✗ Failed to serialize C function');
            }
        }
    }
    
    console.log('\n=== Test 4: Bytecode Validation ===');
    {
        // Try to deserialize invalid bytecode
        const ioBufferPtr = exports.lua_get_io_buffer();
        const memView = new Uint8Array(memory.buffer);
        
        // Create invalid bytecode data
        const invalidData = new Uint8Array([
            0x05,  // function_bytecode type
            0x10, 0x00, 0x00, 0x00,  // length = 16
            0xFF, 0xFF, 0xFF, 0xFF,  // Invalid bytecode header
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ]);
        
        memView.set(invalidData, ioBufferPtr);
        
        const deserializeResult = exports.lua_deserialize_value(L, ioBufferPtr, invalidData.length);
        
        if (deserializeResult !== 0) {
            console.log('✓ Invalid bytecode was rejected (expected)');
        } else {
            console.log('✗ Invalid bytecode was not rejected');
        }
    }
    
    // Clean up
    exports.lua_close_state(L);
    
    console.log('\n=== Phase 3 Testing Complete ===');
}

// Run the test
testFunctionSerialization().catch(console.error);