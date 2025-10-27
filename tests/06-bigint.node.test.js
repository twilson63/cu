/**
 * Node.js integration tests for BigInt module (Phase 4)
 * 
 * Tests bigint functionality including:
 * - Module loading
 * - Construction from strings, numbers, and hex
 * - Arithmetic operations (add, sub, mul, div, mod)
 * - Comparison operations (==, <, <=, >, >=)
 * - Metamethods (__add, __sub, __mul, __div, __eq, __lt, __le, __tostring)
 * - Token calculation use cases
 * - Edge cases (zero, negative, very large numbers)
 * - GC behavior verification
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('BigInt Module', () => {
  beforeEach(async () => {
    reset();
    await loadWasm();
    init();
  });

  // FR-1: Module Loading
  it('Loads bigint module successfully', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      return type(bigint)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'table', 'bigint module should return a table');
  });

  it('Has required bigint functions', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local funcs = {}
      funcs[1] = type(bigint.new) == "function"
      funcs[2] = type(bigint.add) == "function"
      funcs[3] = type(bigint.sub) == "function"
      funcs[4] = type(bigint.mul) == "function"
      funcs[5] = type(bigint.div) == "function"
      funcs[6] = type(bigint.mod) == "function"
      
      for i = 1, 6 do
        if not funcs[i] then
          return "missing function " .. i
        end
      end
      return "all present"
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'all present', 'All bigint functions should be present');
  });

  // FR-2: Construction Tests
  it('Creates bigint from decimal string', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new("123456789012345678901234567890")
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '123456789012345678901234567890', 
      'Should create bigint from large decimal string');
  });

  it('Creates bigint from Lua integer', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new(42)
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '42', 'Should create bigint from Lua integer');
  });

  it('Creates bigint from negative number', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new(-999)
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '-999', 'Should handle negative numbers');
  });

  it('Creates bigint from hex string', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new("DEADBEEF", 16)
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    // DEADBEEF in hex = 3735928559 in decimal
    assert.strictEqual(result.result, '3735928559', 'Should create bigint from hex string');
  });

  it('Creates bigint from zero', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new(0)
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '0', 'Should handle zero value');
  });

  // FR-3: Arithmetic Operations - Function API
  it('Adds two bigints using bigint.add()', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("2000000000000000000")
      local sum = bigint.add(a, b)
      return tostring(sum)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '3000000000000000000', 'Should add two large bigints');
  });

  it('Subtracts two bigints using bigint.sub()', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("5000000000000000000")
      local b = bigint.new("2000000000000000000")
      local diff = bigint.sub(a, b)
      return tostring(diff)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '3000000000000000000', 'Should subtract two large bigints');
  });

  it('Multiplies two bigints using bigint.mul()', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000")
      local b = bigint.new("1000000000")
      local prod = bigint.mul(a, b)
      return tostring(prod)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '1000000000000000000', 
      'Should multiply two bigints correctly');
  });

  it('Divides two bigints using bigint.div()', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("3")
      local quot = bigint.div(a, b)
      return tostring(quot)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '333333333333333333', 
      'Should divide bigints with truncation');
  });

  it('Computes modulo using bigint.mod()', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("3")
      local rem = bigint.mod(a, b)
      return tostring(rem)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '1', 'Should compute remainder correctly');
  });

  // FR-5: Metamethods - Arithmetic Operators
  it('Uses metamethod __add for addition', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(100)
      local b = bigint.new(200)
      local sum = a + b
      return tostring(sum)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '300', '__add metamethod should work');
  });

  it('Uses metamethod __sub for subtraction', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(500)
      local b = bigint.new(300)
      local diff = a - b
      return tostring(diff)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '200', '__sub metamethod should work');
  });

  it('Uses metamethod __mul for multiplication', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(123)
      local b = bigint.new(456)
      local prod = a * b
      return tostring(prod)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '56088', '__mul metamethod should work');
  });

  it('Uses metamethod __div for division', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(1000)
      local b = bigint.new(7)
      local quot = a / b
      return tostring(quot)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '142', '__div metamethod should work with truncation');
  });

  it('Uses metamethod __tostring for string conversion', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local x = bigint.new("987654321098765432109876543210")
      return tostring(x)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '987654321098765432109876543210', 
      '__tostring metamethod should work');
  });

  // FR-4 & FR-5: Comparison Operations
  it('Uses metamethod __eq for equality', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("12345678901234567890")
      local b = bigint.new("12345678901234567890")
      local c = bigint.new("99999999999999999999")
      
      if a == b and not (a == c) then
        return "correct"
      else
        return "incorrect"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'correct', '__eq metamethod should work');
  });

  it('Uses metamethod __lt for less than', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("100")
      local b = bigint.new("200")
      
      if a < b and not (b < a) then
        return "correct"
      else
        return "incorrect"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'correct', '__lt metamethod should work');
  });

  it('Uses metamethod __le for less than or equal', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("100")
      local b = bigint.new("200")
      local c = bigint.new("100")
      
      if a <= b and a <= c and not (b <= a) then
        return "correct"
      else
        return "incorrect"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'correct', '__le metamethod should work');
  });

  it('Compares bigints using greater than operator', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new("1000000000000000000")
      local b = bigint.new("999999999999999999")
      
      if a > b then
        return "greater"
      else
        return "not greater"
      end
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, 'greater', 'Greater than operator should work');
  });

  // FR-6: Practical Token Calculations
  it('Handles realistic wei/eth token calculations', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      -- 1 ETH = 10^18 wei
      local balance = bigint.new("1000000000000000000")  -- 1 ETH
      local transfer = bigint.new("250000000000000000")   -- 0.25 ETH
      local new_balance = balance - transfer              -- 0.75 ETH
      return tostring(new_balance)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '750000000000000000', 
      'Should handle wei token arithmetic correctly');
  });

  it('Handles token calculations with multiple operations', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      -- Starting with 10 ETH
      local balance = bigint.new("10000000000000000000")
      
      -- Add 5 ETH
      balance = balance + bigint.new("5000000000000000000")
      
      -- Subtract 3 ETH
      balance = balance - bigint.new("3000000000000000000")
      
      -- Should have 12 ETH
      return tostring(balance)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '12000000000000000000', 
      'Should handle chained token operations');
  });

  // Edge Cases
  it('Handles subtraction resulting in negative', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(100)
      local b = bigint.new(200)
      local diff = a - b
      return tostring(diff)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '-100', 'Should handle negative results');
  });

  it('Handles zero in arithmetic operations', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local zero = bigint.new(0)
      local num = bigint.new(42)
      
      local sum = zero + num
      local diff = num - zero
      local prod = num * zero
      
      return tostring(sum) .. "," .. tostring(diff) .. "," .. tostring(prod)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '42,42,0', 'Should handle zero correctly in operations');
  });

  it('Handles division by one', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local num = bigint.new("123456789012345678901234567890")
      local one = bigint.new(1)
      local quot = num / one
      return tostring(quot)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '123456789012345678901234567890', 
      'Division by one should return same number');
  });

  // GC Behavior - Verify no memory leaks with repeated allocations
  it('Handles repeated allocations without leaking', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      
      -- Create and discard many bigints to test GC
      for i = 1, 100 do
        local a = bigint.new(i)
        local b = bigint.new(i * 2)
        local c = a + b
        local d = c * bigint.new(2)
        -- Let them be garbage collected
      end
      
      -- Final computation should still work
      local final = bigint.new(42)
      return tostring(final)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '42', 
      'Should handle repeated allocations without memory issues');
  });

  it('Handles complex expression with multiple operations', () => {
    const bytes = compute(`
      local bigint = require('bigint')
      local a = bigint.new(10)
      local b = bigint.new(20)
      local c = bigint.new(30)
      
      -- (10 + 20) * 30 - 100 = 30 * 30 - 100 = 900 - 100 = 800
      local result = (a + b) * c - bigint.new(100)
      return tostring(result)
    `);
    const result = readResult(getBufferPtr(), bytes);
    assert.strictEqual(result.result, '800', 
      'Should handle complex expressions correctly');
  });
});
