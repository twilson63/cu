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
                console.log(`[DEBUG] Stored in table ${tableId}: ${key} = ${value.length} bytes`);
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

async function testDebug() {
    console.log('Debug Phase 3 Function Serialization\n');
    
    const { instance, memory } = await loadWasm();
    const exports = instance.exports;
    
    // Initialize Lua state
    const initResult = exports.init();
    console.log('Init result:', initResult);
    
    // Get buffer info
    const bufferPtr = exports.get_buffer_ptr();
    const bufferSize = exports.get_buffer_size();
    console.log('Buffer ptr:', bufferPtr);
    console.log('Buffer size:', bufferSize);
    
    // Simple test code
    const code = `return 42`;
    
    // Write code to buffer
    const encoder = new TextEncoder();
    const codeBytes = encoder.encode(code);
    console.log('Code bytes length:', codeBytes.length);
    
    const memView = new Uint8Array(memory.buffer);
    memView.set(codeBytes, bufferPtr);
    
    // Run the code
    const result = exports.compute(bufferPtr, codeBytes.length);
    console.log('Compute result:', result);
    
    // Read raw buffer output
    console.log('\nRaw buffer output (first 100 bytes):');
    const rawBytes = memView.slice(bufferPtr, bufferPtr + Math.min(100, result));
    console.log('Bytes:', Array.from(rawBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    
    // Decode the result structure
    if (result > 0) {
        // First 4 bytes: output length
        const outputLen = memView[bufferPtr] | 
                         (memView[bufferPtr + 1] << 8) |
                         (memView[bufferPtr + 2] << 16) |
                         (memView[bufferPtr + 3] << 24);
        console.log('\nOutput length:', outputLen);
        
        // Next bytes: printed output
        if (outputLen > 0) {
            const output = new TextDecoder().decode(memView.slice(bufferPtr + 4, bufferPtr + 4 + outputLen));
            console.log('Printed output:', JSON.stringify(output));
        }
        
        // Remaining bytes: serialized return value
        const valueOffset = 4 + outputLen;
        if (result > valueOffset) {
            const valueBytes = memView.slice(bufferPtr + valueOffset, bufferPtr + result);
            console.log('\nSerialized value bytes:', Array.from(valueBytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            // Decode the value
            if (valueBytes.length > 0) {
                const type = valueBytes[0];
                console.log('Type byte:', '0x' + type.toString(16).padStart(2, '0'));
                
                switch (type) {
                    case 0x00:
                        console.log('Value: nil');
                        break;
                    case 0x01:
                        console.log('Value: boolean', valueBytes[1] !== 0);
                        break;
                    case 0x02:
                        // Integer
                        if (valueBytes.length >= 9) {
                            let val = 0n;
                            for (let i = 0; i < 8; i++) {
                                val |= BigInt(valueBytes[1 + i]) << (BigInt(i) * 8n);
                            }
                            // Convert to signed
                            if (val >= (1n << 63n)) {
                                val = val - (1n << 64n);
                            }
                            console.log('Value: integer', Number(val));
                        }
                        break;
                    case 0x03:
                        // Float  
                        if (valueBytes.length >= 9) {
                            const buf = new ArrayBuffer(8);
                            const view = new DataView(buf);
                            for (let i = 0; i < 8; i++) {
                                view.setUint8(i, valueBytes[1 + i]);
                            }
                            console.log('Value: float', view.getFloat64(0, true));
                        }
                        break;
                    case 0x04:
                        // String
                        if (valueBytes.length >= 5) {
                            const len = valueBytes[1] | (valueBytes[2] << 8) | (valueBytes[3] << 16) | (valueBytes[4] << 24);
                            const str = new TextDecoder().decode(valueBytes.slice(5, 5 + len));
                            console.log('Value: string', JSON.stringify(str));
                        }
                        break;
                    default:
                        // Unknown type - try to decode as text
                        const text = new TextDecoder().decode(valueBytes);
                        console.log('Value: unknown type', JSON.stringify(text));
                }
            }
        }
    }
    
    console.log('\n=== Now test function serialization ===');
    
    const funcCode = `
        function double(x) 
            return x * 2 
        end
        local bytecode = string.dump(double, true)
        Memory.func_bytecode = bytecode
        print("Stored bytecode length: " .. #bytecode)
        return double(21)
    `;
    
    const funcCodeBytes = encoder.encode(funcCode);
    memView.set(funcCodeBytes, bufferPtr);
    
    const funcResult = exports.compute(bufferPtr, funcCodeBytes.length);
    console.log('\nFunction test result:', funcResult);
    
    if (funcResult > 0) {
        const outputLen = memView[bufferPtr] | 
                         (memView[bufferPtr + 1] << 8) |
                         (memView[bufferPtr + 2] << 16) |
                         (memView[bufferPtr + 3] << 24);
        
        if (outputLen > 0) {
            const output = new TextDecoder().decode(memView.slice(bufferPtr + 4, bufferPtr + 4 + outputLen));
            console.log('Printed output:', output);
        }
        
        const valueOffset = 4 + outputLen;
        if (funcResult > valueOffset) {
            const valueBytes = memView.slice(bufferPtr + valueOffset, bufferPtr + funcResult);
            const type = valueBytes[0];
            
            if (type === 0x02 && valueBytes.length >= 9) {
                let val = 0n;
                for (let i = 0; i < 8; i++) {
                    val |= BigInt(valueBytes[1 + i]) << (BigInt(i) * 8n);
                }
                if (val >= (1n << 63n)) {
                    val = val - (1n << 64n);
                }
                console.log('Return value:', Number(val));
            }
        }
    }
}

// Run the debug test
testDebug().catch(console.error);