const fs = require('fs');

function inspectWasm(filename) {
    const buffer = Buffer.from(fs.readFileSync(filename));
    
    // Check magic number
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x6d736100) {
        console.log(`❌ Invalid WASM magic: ${magic.toString(16)}`);
        return;
    }
    
    const version = buffer.readUInt32LE(4);
    console.log(`WASM Version: ${version}`);
    
    // Parse sections
    let pos = 8;
    
    const sectionNames = {
        0: 'Custom', 1: 'Type', 2: 'Import', 3: 'Function', 4: 'Table',
        5: 'Memory', 6: 'Global', 7: 'Export', 8: 'Start', 9: 'Element',
        10: 'Code', 11: 'Data'
    };
    
    function readLEB128() {
        let result = 0, shift = 0, byte;
        do {
            byte = buffer[pos++];
            result |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);
        return result;
    }
    
    while (pos < buffer.length) {
        const sectionId = buffer[pos];
        const sectionName = sectionNames[sectionId] || `Unknown(${sectionId})`;
        
        pos++;
        const size = readLEB128();
        const sectionStart = pos;
        const sectionEnd = pos + size;
        
        console.log(`\nSection ${sectionId}: ${sectionName} (size: ${size} bytes)`);
        
        if (sectionId === 7) {  // Export section
            const count = readLEB128();
            console.log(`  Number of exports: ${count}`);
            
            for (let i = 0; i < count && pos < sectionEnd; i++) {
                const nameLen = readLEB128();
                const name = buffer.toString('utf-8', pos, pos + nameLen);
                pos += nameLen;
                
                const kind = buffer[pos++];
                const index = readLEB128();
                
                const kindNames = {0: 'function', 1: 'table', 2: 'memory', 3: 'global'};
                console.log(`    ${i+1}. "${name}" (${kindNames[kind] || kind}, index: ${index})`);
            }
        } else if (sectionId === 8) {  // Start section
            const startIdx = readLEB128();
            console.log(`  Start function index: ${startIdx}`);
        }
        
        pos = sectionEnd;
    }
}

console.log('\n' + '='.repeat(60));
console.log('WASM BINARY INSPECTION');
console.log('='.repeat(60) + '\n');

console.log('File: web/lua.wasm');
inspectWasm('./web/lua.wasm');
