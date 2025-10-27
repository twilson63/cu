const { test, expect } = require('@playwright/test');

test.describe('Cu WASM', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  });

  test('Page loads successfully', async ({ page }) => {
    const title = await page.locator('h1').first().textContent();
    expect(title).toContain('Cu');
  });

  test('WASM module initializes', async ({ page }) => {
    const status = await page.locator('#status').textContent();
    expect(status).toContain('ready');
  });

  test('Buffer functions are available', async ({ page }) => {
    const hasInit = await page.evaluate(() => {
      return typeof window.cu !== 'undefined' && 
             typeof window.cu.init === 'function';
    });
    expect(hasInit).toBe(true);
  });

  test('Memory stats display', async ({ page }) => {
    const statsText = await page.locator('#stat-total').textContent();
    expect(statsText).toContain('MB');
  });

  test('Code editor exists', async ({ page }) => {
    const textarea = await page.locator('textarea').first();
    expect(textarea).toBeTruthy();
  });
});
