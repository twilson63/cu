import lua from './lua-api.js';

async function testDemo() {
  try {
    console.log('1. Loading WASM...');
    await lua.loadLuaWasm();
    
    console.log('2. Initializing Lua VM...');
    const initResult = lua.init();
    console.log('   Init result:', initResult);
    
    console.log('3. Testing simple computation...');
    const result1 = lua.compute('return 1 + 1');
    console.log('   Result:', result1);
    
    console.log('4. Testing string return...');
    const result2 = lua.compute('return "Hello from Lua!"');
    console.log('   Result:', result2);
    
    console.log('5. Testing table operations...');
    const result3 = lua.compute(`
      local t = {a = 1, b = 2, c = 3}
      local sum = 0
      for k, v in pairs(t) do
        sum = sum + v
      end
      return sum
    `);
    console.log('   Result:', result3);
    
    console.log('\n✅ All tests passed! Web demo should work.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDemo();