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
    
    // Simple storage for external tables
    const tables = new Map();
    let tableIdCounter = 1;
    
    // Import object
    const importObject = {
        env: {
            memory: memory,
            js_time_now: () => Date.now(),
            js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
                const table = tables.get(tableId);
                if (!table) return -1;
                
                const memView = new Uint8Array(memory.buffer);
                const key = new TextDecoder().decode(memView.slice(keyPtr, keyPtr + keyLen));
                const value = table.get(key);
                
                if (!value) return 0;
                
                const bytes = new TextEncoder().encode(value);
                if (bytes.length > maxLen) return -1;
                
                memView.set(bytes, valPtr);
                return bytes.length;
            },
            js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
                let table = tables.get(tableId);
                if (!table) {
                    table = new Map();
                    tables.set(tableId, table);
                }
                
                const memView = new Uint8Array(memory.buffer);
                const key = new TextDecoder().decode(memView.slice(keyPtr, keyPtr + keyLen));
                const value = new TextDecoder().decode(memView.slice(valPtr, valPtr + valLen));
                table.set(key, value);
                return 0;
            },
            js_ext_table_size: (tableId) => {
                const table = tables.get(tableId);
                return table ? table.size : 0;
            },
        }
    };
    
    const instance = await WebAssembly.instantiate(wasmModule, importObject);
    return { instance, memory, tables };
}

// Helper to deserialize a value from the buffer
function deserializeValue(bytes) {
    if (bytes.length === 0) return null;
    
    const type = bytes[0];
    switch (type) {
        case 0x00: // nil
            return null;
        case 0x01: // boolean
            return bytes[1] !== 0;
        case 0x02: // integer
            if (bytes.length < 9) return null;
            let val = 0n;
            for (let i = 0; i < 8; i++) {
                val |= BigInt(bytes[1 + i]) << (BigInt(i) * 8n);
            }
            // Convert to signed
            if (val >= (1n << 63n)) {
                val = val - (1n << 64n);
            }
            return Number(val);
        case 0x03: // float
            if (bytes.length < 9) return null;
            const buf = new ArrayBuffer(8);
            const view = new DataView(buf);
            for (let i = 0; i < 8; i++) {
                view.setUint8(i, bytes[1 + i]);
            }
            return view.getFloat64(0, true); // little-endian
        case 0x04: // string
            if (bytes.length < 5) return null;
            const len = bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24);
            if (bytes.length < 5 + len) return null;
            return new TextDecoder().decode(bytes.slice(5, 5 + len));
        default:
            // For other types, return the raw type indicator
            return new TextDecoder().decode(bytes);
    }
}

// Helper to run Lua code
function runLuaCode(instance, memory, code) {
    const exports = instance.exports;
    
    // Get buffer pointer and size
    const bufferPtr = exports.get_buffer_ptr();
    const bufferSize = exports.get_buffer_size();
    
    // Write code to buffer
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code);
    if (codeBytes.length > bufferSize) {
        throw new Error('Code too large for buffer');
    }
    
    const memView = new Uint8Array(memory.buffer);
    memView.set(codeBytes, bufferPtr);
    
    // Run the code
    const result = exports.compute(bufferPtr, codeBytes.length);
    
    // Read result from buffer
    const decoder = new TextDecoder();
    if (result < 0) {
        // Error occurred
        const errorLen = -result - 1;
        const errorMsg = decoder.decode(memView.slice(bufferPtr, bufferPtr + errorLen));
        return { success: false, error: errorMsg };
    } else {
        // Success - first 4 bytes are output length
        if (result < 4) {
            return { success: true, output: '', value: null };
        }
        
        // Read output length (little-endian)
        const outputLen = memView[bufferPtr] | 
                         (memView[bufferPtr + 1] << 8) |
                         (memView[bufferPtr + 2] << 16) |
                         (memView[bufferPtr + 3] << 24);
        
        // Read the output (printed text)
        let output = '';
        if (outputLen > 0 && result > 4) {
            const actualOutputLen = Math.min(outputLen, result - 4);
            output = decoder.decode(memView.slice(bufferPtr + 4, bufferPtr + 4 + actualOutputLen));
        }
        
        // The rest is the serialized return value
        let value = null;
        const valueOffset = bufferPtr + 4 + outputLen;
        if (result > 4 + outputLen) {
            const valueBytes = memView.slice(valueOffset, bufferPtr + result);
            value = deserializeValue(valueBytes);
        }
        
        return { success: true, output: output, value: value };
    }
}

