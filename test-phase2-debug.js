const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Phase 2: Debug string.dump\n');

// Minimal imports for WASM
const mockImports = {
    env: {
        js_ext_table_set: () => 0,
        js_ext_table_get: () => -1,
        js_ext_table_delete: () => 0,
        js_ext_table_size: () => 0,
        js_ext_table_keys: () => 0,
        js_time_now: () => Date.now(),
    }
};

async function runTests() {
    try {
        // Load WASM module
        const wasmPath = path.join(__dirname, 'web/lua.wasm');
        const wasmBuffer = fs.readFileSync(wasmPath);
        const wasmModule = new WebAssembly.Module(wasmBuffer);
        const instance = new WebAssembly.Instance(wasmModule, mockImports);
        
        const exports = instance.exports;
        const memory = exports.memory;
        const memView = new Uint8Array(memory.buffer);
        
        // Initialize Lua
        const initResult = exports.init();
        if (initResult !== 0) {
            throw new Error('Failed to initialize Lua');
        }
        console.log('✅ Lua initialized\n');
        
        // Get buffer info
        const bufferPtr = exports.get_buffer_ptr();
        const bufferSize = exports.get_buffer_size();
        
        // Helper to write string to memory
        function writeString(str, ptr) {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            for (let i = 0; i < bytes.length; i++) {
                memView[ptr + i] = bytes[i];
            }
            return bytes.length;
        }
        
        // Helper to read string from memory
        function readString(ptr, len) {
            const decoder = new TextDecoder();
            return decoder.decode(memView.slice(ptr, ptr + len));
        }
        
        // Test 1: Basic string.dump without formatting
        console.log('Test 1: Basic string.dump');
        const test1Code = `
            local function test_func(x)
                return x * 2
            end
            
            local bytecode = string.dump(test_func, true)
            
            if bytecode then
                return "Bytecode length: " .. tostring(#bytecode)
            else
                return "Failed to dump"
            end
        `;
        
        let codeLen = writeString(test1Code, bufferPtr);
        let result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Error code:', result);
        }
        
        // Test 2: Check bytecode structure
        console.log('\nTest 2: Bytecode structure');
        const test2Code = `
            local function test_func(x)
                return x * 2
            end
            
            local bytecode = string.dump(test_func, true)
            
            if bytecode then
                local bytes = {}
                for i = 1, math.min(10, #bytecode) do
                    table.insert(bytes, string.byte(bytecode, i))
                end
                return "First bytes: " .. table.concat(bytes, ", ")
            else
                return "No bytecode"
            end
        `;
        
        codeLen = writeString(test2Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Error code:', result);
        }
        
        // Test 3: Load bytecode
        console.log('\nTest 3: Load bytecode');
        const test3Code = `
            local function original(x)
                return x + 1
            end
            
            local bytecode = string.dump(original, true)
            local loaded_func = load(bytecode, "test", "b")
            
            if loaded_func then
                local result = loaded_func(10)
                return "Loaded function result: " .. tostring(result)
            else
                return "Failed to load"
            end
        `;
        
        codeLen = writeString(test3Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Error code:', result);
        }
        
        // Test 4: Try C function carefully
        console.log('\nTest 4: C function handling');
        const test4Code = `
            local success, err = pcall(function()
                local c_func = print
                return string.dump(c_func)
            end)
            
            if success then
                return "Unexpected: C function dumped"
            else
                return "Expected error (C functions cannot be dumped)"
            end
        `;
        
        codeLen = writeString(test4Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Error code:', result);
        }
        
        console.log('\n✅ Debug tests complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

runTests();