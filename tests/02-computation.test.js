const { test, expect } = require('@playwright/test');

test.describe('Cu Computation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // Wait for cu module to be available
    await page.waitForFunction(() => window.cu !== undefined);
    
    // Load and initialize WASM
    await page.evaluate(async () => {
      await window.cu.load();
      window.cu.init();
    });
  });

  test('Executes simple arithmetic', async ({ page }) => {
    const bytes = await page.evaluate(() => window.cu.compute('return 2 + 2'));
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(4);
  });

  test('Executes string operations', async ({ page }) => {
    const bytes = await page.evaluate(() => {
      return window.cu.compute('return "Hello" .. " " .. "World"');
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe('Hello World');
  });

  test('Sets and retrieves variables', async ({ page }) => {
    // Set variable
    const setBytes = await page.evaluate(() => window.cu.compute('x = 42'));
    expect(setBytes).toBeGreaterThanOrEqual(0);
    
    // Get variable
    const getBytes = await page.evaluate(() => window.cu.compute('return x'));
    expect(getBytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, getBytes);
    
    expect(result.result).toBe(42);
  });

  test('Handles print statements', async ({ page }) => {
    const bytes = await page.evaluate(() => {
      return window.cu.compute('print("Hello from Lua")');
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.output).toContain('Hello from Lua');
  });

  test('Returns nil correctly', async ({ page }) => {
    const bytes = await page.evaluate(() => window.cu.compute('return nil'));
    
    const result = await page.evaluate((b) => {
      if (b === 0) return { result: null, output: '' };
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBeNull();
  });

  test('Executes table operations', async ({ page }) => {
    const bytes = await page.evaluate(() => {
      return window.cu.compute(`
        local t = {a = 1, b = 2, c = 3}
        return t.a + t.b + t.c
      `);
    });
    
    expect(bytes).toBeGreaterThan(0);
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(6);
  });
});
