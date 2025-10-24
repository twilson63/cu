const fs = require('fs');
const path = require('path');

// Check command line arguments
const wasmPath = process.argv[2] || 'web/lua.wasm';

if (!fs.existsSync(wasmPath)) {
    console.error(`❌ WASM file not found: ${wasmPath}`);
    process.exit(1);
}

console.log(`📋 Analyzing WASM file: ${wasmPath}`);

try {
    const wasmBuffer = fs.readFileSync(wasmPath);
    const wasmModule = new WebAssembly.Module(wasmBuffer);
    
    // Get exports
    const exports = WebAssembly.Module.exports(wasmModule);
    console.log('\n✅ Exports found:');
    exports.forEach(exp => {
        console.log(`   - ${exp.name} (${exp.kind})`);
    });
    
    // Get imports
    const imports = WebAssembly.Module.imports(wasmModule);
    console.log('\n📥 Imports required:');
    imports.forEach(imp => {
        console.log(`   - ${imp.module}.${imp.name} (${imp.kind})`);
    });
    
    // Check for our required exports
    const requiredExports = [
        'init',
        'compute', 
        'get_buffer_ptr',
        'get_buffer_size',
        'get_memory_stats',
        'run_gc'
    ];
    
    const exportNames = exports.map(e => e.name);
    const missing = requiredExports.filter(name => !exportNames.includes(name));
    
    if (missing.length > 0) {
        console.error('\n❌ Missing required exports:');
        missing.forEach(name => console.error(`   - ${name}`));
        
        console.log('\n💡 Suggestions:');
        console.log('   1. The functions may have been eliminated as dead code');
        console.log('   2. Try using zig build-lib instead of zig build-exe');
        console.log('   3. Add references to the functions to prevent elimination');
        console.log('   4. Use wasm-ld directly with --export flags');
        
        process.exit(1);
    } else {
        console.log('\n✅ All required exports are present!');
    }
    
    // Additional info
    const stats = fs.statSync(wasmPath);
    console.log(`\n📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
    
} catch (error) {
    console.error('❌ Error analyzing WASM:', error.message);
    process.exit(1);
}