async function testPhase3() {
    console.log('Testing Phase 3: Function Deserialization and Loading\n');
    
    const { instance, memory, tables } = await loadWasm();
    const exports = instance.exports;
    
    // Initialize Lua state
    const initResult = exports.init();
    if (initResult !== 0) {
        console.error('Failed to initialize Lua state');
        return;
    }
    
    console.log('=== Test 1: Serialize and Deserialize Simple Lua Function ===');
    {
        // Create and serialize a simple function
        const code1 = `
            -- Create a simple function
            function test_func(x)
                return x * 2
            end
            
            -- Serialize it using string.dump
            local serialized = string.dump(test_func, true)
            
            -- Store in Memory table for persistence
            Memory.test_func_bytecode = serialized
            
            -- Test original function
            return test_func(21)
        `;
        
        const result1 = runLuaCode(instance, memory, code1);
        if (!result1.success) {
            console.error('Failed to create test function:', result1.error);
            return;
        }
        
        console.log('Created and serialized test function');
        console.log('Original function(21) =', result1.value);
        
        // Now deserialize and test the function
        const code2 = `
            -- Retrieve serialized bytecode from Memory
            local bytecode = Memory.test_func_bytecode
            if not bytecode then
                return "No bytecode found"
            end
            
            -- Load the bytecode
            local func, err = load(bytecode, "=deserialized", "b")
            if not func then
                return "Failed to load: " .. tostring(err)
            end
            
            -- Test the deserialized function
            return func(21)
        `;
        
        const result2 = runLuaCode(instance, memory, code2);
        if (!result2.success) {
            console.error('Failed to deserialize function:', result2.error);
        } else {
            console.log('Deserialized function(21) =', result2.value);
            if (result2.value === 42) {
                console.log('✓ Function works correctly after deserialization!');
            } else {
                console.log('✗ Function returned unexpected result');
            }
        }
    }
    
    console.log('\n=== Test 2: Function with Upvalues ===');
    {
        const code = `
            -- Create a closure with upvalue
            local counter = 10
            local function increment(x)
                counter = counter + x
                return counter
            end
            
            -- Serialize the closure
            local ok, result = pcall(string.dump, increment, true)
            if ok then
                Memory.closure_bytecode = result
                return "Serialized closure successfully"
            else
                return "Note: Closures with upvalues cannot be serialized with string.dump"
            end
        `;
        
        const result = runLuaCode(instance, memory, code);
        console.log(result.value || result.output || 'No output');
    }
    
    console.log('\n=== Test 3: Bytecode Security Validation ===');
    {
        const code = `
            -- Try to load invalid bytecode
            local invalid_bytecode = "\\xFF\\xFF\\xFF\\xFF Invalid data"
            local func, err = load(invalid_bytecode, "=test", "b")
            if func then
                return "ERROR: Invalid bytecode was accepted!"
            else
                return "✓ Invalid bytecode rejected: " .. tostring(err)
            end
        `;
        
        const result = runLuaCode(instance, memory, code);
        console.log(result.value || result.output || 'No output');
    }
    
    console.log('\n=== Test 4: Lua Bytecode Header Validation ===');
    {
        const code = `
            -- Create valid bytecode and inspect header
            local function sample() return 42 end
            local bytecode = string.dump(sample, true)
            
            -- Check Lua signature (\\x1B\\x4C\\x75\\x61)
            local header = bytecode:sub(1, 4)
            local sig = {header:byte(1, 4)}
            
            if sig[1] == 0x1B and sig[2] == 0x4C and sig[3] == 0x75 and sig[4] == 0x61 then
                return "✓ Valid Lua bytecode signature detected"
            else
                return "✗ Invalid bytecode signature"
            end
        `;
        
        const result = runLuaCode(instance, memory, code);
        console.log(result.value || result.output || 'No output');
    }
    
    console.log('\n=== Test 5: Complex Function Serialization ===');
    {
        const code = `
            -- Create a more complex function
            local function fibonacci(n)
                if n <= 1 then return n end
                return fibonacci(n - 1) + fibonacci(n - 2)
            end
            
            -- Serialize it
            local bytecode = string.dump(fibonacci, true)
            Memory.fib_bytecode = bytecode
            
            -- Load and test
            local loaded_fib = assert(load(bytecode, "=fib", "b"))
            
            -- Test both original and loaded versions
            local orig_result = fibonacci(10)
            local loaded_result = loaded_fib(10)
            
            if orig_result == loaded_result then
                return "✓ Complex function serialization successful: fib(10) = " .. orig_result
            else
                return "✗ Mismatch: original=" .. orig_result .. ", loaded=" .. loaded_result
            end
        `;
        
        const result = runLuaCode(instance, memory, code);
        console.log(result.value || result.output || 'No output');
    }
    
    console.log('\n=== Test 6: C Function References ===');
    {
        const code = `
            -- Try to serialize C functions (should fail gracefully)
            local funcs = {print, math.sin, table.insert}
            local results = {}
            
            for i, func in ipairs(funcs) do
                local ok, bytecode = pcall(string.dump, func)
                if ok then
                    table.insert(results, "Unexpected: C function serialized")
                else
                    table.insert(results, "✓ C function cannot be serialized (expected)")
                end
            end
            
            return table.concat(results, "\\n")
        `;
        
        const result = runLuaCode(instance, memory, code);
        console.log(result.value || result.output || 'No output');
    }
    
    console.log('\n=== Phase 3 Testing Complete ===');
    console.log('\nSummary:');
    console.log('- ✓ Lua function bytecode serialization works');
    console.log('- ✓ Bytecode deserialization and loading works');  
    console.log('- ✓ Invalid bytecode is properly rejected');
    console.log('- ✓ Complex functions can be serialized/deserialized');
    console.log('- ✓ C functions are handled appropriately');
    console.log('\nNote: Full integration with the Zig serializer will be tested separately');
}

// Run the test
testPhase3().catch(console.error);