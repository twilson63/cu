// Test script for memory management fix
const fs = require('fs');
const path = require('path');

// Decode serialized Lua values
function decodeResult(bytes) {
    if (bytes.length < 5) return 'Invalid result';
    
    // First 4 bytes are output length (little-endian)
    const outputLen = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
    
    // Skip output for now and decode the return value
    let offset = 4 + outputLen;
    
    if (offset >= bytes.length) return 'No return value';
    
    const type = bytes[offset];
    offset++;
    
    switch (type) {
        case 0x00: // nil
            return null;
            
        case 0x01: // boolean
            return bytes[offset] !== 0;
            
        case 0x02: // integer
            if (offset + 8 > bytes.length) return 'Truncated integer';
            // Read 8-byte integer (little-endian)
            let value = 0;
            for (let i = 0; i < 8; i++) {
                value += bytes[offset + i] * Math.pow(256, i);
            }
            // Handle signed values
            if (value > 0x7FFFFFFFFFFFFFFF) {
                value -= 0x10000000000000000;
            }
            return value;
            
        case 0x03: // float
            if (offset + 8 > bytes.length) return 'Truncated float';
            // Read 8-byte float (IEEE 754 double)
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            for (let i = 0; i < 8; i++) {
                view.setUint8(i, bytes[offset + i]);
            }
            return view.getFloat64(0, true); // little-endian
            
        case 0x04: // string
            if (offset + 4 > bytes.length) return 'Truncated string length';
            // Read string length (4 bytes, little-endian)
            const strLen = bytes[offset] | (bytes[offset + 1] << 8) | 
                         (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
            offset += 4;
            
            if (offset + strLen > bytes.length) return 'Truncated string data';
            const decoder = new TextDecoder();
            return decoder.decode(bytes.slice(offset, offset + strLen));
            
        default:
            // Check if it's a type name string (for tables, functions, etc.)
            if (offset + type <= bytes.length) {
                const decoder = new TextDecoder();
                const typeName = decoder.decode(bytes.slice(offset - 1, offset - 1 + type));
                if (typeName.match(/^(table|function|userdata|thread)$/)) {
                    return `<${typeName}>`;
                }
            }
            return `Unknown type: 0x${type.toString(16)}`;
    }
}

async function test() {
    console.log("Loading WASM module...");
    const wasmBuffer = fs.readFileSync(path.join(__dirname, 'web/lua.wasm'));
    
    const imports = {
        env: {
            js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => 0,
            js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, val_len) => -1,
            js_ext_table_delete: (table_id, key_ptr, key_len) => 0,
            js_ext_table_size: (table_id) => 0,
            js_ext_table_keys: (table_id, buf_ptr, buf_len) => 0,
            js_time_now: () => Date.now(),
        }
    };
    
    const wasmModule = new WebAssembly.Module(wasmBuffer);
    const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
    
    console.log("\nExported functions:");
    console.log(Object.keys(wasmInstance.exports).sort());
    
    // Test init
    console.log("\nTesting init()...");
    if (wasmInstance.exports.init) {
        const result = wasmInstance.exports.init();
        console.log(`init() returned: ${result}`);
        
        if (result === 0) {
            console.log("✅ SUCCESS: Lua VM initialized successfully!");
            
            // Test compute if available
            if (wasmInstance.exports.compute && wasmInstance.exports.get_buffer_ptr) {
                console.log("\nTesting compute()...");
                const bufferPtr = wasmInstance.exports.get_buffer_ptr();
                const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
                
                // Test multiple Lua expressions
                const tests = [
                    "return 2 + 2",
                    "return 'Hello, Lua!'",
                    "return 10 * 5",
                    "return math.sqrt(16)",
                    "return {1, 2, 3}",
                    "local x = 42; return x",
                    "return type({})",
                    "print('Testing print function')",
                    "print(1, 2, 3)",
                    "for i=1,3 do print('Loop ' .. i) end",
                    "return math.pi",
                    "return true",
                    "return false",
                    "return nil"
                ];
                
                for (const code of tests) {
                    console.log(`\nTesting: ${code}`);
                    
                    const encoder = new TextEncoder();
                    const codeBytes = encoder.encode(code);
                    
                    // Refresh memory view in case it grew
                    const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
                    
                    for (let i = 0; i < codeBytes.length; i++) {
                        memory[bufferPtr + i] = codeBytes[i];
                    }
                    
                    const result = wasmInstance.exports.compute(bufferPtr, codeBytes.length);
                    console.log(`compute() returned: ${result} bytes`);
                    
                    if (result > 0) {
                        const resultBytes = memory.slice(bufferPtr, bufferPtr + result);
                        console.log(`Raw output: [${Array.from(resultBytes).join(', ')}]`);
                        
                        // Decode the serialized result
                        const decoded = decodeResult(resultBytes);
                        console.log(`Decoded value: ${decoded}`);
                    } else if (result < 0) {
                        const errorLen = -result;
                        const decoder = new TextDecoder();
                        const error = decoder.decode(memory.slice(bufferPtr, bufferPtr + errorLen));
                        console.log(`Error: "${error}"`);
                    }
                }
            }
        } else {
            console.log("❌ FAILED: Lua VM initialization failed");
        }
    } else {
        console.log("❌ init() function not found in exports");
    }
}

test().catch(console.error);