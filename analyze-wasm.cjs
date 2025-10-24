const fs = require('fs');

// Read the WASM file
const wasmBuffer = fs.readFileSync('web/lua.wasm');
const wasmModule = new WebAssembly.Module(wasmBuffer);

// Get imports and exports
const imports = WebAssembly.Module.imports(wasmModule);
const wasmExports = WebAssembly.Module.exports(wasmModule);

console.log('Current exports:');
wasmExports.forEach(e => console.log(`  ${e.name} (${e.kind})`));

console.log('\nImports:');
imports.forEach(i => console.log(`  ${i.module}.${i.name} (${i.kind})`));

console.log('\nThe functions exist in the binary but are not exported.');
console.log('We need to rebuild with proper export flags.');