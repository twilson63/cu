// lua-persistent.js - Simplified version for testing
class CuPersistent {
    constructor() {
        this.instance = null;
        this.memory = null;
        this.bufferPtr = 0;
        this.bufferSize = 0;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
        this.externalTables = new Map();
        this.totalExternalBytes = 0;
    }

    async load(wasmPath = 'cu.wasm') {
        // Add deprecation warning
        if (wasmPath.includes('lua.wasm')) {
            console.warn('[DEPRECATED] lua.wasm → cu.wasm. Update your code. This file will be removed in v3.0.');
        }
        
        const imports = {
            env: {
                js_time_now: () => Date.now(),
                
                js_ext_table_set: (tableId, keyPtr, keyLen, valPtr, valLen) => {
                    if (!this.externalTables.has(tableId)) {
                        this.externalTables.set(tableId, new Map());
                    }
                    
                    const table = this.externalTables.get(tableId);
                    const keyBytes = new Uint8Array(this.memory.buffer, keyPtr, keyLen);
                    const valBytes = new Uint8Array(this.memory.buffer, valPtr, valLen);
                    const keyStr = btoa(String.fromCharCode(...keyBytes));
                    const valCopy = new Uint8Array(valBytes);
                    
                    table.set(keyStr, valCopy);
                    this.totalExternalBytes += valBytes.length;
                    return 0;
                },

                js_ext_table_get: (tableId, keyPtr, keyLen, valPtr, maxLen) => {
                    const table = this.externalTables.get(tableId);
                    if (!table) return -1;
                    
                    const keyBytes = new Uint8Array(this.memory.buffer, keyPtr, keyLen);
                    const keyStr = btoa(String.fromCharCode(...keyBytes));
                    const valBytes = table.get(keyStr);
                    if (!valBytes) return -1;
                    
                    const len = Math.min(valBytes.length, maxLen);
                    new Uint8Array(this.memory.buffer, valPtr, len).set(valBytes.slice(0, len));
                    return len;
                },

                js_ext_table_delete: (tableId, keyPtr, keyLen) => {
                    const table = this.externalTables.get(tableId);
                    if (!table) return -1;
                    
                    const keyBytes = new Uint8Array(this.memory.buffer, keyPtr, keyLen);
                    const keyStr = btoa(String.fromCharCode(...keyBytes));
                    const valBytes = table.get(keyStr);
                    
                    if (valBytes) {
                        this.totalExternalBytes -= valBytes.length;
                        table.delete(keyStr);
                    }
                    return 0;
                },

                js_ext_table_size: (tableId) => {
                    const table = this.externalTables.get(tableId);
                    return table ? table.size : 0;
                },

                js_ext_table_keys: (tableId, bufPtr, maxLen) => {
                    const table = this.externalTables.get(tableId);
                    if (!table) return 0;
                    
                    const buffer = new Uint8Array(this.memory.buffer, bufPtr, maxLen);
                    let offset = 0;
                    
                    const count = table.size;
                    buffer[offset++] = count & 0xFF;
                    buffer[offset++] = (count >> 8) & 0xFF;
                    buffer[offset++] = (count >> 16) & 0xFF;
                    buffer[offset++] = (count >> 24) & 0xFF;
                    
                    for (const [keyStr, _] of table) {
                        const keyBinary = atob(keyStr);
                        const keyBytes = new Uint8Array(keyBinary.length);
                        for (let i = 0; i < keyBinary.length; i++) {
                            keyBytes[i] = keyBinary.charCodeAt(i);
                        }
                        
                        if (offset + 4 + keyBytes.length > maxLen) break;
                        
                        const len = keyBytes.length;
                        buffer[offset++] = len & 0xFF;
                        buffer[offset++] = (len >> 8) & 0xFF;
                        buffer[offset++] = (len >> 16) & 0xFF;
                        buffer[offset++] = (len >> 24) & 0xFF;
                        
                        buffer.set(keyBytes, offset);
                        offset += keyBytes.length;
                    }
                    
                    return offset;
                }
            }
        };

        // Handle both absolute and relative URLs
        const url = wasmPath.startsWith('http') ? wasmPath : `http://localhost:8000/${wasmPath}`;
        const response = await fetch(url);
        const bytes = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(bytes, imports);
        
        this.instance = result.instance;
        this.memory = this.instance.exports.memory;
        this.bufferPtr = this.instance.exports.get_buffer_ptr();
        this.bufferSize = this.instance.exports.get_buffer_size();
        
        const initResult = this.instance.exports.init();
        if (initResult !== 0) {
            throw new Error('Failed to initialize Lua VM');
        }
        
        console.log('✅ Lua runtime loaded!');
        return this;
    }

