/**
 * Cu Core API Tests
 * 
 * Tests the fundamental Cu WASM API functionality:
 * - Module loading and initialization
 * - Code execution
 * - Basic Lua operations
 * - Memory management
 */

import { test, expect } from '@playwright/test';

// Use a global cu instance that we'll set up via page evaluation
let page;

test.describe('Cu Core API', () => {
  test.beforeEach(async ({ page: p }) => {
    page = p;
    // Navigate to a page that has cu loaded
    await page.goto('http://localhost:8000');
    
    // Wait for cu to be available
    await page.waitForFunction(() => typeof window.cu !== 'undefined');
  });

  test.describe('Module Loading', () => {
    test('cu object is available on window', async () => {
      const hasCu = await page.evaluate(() => typeof window.cu !== 'undefined');
      expect(hasCu).toBe(true);
    });

    test('cu.load is a function', async () => {
      const isFunction = await page.evaluate(() => typeof window.cu.load === 'function');
      expect(isFunction).toBe(true);
    });

    test('cu.init is a function', async () => {
      const isFunction = await page.evaluate(() => typeof window.cu.init === 'function');
      expect(isFunction).toBe(true);
    });

    test('cu.compute is a function', async () => {
      const isFunction = await page.evaluate(() => typeof window.cu.compute === 'function');
      expect(isFunction).toBe(true);
    });
  });

  test.describe('Basic Computation', () => {
    test('can execute simple arithmetic', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return 2 + 2');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(4);
    });

    test('can execute string operations', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return "Hello" .. " " .. "World"');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe('Hello World');
    });

    test('can execute boolean operations', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return true and false');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(false);
    });

    test('can handle nil values', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return nil');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBeNull();
    });

    test('can execute loops', async () => {
      const result = await page.evaluate(async () => {
        const code = `
          local sum = 0
          for i = 1, 10 do
            sum = sum + i
          end
          return sum
        `;
        const bytes = await window.cu.compute(code);
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(55); // Sum of 1 to 10
    });

    test('can define and call functions', async () => {
      const result = await page.evaluate(async () => {
        const code = `
          function double(x)
            return x * 2
          end
          return double(21)
        `;
        const bytes = await window.cu.compute(code);
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(42);
    });

    test('can use standard library functions', async () => {
      const result = await page.evaluate(async () => {
        const code = `
          local t = {3, 1, 4, 1, 5, 9, 2, 6}
          table.sort(t)
          return t[1]
        `;
        const bytes = await window.cu.compute(code);
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(1);
    });
  });

  test.describe('Print Output Capture', () => {
    test('captures print output', async () => {
      const output = await page.evaluate(async () => {
        const code = `
          print("Hello from Cu!")
          return 42
        `;
        const bytes = await window.cu.compute(code);
        const { output } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return output;
      });
      expect(output).toContain('Hello from Cu!');
    });

    test('captures multiple print statements', async () => {
      const output = await page.evaluate(async () => {
        const code = `
          print("Line 1")
          print("Line 2")
          print("Line 3")
          return true
        `;
        const bytes = await window.cu.compute(code);
        const { output } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return output;
      });
      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });

    test('separates output from return value', async () => {
      const { output, result } = await page.evaluate(async () => {
        const code = `
          print("Debug info")
          return 123
        `;
        const bytes = await window.cu.compute(code);
        return window.cu.readResult(window.cu.getBufferPtr(), bytes);
      });
      expect(output).toContain('Debug info');
      expect(result).toBe(123);
    });
  });

  test.describe('Error Handling', () => {
    test('handles syntax errors gracefully', async () => {
      const result = await page.evaluate(async () => {
        try {
          const bytes = await window.cu.compute('return 1 + +');
          if (bytes < 0) {
            return { error: true };
          }
          return { error: false };
        } catch (e) {
          return { error: true, message: e.message };
        }
      });
      expect(result.error).toBe(true);
    });

    test('handles runtime errors gracefully', async () => {
      const result = await page.evaluate(async () => {
        try {
          const bytes = await window.cu.compute('return undefinedVariable');
          if (bytes < 0) {
            return { error: true };
          }
          return { error: false };
        } catch (e) {
          return { error: true };
        }
      });
      expect(result.error).toBe(true);
    });

    test('can recover from errors', async () => {
      const result = await page.evaluate(async () => {
        // First execute code with error
        try {
          await window.cu.compute('return invalid code');
        } catch (e) {}
        
        // Then execute valid code
        const bytes = await window.cu.compute('return 42');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(42);
    });
  });

  test.describe('Memory Management', () => {
    test('getMemoryStats returns valid statistics', async () => {
      const stats = await page.evaluate(() => window.cu.getMemoryStats());
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(typeof stats.used).toBe('number');
      expect(typeof stats.free).toBe('number');
    });

    test('runGc executes without error', async () => {
      const result = await page.evaluate(() => {
        try {
          window.cu.runGc();
          return true;
        } catch (e) {
          return false;
        }
      });
      expect(result).toBe(true);
    });

    test('getBufferPtr returns a valid pointer', async () => {
      const ptr = await page.evaluate(() => window.cu.getBufferPtr());
      expect(ptr).toBeGreaterThan(0);
    });

    test('getBufferSize returns 64KB', async () => {
      const size = await page.evaluate(() => window.cu.getBufferSize());
      expect(size).toBe(65536);
    });
  });

  test.describe('State Persistence', () => {
    test('maintains global variables across executions', async () => {
      const result = await page.evaluate(async () => {
        // Set a global variable
        await window.cu.compute('myGlobal = 42');
        
        // Read it back in a new execution
        const bytes = await window.cu.compute('return myGlobal');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(42);
    });

    test('maintains function definitions across executions', async () => {
      const result = await page.evaluate(async () => {
        // Define a function
        await window.cu.compute('function add(a, b) return a + b end');
        
        // Call it in a new execution
        const bytes = await window.cu.compute('return add(10, 20)');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(30);
    });
  });
});
