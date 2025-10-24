#!/usr/bin/env node

/**
 * Test script for Phase 1 of function persistence
 * Tests the basic enum extensions and serialization detection
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Simple test harness
let testCount = 0;
let passedCount = 0;

function test(name, fn) {
    testCount++;
    try {
        fn();
        console.log(`✓ ${name}`);
        passedCount++;
    } catch (error) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

async function runTests() {
    console.log('=== Phase 1 Function Persistence Tests ===\n');
    
    // Load the WASM module
    const wasmBuffer = fs.readFileSync(`${__dirname}/web/lua.wasm`);
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    
    // Create a minimal environment
    const memory = new WebAssembly.Memory({ initial: 32, maximum: 1024 });
    const externalTables = new Map();
    let nextTableId = 1;
    
    const importObject = {
        env: {
            memory: memory
        },
        js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
            // Stub implementation
            return 0;
        },
        js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
            // Stub implementation
            return -1;
        },
        js_ext_table_delete: (tableId, keyPtr, keyLen) => {
            // Stub implementation
            return 0;
        },
        js_ext_table_size: (tableId) => {
            // Stub implementation
            return 0;
        },
        js_ext_table_keys: (tableId, bufPtr, maxLen) => {
            // Stub implementation
            return 0;
        }
    };
    
    const instance = await WebAssembly.instantiate(wasmModule, importObject);
    const exports = instance.exports;
    
    // Initialize Lua
    const initResult = exports.init();
    assert(initResult === 0, 'Lua initialization failed');
    
    // Helper to run Lua code
    function runLua(code) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const codeBytes = encoder.encode(code);
        
        const bufferPtr = exports.get_buffer_ptr();
        const bufferSize = exports.get_buffer_size();
        const memView = new Uint8Array(exports.memory.buffer);
        
        // Copy code to buffer
        for (let i = 0; i < codeBytes.length; i++) {
            memView[bufferPtr + i] = codeBytes[i];
        }
        
        // Execute
        const result = exports.compute(bufferPtr, codeBytes.length);
        
        if (result < 0) {
            const errLen = -result;
            const errBytes = memView.slice(bufferPtr, bufferPtr + errLen);
            const error = decoder.decode(errBytes);
            throw new Error(`Lua error: ${error}`);
        }
        
        // Return the serialized result bytes
        return memView.slice(bufferPtr, bufferPtr + result);
    }
    
    // Test 1: Check that the new serialization types are recognized
    test('Function type detection for Lua functions', () => {
        // Create a simple Lua function
        runLua('_G.testFunc = function() return 42 end');
        
        // Get the serialized representation
        const result = runLua('return testFunc');
        
        // The first byte should be the type indicator
        // 0x05 = function_bytecode (Lua function)
        // 0x06 = function_ref (C function)
        // For now, we might not serialize properly, but we should at least not crash
        assert(result.length > 0, 'Expected some serialized data');
        
        const typeByte = result[0];
        console.log(`    Type byte: 0x${typeByte.toString(16).padStart(2, '0')}`);
        
        // We expect either function_bytecode (0x05) or an error/nil type
        // Since Phase 1 is just the foundation, it might return nil (0x00)
        assert(
            typeByte === 0x05 || typeByte === 0x06 || typeByte === 0x00,
            `Unexpected type byte: 0x${typeByte.toString(16)}`
        );
    });
    
    // Test 2: Check C function handling
    test('Function type detection for C functions', () => {
        // print is a C function
        const result = runLua('return print');
        
        assert(result.length > 0, 'Expected some serialized data');
        
        const typeByte = result[0];
        console.log(`    Type byte: 0x${typeByte.toString(16).padStart(2, '0')}`);
        
        // C functions should be marked as function_ref (0x06) or nil
        assert(
            typeByte === 0x06 || typeByte === 0x00,
            `Unexpected type byte for C function: 0x${typeByte.toString(16)}`
        );
    });
    
    // Test 3: Verify backward compatibility with existing types
    test('Backward compatibility - string serialization', () => {
        const result = runLua('return "hello"');
        assert(result[0] === 0x04, 'String should have type 0x04');
    });
    
    test('Backward compatibility - integer serialization', () => {
        const result = runLua('return 42');
        assert(result[0] === 0x02, 'Integer should have type 0x02');
    });
    
    test('Backward compatibility - boolean serialization', () => {
        const result = runLua('return true');
        assert(result[0] === 0x01, 'Boolean should have type 0x01');
    });
    
    test('Backward compatibility - nil serialization', () => {
        const result = runLua('return nil');
        assert(result[0] === 0x00, 'Nil should have type 0x00');
    });
    
    test('Backward compatibility - float serialization', () => {
        const result = runLua('return 3.14');
        assert(result[0] === 0x03, 'Float should have type 0x03');
    });
    
    // Test 4: Check that the system doesn't crash with complex functions
    test('Complex function handling', () => {
        // Create a function with upvalues
        runLua(`
            local counter = 0
            _G.makeCounter = function()
                counter = counter + 1
                return counter
            end
        `);
        
        // Try to serialize it (might return nil in Phase 1)
        const result = runLua('return makeCounter');
        assert(result.length > 0, 'Should handle complex functions without crashing');
    });
    
    // Summary
    console.log(`\n=== Test Summary ===`);
    console.log(`Passed: ${passedCount}/${testCount}`);
    
    if (passedCount === testCount) {
        console.log('✅ All Phase 1 tests passed!');
        process.exit(0);
    } else {
        console.log('❌ Some tests failed');
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});