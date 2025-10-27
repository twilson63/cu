const { test, expect } = require('@playwright/test');

test.describe('Cu Initialization', () => {
  test('Page loads successfully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const title = await page.title();
    expect(title).toContain('Cu');
    
    const h1 = await page.locator('h1').first().textContent();
    expect(h1).toContain('Cu');
  });

  test('Cu module is available on window', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const cuInfo = await page.evaluate(() => ({
      exists: window.cu !== undefined,
      type: typeof window.cu,
      hasLoad: typeof window.cu?.load === 'function',
      hasInit: typeof window.cu?.init === 'function',
      hasCompute: typeof window.cu?.compute === 'function'
    }));
    
    expect(cuInfo.exists).toBe(true);
    expect(cuInfo.type).toBe('object');
    expect(cuInfo.hasLoad).toBe(true);
    expect(cuInfo.hasInit).toBe(true);
    expect(cuInfo.hasCompute).toBe(true);
  });

  test('Legacy lua alias is available', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    const luaInfo = await page.evaluate(() => ({
      exists: window.lua !== undefined,
      sameAscu: window.lua === window.cu
    }));
    
    expect(luaInfo.exists).toBe(true);
    expect(luaInfo.sameAscu).toBe(true);
  });
});
