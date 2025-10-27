const { defineConfig, devices } = require('@playwright/test');

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.js',
  testIgnore: '**/.archive/**',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'cd web && python3 -m http.server 8000',
    port: 8000,
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
