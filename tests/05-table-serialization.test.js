/**
 * Test Suite: Lua Table Serialization
 * 
 * Tests automatic conversion of regular Lua tables to external tables.
 */

const { test, expect } = require('@playwright/test');

test.describe('Table Serialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.cu !== undefined);
    
    await page.evaluate(async () => {
      await window.cu.load();
      window.cu.init();
    });
  });

  test('simple table output - basic key-value pairs', async ({ page }) => {
    console.log('Starting simple table test...');
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = {
          status = "success",
          value = 42
        }
      `);
    });
    
    console.log('Compute returned:', bytes, 'bytes');
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    const output = await page.evaluate(() => window.cu.getOutput());
    console.log('getOutput() returned:', output);
    
    expect(output).toEqual({
      status: 'success',
      value: 42
    });
  });

  test('nested table output - multi-level nesting', async ({ page }) => {
    console.log('Starting nested table test...');
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = {
          user = {
            name = "Alice",
            profile = {
              age = 30,
              city = "NYC"
            }
          }
        }
      `);
    });
    
    console.log('Compute returned:', bytes, 'bytes');
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    const output = await page.evaluate(() => window.cu.getOutput());
    console.log('getOutput() returned:', JSON.stringify(output, null, 2));
    
    expect(output).toEqual({
      user: {
        name: 'Alice',
        profile: {
          age: 30,
          city: 'NYC'
        }
      }
    });
  });

  test('array table output - sequential numeric indices', async ({ page }) => {
    console.log('Starting array table test...');
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = {10, 20, 30, 40, 50}
      `);
    });
    
    console.log('Compute returned:', bytes, 'bytes');
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    const output = await page.evaluate(() => window.cu.getOutput());
    console.log('getOutput() returned:', output);
    console.log('Is array?', Array.isArray(output));
    
    // Should be converted to JavaScript array
    expect(Array.isArray(output)).toBe(true);
    expect(output).toEqual([10, 20, 30, 40, 50]);
  });

  test('empty table output', async ({ page }) => {
    console.log('Starting empty table test...');
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = {}
      `);
    });
    
    console.log('Compute returned:', bytes, 'bytes');
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    const output = await page.evaluate(() => window.cu.getOutput());
    console.log('getOutput() returned:', output);
    
    // Empty tables may return null or empty object depending on implementation
    if (output === null) {
      console.log('Empty table returned null (acceptable behavior)');
      expect(output).toBeNull();
    } else {
      expect(typeof output).toBe('object');
      expect(Object.keys(output).length).toBe(0);
    }
  });

  test('mixed types in table', async ({ page }) => {
    console.log('Starting mixed types test...');
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = {
          num = 42,
          str = "hello",
          bool = true,
          nested = {x = 1, y = 2}
        }
      `);
    });
    
    console.log('Compute returned:', bytes, 'bytes');
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    const output = await page.evaluate(() => window.cu.getOutput());
    console.log('getOutput() returned:', JSON.stringify(output, null, 2));
    
    expect(output.num).toBe(42);
    expect(output.str).toBe('hello');
    expect(output.bool).toBe(true);
    expect(output.nested).toEqual({x: 1, y: 2});
  });

});