    eval(code) {
        const input = this.encoder.encode(code);
        if (input.length > this.bufferSize) {
            throw new Error(`Input too large: ${input.length} > ${this.bufferSize}`);
        }
        
        new Uint8Array(this.memory.buffer, this.bufferPtr, input.length).set(input);
        
        const resultLen = this.instance.exports.compute(this.bufferPtr, input.length);
        if (resultLen < 0) {
            return null; // Error case
        }
        
        // Deserialize the result
        const buffer = new Uint8Array(this.memory.buffer, this.bufferPtr, resultLen);
        return this.deserializeResult(buffer, resultLen);
    }
    
    deserializeResult(buffer, length) {
        if (length < 5) {
            return { output: '', value: null };
        }
        
        // Read output length (first 4 bytes)
        const outputLen = buffer[0] | (buffer[1] << 8) | (buffer[2] << 16) | (buffer[3] << 24);
        let offset = 4;
        
        // Read output string
        const output = this.decoder.decode(buffer.slice(offset, offset + outputLen));
        offset += outputLen;
        
        // Read result type and value
        if (offset >= length) {
            return { output, value: null };
        }
        
        const typeTag = buffer[offset++];
        let value = null;
        
        if (typeTag === 0x00) { // nil
            value = null;
        } else if (typeTag === 0x01) { // boolean
            value = buffer[offset] !== 0;
        } else if (typeTag === 0x02) { // integer
            // Read as little-endian i64 using DataView
            const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
            const bigIntValue = view.getBigInt64(0, true);
            // Convert to number if it fits safely
            if (bigIntValue >= Number.MIN_SAFE_INTEGER && bigIntValue <= Number.MAX_SAFE_INTEGER) {
                value = Number(bigIntValue);
            } else {
                value = bigIntValue; // Keep as BigInt for large values
            }
        } else if (typeTag === 0x03) { // float
            const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 8);
            value = view.getFloat64(0, true);
        } else if (typeTag === 0x04) { // string
            const strLen = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
            offset += 4;
            value = this.decoder.decode(buffer.slice(offset, offset + strLen));
        }
        
        return { output, value };
    }

    // Persistence
    createSnapshot() {
        return {
            timestamp: Date.now(),
            tables: Array.from(this.externalTables.entries()).map(([id, table]) => ({
                id,
                entries: Array.from(table.entries())
            }))
        };
    }

    restoreSnapshot(snapshot) {
        this.externalTables.clear();
        this.totalExternalBytes = 0;
        
        for (const tableData of snapshot.tables) {
            const table = new Map(tableData.entries);
            this.externalTables.set(tableData.id, table);
            for (const val of table.values()) {
                this.totalExternalBytes += val.length;
            }
        }
        console.log(`✅ Restored snapshot from ${new Date(snapshot.timestamp).toLocaleString()}`);
    }

    saveToLocalStorage(name = 'default') {
        const snapshot = this.createSnapshot();
        localStorage.setItem(`lua_snapshot_${name}`, JSON.stringify(snapshot));
        console.log(`💾 Saved: ${name}`);
    }

    loadFromLocalStorage(name = 'default') {
        const json = localStorage.getItem(`lua_snapshot_${name}`);
        if (!json) return false;
        this.restoreSnapshot(JSON.parse(json));
        return true;
    }

    getStats() {
        let totalItems = 0;
        for (const table of this.externalTables.values()) {
            totalItems += table.size;
        }
        
        return {
            linearMemoryMB: (this.memory.buffer.byteLength / 1024 / 1024).toFixed(2),
            externalTableCount: this.externalTables.size,
            externalTableItems: totalItems,
            externalMB: (this.totalExternalBytes / 1024 / 1024).toFixed(2)
        };
    }
}

export default CuPersistent;
