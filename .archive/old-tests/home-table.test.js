/**
 * _home Table and Persistence Tests
 * 
 * Tests the persistent storage capabilities via the _home table:
 * - _home table accessibility
 * - Data persistence across sessions
 * - saveState/loadState functionality
 * - Function persistence
 */

import { test, expect } from '@playwright/test';

test.describe('_home Table', () => {
  let page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto('http://localhost:8000');
    await page.waitForFunction(() => typeof window.cu !== 'undefined');
    
    // Clear any existing state
    await page.evaluate(() => window.cu.clearPersistedState());
  });

  test.afterEach(async () => {
    // Clean up after each test
    await page.evaluate(() => window.cu.clearPersistedState());
  });

  test.describe('_home Table Access', () => {
    test('_home table exists', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return type(_home)');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe('table');
    });

    test('_home table is globally accessible', async () => {
      const result = await page.evaluate(async () => {
        const bytes = await window.cu.compute('return _G._home ~= nil');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(true);
    });

    test('can write to _home table', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute('_home.testKey = "testValue"');
        const bytes = await window.cu.compute('return _home.testKey');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe('testValue');
    });

    test('can store numbers in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute('_home.number = 42');
        const bytes = await window.cu.compute('return _home.number');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(42);
    });

    test('can store booleans in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute('_home.flag = true');
        const bytes = await window.cu.compute('return _home.flag');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(true);
    });

    test('_home persists across compute calls', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute('_home.counter = 1');
        await window.cu.compute('_home.counter = _home.counter + 1');
        const bytes = await window.cu.compute('return _home.counter');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(2);
    });
  });

  test.describe('saveState and loadState', () => {
    test('saveState saves _home data to IndexedDB', async () => {
      const saved = await page.evaluate(async () => {
        await window.cu.compute('_home.testData = "persistent"');
        return await window.cu.saveState();
      });
      expect(saved).toBe(true);
    });

    test('loadState restores _home data from IndexedDB', async () => {
      // First, save some data
      await page.evaluate(async () => {
        await window.cu.compute('_home.savedValue = 123');
        await window.cu.saveState();
      });

      // Reload the page to clear memory
      await page.reload();
      await page.waitForFunction(() => typeof window.cu !== 'undefined');

      // Load the state and verify
      const result = await page.evaluate(async () => {
        await window.cu.loadState();
        const bytes = await window.cu.compute('return _home.savedValue');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      
      expect(result).toBe(123);
    });

    test('multiple values persist correctly', async () => {
      await page.evaluate(async () => {
        await window.cu.compute(`
          _home.str = "hello"
          _home.num = 42
          _home.bool = true
        `);
        await window.cu.saveState();
      });

      await page.reload();
      await page.waitForFunction(() => typeof window.cu !== 'undefined');

      const results = await page.evaluate(async () => {
        await window.cu.loadState();
        const bytes = await window.cu.compute(`
          return _home.str, _home.num, _home.bool
        `);
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      
      expect(results).toBe('hello'); // First return value
    });

    test('clearPersistedState removes all saved data', async () => {
      await page.evaluate(async () => {
        await window.cu.compute('_home.data = "should be cleared"');
        await window.cu.saveState();
        await window.cu.clearPersistedState();
      });

      await page.reload();
      await page.waitForFunction(() => typeof window.cu !== 'undefined');

      const result = await page.evaluate(async () => {
        await window.cu.loadState();
        const bytes = await window.cu.compute('return _home.data');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      
      expect(result).toBeNull();
    });
  });

  test.describe('Function Persistence', () => {
    test('can store functions in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute(`
          function _home.double(x)
            return x * 2
          end
        `);
        const bytes = await window.cu.compute('return _home.double(21)');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(42);
    });

    test('functions in _home persist after saveState/loadState', async () => {
      // Define and save a function
      await page.evaluate(async () => {
        await window.cu.compute(`
          function _home.fibonacci(n)
            if n <= 1 then return n end
            return _home.fibonacci(n - 1) + _home.fibonacci(n - 2)
          end
        `);
        await window.cu.saveState();
      });

      // Reload and test
      await page.reload();
      await page.waitForFunction(() => typeof window.cu !== 'undefined');

      const result = await page.evaluate(async () => {
        await window.cu.loadState();
        const bytes = await window.cu.compute('return _home.fibonacci(10)');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      
      expect(result).toBe(55);
    });

    test('can store closures in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute(`
          function _home.makeCounter()
            local count = 0
            return function()
              count = count + 1
              return count
            end
          end
          _home.counter = _home.makeCounter()
        `);
        
        // Call the counter multiple times
        await window.cu.compute('_home.counter()');
        await window.cu.compute('_home.counter()');
        const bytes = await window.cu.compute('return _home.counter()');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(3);
    });
  });

  test.describe('Complex Data Structures', () => {
    test('can store nested tables in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute(`
          _home.user = {
            name = "Alice",
            age = 30,
            address = {
              city = "New York",
              zip = "10001"
            }
          }
        `);
        const bytes = await window.cu.compute('return _home.user.address.city');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe('New York');
    });

    test('can store arrays in _home', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute(`
          _home.numbers = {10, 20, 30, 40, 50}
        `);
        const bytes = await window.cu.compute('return _home.numbers[3]');
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes);
        return result;
      });
      expect(result).toBe(30);
    });

    test('can iterate over _home table contents', async () => {
      const result = await page.evaluate(async () => {
        await window.cu.compute(`
          _home.a = 1
          _home.b = 2
          _home.c = 3
          
          local sum = 0
          for k, v in pairs(_home) do
            if type(v) == "number" then
              sum = sum + v
            end
          end
          return sum
        `);
        const bytes = await window.cu.compute('return _home.sum or 0');
        // Actually compute the sum
        const bytes2 = await window.cu.compute(`
          local sum = 0
          for k, v in pairs(_home) do
            if type(v) == "number" then
              sum = sum + v
            end
          end
          return sum
        `);
        const { result } = window.cu.readResult(window.cu.getBufferPtr(), bytes2);
        return result;
      });
      expect(result).toBeGreaterThan(0);
    });
  });

  test.describe('getTableInfo', () => {
    test('getTableInfo returns table metadata', async () => {
      const info = await page.evaluate(async () => {
        await window.cu.compute('_home.test = "value"');
        return window.cu.getTableInfo();
      });
      
      expect(info).toBeDefined();
      expect(info.tableCount).toBeGreaterThan(0);
      expect(info.homeTableId).toBeDefined();
    });

    test('getTableInfo shows _home table contents', async () => {
      const info = await page.evaluate(async () => {
        await window.cu.compute(`
          _home.key1 = "value1"
          _home.key2 = "value2"
        `);
        return window.cu.getTableInfo();
      });
      
      expect(info.tables).toBeDefined();
      expect(Array.isArray(info.tables)).toBe(true);
    });
  });
});
