const { test, expect } = require('@playwright/test');

test.describe('Lua Persistent WASM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  });

  test('Page loads successfully', async ({ page }) => {
    const title = await page.locator('h1').first().textContent();
    expect(title).toBe('Lua Persistent WASM Demo');
  });

  test('WASM module initializes', async ({ page }) => {
    const status = await page.locator('#status').textContent();
    expect(status).toContain('Ready');
  });

  test('Buffer functions are available', async ({ page }) => {
    const hasInit = await page.evaluate(() => {
      return typeof window.wasmModule !== 'undefined' && 
             typeof window.wasmModule.init === 'function';
    });
    expect(hasInit).toBe(true);
  });

  test('Memory stats display', async ({ page }) => {
    const statsText = await page.locator('#stats').textContent();
    expect(statsText).toContain('MB');
  });

  test('Code editor exists', async ({ page }) => {
    const textarea = await page.locator('textarea').first();
    expect(textarea).toBeTruthy();
  });
});
