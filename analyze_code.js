const fs = require('fs');

const buffer = Buffer.from(fs.readFileSync('./web/lua.wasm'));
let pos = 8;

function readLEB128() {
    let result = 0, shift = 0, byte;
    do {
        byte = buffer[pos++];
        result |= (byte & 0x7f) << shift;
        shift += 7;
    } while (byte & 0x80);
    return result;
}

// Skip to code section
while (pos < buffer.length) {
    const sectionId = buffer[pos++];
    const size = readLEB128();
    
    if (sectionId === 10) {  // Code section
        console.log(`\nCode section found at offset ${pos - 1}`);
        const count = readLEB128();
        console.log(`Number of functions: ${count}`);
        console.log(`First few bytes after count: ${buffer.slice(pos, pos+20).toString('hex')}`);
        break;
    }
    
    pos += size;
}
