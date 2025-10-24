#!/usr/bin/env node

import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load the WASM module
const wasmBuffer = fs.readFileSync('./web/lua.wasm');
const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
        js_ext_table_set: () => 0,
        js_ext_table_get: () => -1,
        js_ext_table_delete: () => 0,
        js_ext_table_size: () => 0,
        js_ext_table_keys: () => 0,
        js_time_now: () => Date.now(),
    }
});

const wasm = wasmModule.instance.exports;
const memory = wasm.memory;

// Helper to convert string to WASM memory
function stringToWasm(str, ptr) {
    const bytes = new TextEncoder().encode(str);
    const mem = new Uint8Array(memory.buffer, ptr, bytes.length + 1);
    mem.set(bytes);
    mem[bytes.length] = 0;
    return bytes.length;
}

// Helper to read string from WASM memory
function wasmToString(ptr, len) {
    if (len === undefined) {
        // Null-terminated string
        const mem = new Uint8Array(memory.buffer, ptr);
        let endPtr = 0;
        while (mem[endPtr] !== 0) endPtr++;
        return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, endPtr));
    }
    return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
}

// Initialize Lua state
const L = wasm.init();
if (!L) {
    console.error('Failed to initialize Lua state');
    process.exit(1);
}

console.log('Testing Phase 2: Function Serialization with string.dump\n');

// Test 1: Serialize a simple Lua function
console.log('Test 1: Serialize simple Lua function');
const code1 = `
function test_func(x)
    return x * 2
end
return test_func
`;

// Use buffer allocation from WASM
const bufferPtr = wasm.get_buffer_ptr();
const maxBufferSize = wasm.get_buffer_size();

stringToWasm(code1, bufferPtr);

let result = wasm.compute(bufferPtr, code1.length, maxBufferSize);

// Now the function is on the stack, let's serialize it
const bufferPtr = wasm.lua_malloc(4096);
const bufferSizePtr = wasm.lua_malloc(8);

// Write initial buffer size
new Uint32Array(memory.buffer, bufferSizePtr, 1)[0] = 4096;

console.log('Attempting to serialize function...');
result = wasm.lua_serialize_value(L, -1, bufferPtr, bufferSizePtr);

if (result === 0) {
    const serializedSize = new Uint32Array(memory.buffer, bufferSizePtr, 1)[0];
    console.log(`✓ Function serialized successfully (${serializedSize} bytes)`);
    
    // Check the serialized data
    const serializedData = new Uint8Array(memory.buffer, bufferPtr, serializedSize);
    console.log('  Type byte:', '0x' + serializedData[0].toString(16));
    
    if (serializedData[0] === 0x19) { // function_bytecode
        const len = serializedData[1] | (serializedData[2] << 8) | (serializedData[3] << 16) | (serializedData[4] << 24);
        console.log('  Bytecode length:', len, 'bytes');
        console.log('  First few bytecode bytes:', Array.from(serializedData.slice(5, Math.min(15, 5 + len))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    }
    
    // Test 2: Deserialize the function
    console.log('\nTest 2: Deserialize the function');
    
    // Clear the stack
    wasm.lua_settop(L, 0);
    
    // Deserialize
    result = wasm.lua_deserialize_value(L, bufferPtr, serializedSize);
    
    if (result === 0) {
        console.log('✓ Function deserialized successfully');
        
        // Test the deserialized function
        wasm.lua_pushinteger(L, 21);
        result = wasm.lua_pcall(L, 1, 1, 0);
        
        if (result === 0) {
            const resultValue = wasm.lua_tointeger(L, -1);
            console.log('  Function call result: 21 * 2 =', resultValue);
            if (resultValue === 42) {
                console.log('  ✓ Function works correctly after deserialization!');
            } else {
                console.log('  ✗ Unexpected result');
            }
        } else {
            const errorPtr = wasm.lua_tostring(L, -1);
            console.log('  ✗ Error calling function:', wasmToString(errorPtr));
        }
    } else {
        console.log('✗ Failed to deserialize function');
    }
} else {
    console.log('✗ Failed to serialize function, error code:', result);
}

// Test 3: Serialize a function with closures
console.log('\nTest 3: Function with local variables (closure)');
const code3 = `
local counter = 10
function add_counter(x)
    return x + counter
end
return add_counter
`;

stringToWasm(code3, codePtr);
wasm.lua_settop(L, 0);
result = wasm.lua_compute(L, codePtr, 1024, 512);

if (result === 0) {
    result = wasm.lua_serialize_value(L, -1, bufferPtr, bufferSizePtr);
    
    if (result === 0) {
        const serializedSize = new Uint32Array(memory.buffer, bufferSizePtr, 1)[0];
        console.log(`✓ Closure function serialized (${serializedSize} bytes)`);
        
        // Note: Closures with upvalues may not work perfectly in Phase 2
        console.log('  Note: Full closure support will be implemented in Phase 3');
    } else {
        console.log('✗ Failed to serialize closure function');
    }
}

// Test 4: Test C function handling
console.log('\nTest 4: C function reference handling');
const code4 = `return print`;

stringToWasm(code4, codePtr);
wasm.lua_settop(L, 0);
result = wasm.lua_compute(L, codePtr, 1024, 512);

if (result === 0) {
    new Uint32Array(memory.buffer, bufferSizePtr, 1)[0] = 4096;
    result = wasm.lua_serialize_value(L, -1, bufferPtr, bufferSizePtr);
    
    if (result === 0) {
        const serializedSize = new Uint32Array(memory.buffer, bufferSizePtr, 1)[0];
        const serializedData = new Uint8Array(memory.buffer, bufferPtr, serializedSize);
        
        console.log(`✓ C function reference serialized (${serializedSize} bytes)`);
        console.log('  Type byte:', '0x' + serializedData[0].toString(16));
        
        if (serializedData[0] === 0x1A) { // function_ref
            const index = serializedData[1] | (serializedData[2] << 8);
            if (index === 0xFFFF) {
                console.log('  ✓ Marked as unsupported C function (expected for now)');
            } else {
                console.log('  Registry index:', index);
            }
        }
    } else {
        console.log('  Note: C functions may not be fully serializable in Phase 2');
    }
}

// Clean up
wasm.lua_free(codePtr);
wasm.lua_free(bufferPtr);
wasm.lua_free(bufferSizePtr);
wasm.lua_persistent_close(L);

console.log('\nPhase 2 testing complete!');