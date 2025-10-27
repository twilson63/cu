const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('Cu Computation', () => {
  beforeEach(async () => {
    reset();
    await loadWasm();
    init();
  });

  it('Executes simple arithmetic', () => {
    const bytes = compute('return 2 + 2');
    assert.ok(bytes > 0, 'Should return positive byte count');
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 4);
  });

  it('Executes string operations', () => {
    const bytes = compute('return "Hello" .. " " .. "World"');
    assert.ok(bytes > 0);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'Hello World');
  });

  it('Sets and retrieves variables', () => {
    const setBytes = compute('x = 42');
    assert.ok(setBytes >= 0);
    
    const getBytes = compute('return x');
    assert.ok(getBytes > 0);
    
    const result = readResult(getBufferPtr(), getBytes);
    assert.strictEqual(result.result, 42);
  });

  it('Handles print statements', () => {
    const bytes = compute('print("Hello from Lua")');
    assert.ok(bytes > 0);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.ok(result.output.includes('Hello from Lua'));
  });

  it('Returns nil correctly', () => {
    const bytes = compute('return nil');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, null);
  });

  it('Executes table operations', () => {
    const bytes = compute(`
      local t = {a = 1, b = 2, c = 3}
      return t.a + t.b + t.c
    `);
    assert.ok(bytes > 0);
    
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 6);
  });

  it('Handles multiple return values (returns last)', () => {
    // Note: Our serializer currently returns the last value on the stack
    const bytes = compute('return 10, 20, 30');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 30);
  });

  it('Executes loops', () => {
    const bytes = compute(`
      local sum = 0
      for i = 1, 10 do
        sum = sum + i
      end
      return sum
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 55); // 1+2+3...+10 = 55
  });

  it('Executes conditionals', () => {
    const bytes = compute(`
      local x = 5
      if x > 3 then
        return "greater"
      else
        return "lesser"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'greater');
  });

  it('Handles boolean values', () => {
    const bytes = compute('return true');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, true);
    
    const bytes2 = compute('return false');
    const result2 = readResult(getBufferPtr(), bytes2);
    assert.strictEqual(result2.result, false);
  });

  it('Handles floating point numbers', () => {
    const bytes = compute('return 3.14');
    const result = readResult(getBufferPtr(), bytes);
    assert.ok(Math.abs(result.result - 3.14) < 0.01);
  });

  it('Concatenates strings with numbers', () => {
    const bytes = compute('return "The answer is " .. 42');
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'The answer is 42');
  });
});
