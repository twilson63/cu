const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Phase 2: Function Serialization\n');

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
        
        // Test 1: Test if string.dump is available
        console.log('Test 1: Check string.dump availability');
        const test1Code = `
            if string and string.dump then
                return "string.dump is available"
            else
                return "string.dump is NOT available"
            end
        `;
        
        let codeLen = writeString(test1Code, bufferPtr);
        let result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Failed to execute test');
        }
        
        // Test 2: Serialize a simple function using string.dump
        console.log('\nTest 2: Serialize a function with string.dump');
        const test2Code = `
            -- Create a simple function
            local function test_func(x)
                return x * 2
            end
            
            -- Dump the function to bytecode
            local bytecode = string.dump(test_func, true)
            
            -- Return info about the bytecode
            if bytecode then
                return string.format("Bytecode generated: %d bytes, first byte: 0x%02x", 
                    #bytecode, string.byte(bytecode, 1))
            else
                return "Failed to dump function"
            end
        `;
        
        codeLen = writeString(test2Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Failed to execute test');
        }
        
        // Test 3: Round-trip test - dump and load a function
        console.log('\nTest 3: Round-trip function serialization');
        const test3Code = `
            -- Original function
            local function original(x, y)
                return x + y * 2
            end
            
            -- Dump to bytecode
            local bytecode = string.dump(original, true)
            
            -- Load from bytecode
            local loaded_func, err = load(bytecode, "=loaded", "b")
            
            if loaded_func then
                -- Test the loaded function
                local result1 = original(5, 3)
                local result2 = loaded_func(5, 3)
                
                if result1 == result2 then
                    return string.format("Success! Both functions return: %d", result1)
                else
                    return string.format("Mismatch! Original: %d, Loaded: %d", result1, result2)
                end
            else
                return "Failed to load function: " .. tostring(err)
            end
        `;
        
        codeLen = writeString(test3Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Failed to execute test');
        }
        
        // Test 4: Test with a closure
        console.log('\nTest 4: Function with closure (upvalues)');
        const test4Code = `
            -- Function with upvalue
            local counter = 10
            local function add_counter(x)
                return x + counter
            end
            
            -- Dump the function
            local bytecode = string.dump(add_counter, true)
            
            -- Note: Loading will fail for functions with upvalues
            local loaded_func, err = load(bytecode, "=loaded", "b")
            
            if loaded_func then
                -- This shouldn't happen with upvalues
                return "Unexpectedly loaded function with upvalues"
            else
                -- Expected behavior - can't directly load functions with upvalues
                return "Expected: Cannot load function with upvalues (Phase 3 will handle this)"
            end
        `;
        
        codeLen = writeString(test4Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Failed to execute test');
        }
        
        // Test 5: Test C function detection
        console.log('\nTest 5: C function detection');
        const test5Code = `
            -- Test different function types
            local lua_func = function(x) return x end
            local c_func = print  -- C function
            
            -- Try to dump each
            local lua_success, lua_result = pcall(string.dump, lua_func)
            local c_success, c_result = pcall(string.dump, c_func)
            
            local report = {}
            
            if lua_success then
                table.insert(report, string.format("Lua function: dumped to %d bytes", #lua_result))
            else
                table.insert(report, "Lua function: " .. tostring(lua_result))
            end
            
            if c_success then
                table.insert(report, string.format("C function: dumped to %d bytes", #c_result))
            else
                table.insert(report, "C function: " .. tostring(c_result):sub(1, 50))
            end
            
            return table.concat(report, "\\n")
        `;
        
        codeLen = writeString(test5Code, bufferPtr);
        result = exports.compute(bufferPtr, codeLen);
        
        if (result > 0) {
            console.log('  Result:', readString(bufferPtr, result));
        } else {
            console.log('  Failed to execute test');
        }
        
        console.log('\n✅ Phase 2 testing complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTests();