const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, setInput, getOutput, setMetadata, clearIo, reset } = require('./node-test-utils');

describe('_io Table API', () => {
  beforeEach(async () => {
    reset();
    await loadWasm();
    init();
  });

  it('Can set input and read it in Lua', () => {
    setInput({ name: 'Alice', age: 30 });
    
    const bytes = compute(`
      local name = _io.input.name
      local age = _io.input.age
      return name .. " is " .. age .. " years old"
    `);
    
    assert.ok(bytes > 0);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'Alice is 30 years old');
  });

  it('Can set simple output from Lua', () => {
    const bytes = compute('_io.output = 42');
    assert.ok(bytes >= 0);
    
    const output = getOutput();
    assert.strictEqual(output, 42);
  });

  it('Can set metadata and use it in Lua', () => {
    setMetadata({
      version: '1.0',
      user: 'test-user'
    });
    
    const bytes = compute(`
      return "Version: " .. _io.meta.version .. ", User: " .. _io.meta.user
    `);
    
    assert.ok(bytes > 0);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'Version: 1.0, User: test-user');
  });

  it('Can pass arrays through _io.input', () => {
    setInput([10, 20, 30, 40, 50]);
    
    const bytes = compute(`
      local sum = 0
      for i = 1, 5 do
        sum = sum + _io.input[i]
      end
      return sum
    `);
    
    assert.ok(bytes > 0);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 150);
  });

  it('Can pass nested objects through _io.input', () => {
    setInput({
      user: {
        name: 'Bob',
        profile: {
          age: 25,
          city: 'NYC'
        }
      }
    });
    
    const bytes = compute(`
      return _io.input.user.name .. " from " .. _io.input.user.profile.city
    `);
    
    assert.ok(bytes > 0);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'Bob from NYC');
  });

  it('clearIo removes input and meta', () => {
    setInput({ test: 'input' });
    setMetadata({ test: 'meta' });
    
    clearIo();
    
    const bytes = compute(`
      local inp = _io.input
      local met = _io.meta
      if inp == nil and met == nil then
        return "all cleared"
      else
        return "not cleared"
      end
    `);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'all cleared');
  });

  it('Can use _io for simple data flow', () => {
    setInput({ x: 7, y: 6 });
    
    compute(`
      local x = _io.input.x
      local y = _io.input.y
      _io.output = x * y
    `);
    
    const output = getOutput();
    assert.strictEqual(output, 42);
  });

  it('Can set string output from Lua', () => {
    compute('_io.output = "hello world"');
    const output = getOutput();
    assert.strictEqual(output, 'hello world');
  });

  it('Can set boolean output from Lua', () => {
    compute('_io.output = true');
    const output = getOutput();
    assert.strictEqual(output, true);
  });

  it('Can pass empty object through input', () => {
    setInput({});
    
    const bytes = compute(`
      -- Empty objects still create a table reference in our implementation
      -- which has a metatable, so we just verify it exists as a table
      if type(_io.input) == "table" then
        return "table"
      else
        return "not table"
      end
    `);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'table');
  });

  it('Can pass empty array through input', () => {
    setInput([]);
    
    const bytes = compute(`
      local len = 0
      for i = 1, 100 do
        if _io.input[i] == nil then
          break
        end
        len = len + 1
      end
      return len
    `);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 0);
  });
});
