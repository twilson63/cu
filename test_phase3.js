import fs from 'fs';

async function testPhase3() {
    const wasmBuffer = fs.readFileSync('./web/lua.wasm');
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
        env: {
            js_ext_table_set: () => 0,
            js_ext_table_get: () => -1,
            js_ext_table_delete: () => 0,
            js_ext_table_size: () => 0,
            js_ext_table_keys: () => 0,
        },
    });

    const wasm = wasmModule.instance.exports;
    const buffer = new Uint8Array(wasm.memory.buffer);
    
    function readString(ptr, len) {
        return new TextDecoder().decode(buffer.slice(ptr, ptr + len));
    }

    function writeString(ptr, str) {
        const encoded = new TextEncoder().encode(str);
        buffer.set(encoded, ptr);
        return encoded.length;
    }

    console.log('🧪 Phase 3 Test Suite: Error Handling & Output Capture');
    console.log('=' .repeat(60));

    const tests = [];

    console.log('\n✅ Test 1: Syntax Error Detection');
    {
        wasm.init();
        const code = 'if true then\n  print("missing end");';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        const isError = result < 0;
        const errorLen = Math.abs(result) - 1;
        const errorMsg = readString(0, errorLen);
        console.log(`   Result code: ${result}`);
        console.log(`   Error detected: ${isError}`);
        console.log(`   Error message: "${errorMsg}"`);
        tests.push(isError && errorMsg.includes('end'));
    }

    console.log('\n✅ Test 2: Runtime Error Detection');
    {
        wasm.init();
        const code = 'local x = 1 / 0; return x';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        const isError = result < 0;
        const errorLen = Math.abs(result) - 1;
        const errorMsg = readString(0, errorLen);
        console.log(`   Result code: ${result}`);
        console.log(`   Error detected: ${isError}`);
        console.log(`   Error message: "${errorMsg}"`);
        tests.push(isError);
    }

    console.log('\n✅ Test 3: Simple Print Output');
    {
        wasm.init();
        const code = 'print("Hello"); print("World"); return 42';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        console.log(`   Result: ${result}`);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const outputStr = readString(4, outputLen);
        console.log(`   Output length: ${outputLen}`);
        console.log(`   Output: "${outputStr}"`);
        tests.push(outputStr.includes('Hello') && outputStr.includes('World'));
    }

    console.log('\n✅ Test 4: Multiple Print Calls');
    {
        wasm.init();
        const code = `
            print("Line 1")
            print("Line 2")
            print("Line 3")
            return "done"
        `;
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const outputStr = readString(4, outputLen);
        console.log(`   Output: "${outputStr}"`);
        tests.push(outputStr.includes('Line 1') && outputStr.includes('Line 3'));
    }

    console.log('\n✅ Test 5: Error Recovery');
    {
        wasm.init();
        
        const badCode = 'invalid syntax here {{{';
        const badLen = writeString(0, badCode);
        const badResult = wasm.eval(badLen);
        console.log(`   First (bad code) result: ${badResult}`);
        
        const goodCode = 'print("Recovery successful"); return 99';
        const goodLen = writeString(0, goodCode);
        const goodResult = wasm.eval(goodLen);
        console.log(`   Second (good code) result: ${goodResult}`);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const outputStr = readString(4, outputLen);
        console.log(`   Recovery output: "${outputStr}"`);
        tests.push(badResult < 0 && goodResult > 0);
    }

    console.log('\n✅ Test 6: Print with Multiple Types');
    {
        wasm.init();
        const code = `
            print("String", 42, 3.14, true, false, nil)
            return "mixed"
        `;
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const outputStr = readString(4, outputLen);
        console.log(`   Output: "${outputStr}"`);
        tests.push(
            outputStr.includes('String') &&
            outputStr.includes('42') &&
            outputStr.includes('3.14') &&
            outputStr.includes('true')
        );
    }

    console.log('\n✅ Test 7: Return Value Encoding');
    {
        wasm.init();
        const code = 'return "Hello WASM"';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const resultType = buffer[4 + outputLen];
        const resultStr = readString(4 + outputLen + 5, 15);
        console.log(`   Output length: ${outputLen}`);
        console.log(`   Result type byte: ${resultType}`);
        console.log(`   Result: "${resultStr}"`);
        tests.push(resultStr.includes('Hello WASM'));
    }

    console.log('\n✅ Test 8: Number Return Value');
    {
        wasm.init();
        const code = 'return 12345';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const typeMarker = buffer[4 + outputLen];
        console.log(`   Type marker: ${typeMarker}`);
        console.log(`   Total encoded size: ${result}`);
        tests.push(result > 4 && outputLen === 0);
    }

    console.log('\n✅ Test 9: Boolean Return Value');
    {
        wasm.init();
        const code = 'return true';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const typeMarker = buffer[4 + outputLen];
        const value = buffer[5 + outputLen];
        console.log(`   Type: ${typeMarker} (1=boolean)`);
        console.log(`   Value: ${value === 1 ? 'true' : 'false'}`);
        tests.push(typeMarker === 1 && value === 1);
    }

    console.log('\n✅ Test 10: Nil Return Value');
    {
        wasm.init();
        const code = 'return nil';
        const codeLen = writeString(0, code);
        const result = wasm.eval(codeLen);
        
        const outputLen = new Uint32Array(wasm.memory.buffer, 0, 1)[0];
        const typeMarker = buffer[4 + outputLen];
        console.log(`   Type marker: ${typeMarker} (0=nil)`);
        tests.push(typeMarker === 0);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Results: ${tests.filter(t => t).length}/${tests.length} passed`);
    
    if (tests.every(t => t)) {
        console.log('✅ All Phase 3 tests PASSED!');
        process.exit(0);
    } else {
        console.log('❌ Some tests FAILED');
        tests.forEach((t, i) => {
            console.log(`   Test ${i + 1}: ${t ? '✅' : '❌'}`);
        });
        process.exit(1);
    }
}

testPhase3().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
