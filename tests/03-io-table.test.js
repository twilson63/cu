const { test, expect } = require('@playwright/test');

test.describe('_io Table API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.cu !== undefined);
    
    await page.evaluate(async () => {
      await window.cu.load();
      window.cu.init();
    });
  });

  test('Can set input and read it in Lua', async ({ page }) => {
    // Set input from JavaScript
    await page.evaluate(() => {
      window.cu.setInput({ name: 'Alice', age: 30 });
    });
    
    // Read input in Lua
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        local name = _io.input.name
        local age = _io.input.age
        return name .. " is " .. age .. " years old"
      `);
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe('Alice is 30 years old');
  });

  test('Can set simple output from Lua', async ({ page }) => {
    // Set output in Lua
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        _io.output = 42
      `);
    });
    
    expect(bytes).toBeGreaterThanOrEqual(0);
    
    // Get output from JavaScript
    const output = await page.evaluate(() => {
      return window.cu.getOutput();
    });
    
    expect(output).toBe(42);
  });

  test('Can set metadata and use it in Lua', async ({ page }) => {
    // Set metadata from JavaScript
    await page.evaluate(() => {
      window.cu.setMetadata({
        version: '1.0',
        user: 'test-user'
      });
    });
    
    // Read metadata in Lua
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        return "Version: " .. _io.meta.version .. ", User: " .. _io.meta.user
      `);
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe('Version: 1.0, User: test-user');
  });

  test('Can pass arrays through _io.input', async ({ page }) => {
    await page.evaluate(() => {
      window.cu.setInput([10, 20, 30, 40, 50]);
    });
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        local sum = 0
        for i = 1, 5 do
          sum = sum + _io.input[i]
        end
        return sum
      `);
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(150);
  });

  test('Can pass nested objects through _io.input', async ({ page }) => {
    await page.evaluate(() => {
      window.cu.setInput({
        user: {
          name: 'Bob',
          profile: {
            age: 25,
            city: 'NYC'
          }
        }
      });
    });
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        return _io.input.user.name .. " from " .. _io.input.user.profile.city
      `);
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe('Bob from NYC');
  });

  test('clearIo removes input and meta', async ({ page }) => {
    // Set input and meta
    await page.evaluate(() => {
      window.cu.setInput({ test: 'input' });
      window.cu.setMetadata({ test: 'meta' });
    });
    
    // Clear everything
    await page.evaluate(() => {
      window.cu.clearIo();
    });
    
    // Try to read - should be nil
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        local inp = _io.input
        local met = _io.meta
        if inp == nil and met == nil then
          return "all cleared"
        else
          return "not cleared"
        end
      `);
    });
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe('all cleared');
  });

  test('Can use _io for simple data flow', async ({ page }) => {
    // Set input
    await page.evaluate(() => {
      window.cu.setInput({ x: 7, y: 6 });
    });
    
    // Process in Lua and set simple output
    await page.evaluate(() => {
      return window.cu.compute(`
        local x = _io.input.x
        local y = _io.input.y
        _io.output = x * y
      `);
    });
    
    // Get output
    const output = await page.evaluate(() => {
      return window.cu.getOutput();
    });
    
    expect(output).toBe(42);
  });
});
