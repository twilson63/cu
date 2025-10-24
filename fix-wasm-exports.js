const fs = require('fs');

// Read the WASM file
const wasmBuffer = fs.readFileSync('web/lua.wasm');
const wasmModule = new WebAssembly.Module(wasmBuffer);

// Get imports and exports
const imports = WebAssembly.Module.imports(wasmModule);
const exports = WebAssembly.Module.exports(wasmModule);

console.log('Current exports:');
exports.forEach(e => console.log(`  ${e.name} (${e.kind})`));

console.log('\nImports:');
imports.forEach(i => console.log(`  ${i.module}.${i.name} (${i.kind})`));

// Unfortunately, we can't modify a compiled WASM module directly in Node.js
// We need to use a different approach

console.log('\nThe functions exist in the binary but are not exported.');
console.log('We need to use a WASM manipulation tool or rebuild with different flags.');
