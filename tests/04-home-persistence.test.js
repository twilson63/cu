const { test, expect } = require('@playwright/test');

test.describe('_home Table Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.cu !== undefined);
  });

  test('Can store and retrieve values in _home', async ({ page }) => {
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: false });
      window.cu.init();
    });
    
    // Store value in _home
    await page.evaluate(() => {
      return window.cu.compute(`
        _home.myValue = 123
        _home.myString = "Hello World"
      `);
    });
    
    // Retrieve values
    const bytes = await page.evaluate(() => {
      return window.cu.compute('return _home.myValue + 1000');
    });
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(1123);
  });

  test('_home values persist across compute calls', async ({ page }) => {
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: false });
      window.cu.init();
    });
    
    // Set counter
    await page.evaluate(() => window.cu.compute('_home.counter = 0'));
    
    // Increment twice
    await page.evaluate(() => window.cu.compute('_home.counter = _home.counter + 1'));
    await page.evaluate(() => window.cu.compute('_home.counter = _home.counter + 1'));
    
    // Read value
    const bytes = await page.evaluate(() => window.cu.compute('return _home.counter'));
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(2);
  });

  test('Can store simple functions in _home', async ({ page }) => {
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: false });
      window.cu.init();
    });
    
    // Store a function
    await page.evaluate(() => {
      return window.cu.compute(`
        _home.add = function(a, b)
          return a + b
        end
      `);
    });
    
    // Use the stored function
    const bytes = await page.evaluate(() => {
      return window.cu.compute('return _home.add(10, 32)');
    });
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(42);
  });

  test('Functions in _home persist after saveState/loadState', async ({ page }) => {
    // First session - create and save
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: false });
      window.cu.init();
    });
    
    // Store a function
    await page.evaluate(() => {
      return window.cu.compute(`
        _home.multiply = function(x, y)
          return x * y
        end
      `);
    });
    
    // Save state
    const saved = await page.evaluate(async () => {
      return await window.cu.saveState();
    });
    
    expect(saved).toBe(true);
    
    // Reload WASM (simulates page reload)
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: true });
      window.cu.init();
    });
    
    // Try to use the function after reload
    const bytes = await page.evaluate(() => {
      return window.cu.compute('return _home.multiply(6, 7)');
    });
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(42);
    
    // Clean up
    await page.evaluate(async () => {
      await window.cu.clearPersistedState();
    });
  });

  test('Simple data persists after save/load cycle', async ({ page }) => {
    // First session
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: false });
      window.cu.init();
    });
    
    await page.evaluate(() => {
      return window.cu.compute('_home.value = 999');
    });
    
    await page.evaluate(async () => {
      await window.cu.saveState();
    });
    
    // Second session - reload and check
    await page.evaluate(async () => {
      await window.cu.load({ autoRestore: true });
      window.cu.init();
    });
    
    const bytes = await page.evaluate(() => {
      return window.cu.compute('return _home.value');
    });
    
    const result = await page.evaluate((b) => {
      return window.cu.readResult(window.cu.getBufferPtr(), b);
    }, bytes);
    
    expect(result.result).toBe(999);
    
    // Clean up
    await page.evaluate(async () => {
      await window.cu.clearPersistedState();
    });
  });
});
