import { test, expect } from '@playwright/test';
import LuaPersistent from '../web/lua-persistent.js';

test.describe('Lua WASM - Basic Evaluation', () => {
    let lua;

    test.beforeEach(async () => {
        lua = new LuaPersistent();
        await lua.load('web/lua.wasm');
        const result = lua.init();
        expect(result).toBe(0);
    });

    test.afterEach(() => {
        if (lua && lua.resetState) {
            lua.resetState();
        }
    });
    test('eval returns 42 for simple return statement', () => {
        const result = lua.eval('return 42');
        expect(result).not.toBeNull();
        expect(result.value).toBe(42);
    });

    test('eval handles string returns', () => {
        const result = lua.eval('return "hello"');
        expect(result).not.toBeNull();
        expect(result.value).toBe('hello');
    });

    test('eval handles boolean true', () => {
        const result = lua.eval('return true');
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('eval handles boolean false', () => {
        const result = lua.eval('return false');
        expect(result).not.toBeNull();
        expect(result.value).toBe(false);
    });

    test('eval handles nil return', () => {
        const result = lua.eval('return nil');
        expect(result).not.toBeNull();
        expect(result.value).toBeNull();
    });

    test('eval handles float returns', () => {
        const result = lua.eval('return 3.14');
        expect(result).not.toBeNull();
        expect(Math.abs(result.value - 3.14) < 0.01).toBe(true);
    });

    test('eval captures output from print', () => {
        const result = lua.eval('print("hello"); return 42');
        expect(result).not.toBeNull();
        expect(result.output).toContain('hello');
        expect(result.value).toBe(42);
    });

    test('eval handles multiple prints', () => {
        const result = lua.eval(`
            print("first")
            print("second")
            print("third")
            return 1
        `);
        expect(result).not.toBeNull();
        expect(result.output).toContain('first');
        expect(result.output).toContain('second');
        expect(result.output).toContain('third');
    });

    test('eval handles arithmetic operations', () => {
        const result = lua.eval('return 2 + 3 * 4');
        expect(result).not.toBeNull();
        expect(result.value).toBe(14);
    });

    test('eval handles string concatenation', () => {
        const result = lua.eval('return "hello" .. " " .. "world"');
        expect(result).not.toBeNull();
        expect(result.value).toBe('hello world');
    });

    test('eval handles local variables', () => {
        const result = lua.eval(`
            local x = 5
            local y = 10
            return x + y
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(15);
    });

    test('eval preserves variables across evals', () => {
        lua.eval('x = 42');
        const result = lua.eval('return x');
        expect(result).not.toBeNull();
        expect(result.value).toBe(42);
    });

    test('eval handles for loops', () => {
        const result = lua.eval(`
            local sum = 0
            for i = 1, 10 do
                sum = sum + i
            end
            return sum
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(55);
    });

    test('eval handles if statements', () => {
        const result = lua.eval(`
            local x = 10
            if x > 5 then
                return "greater"
            else
                return "smaller"
            end
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('greater');
    });

    test('eval handles function definitions', () => {
        const result = lua.eval(`
            function add(a, b)
                return a + b
            end
            return add(3, 4)
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(7);
    });

    test('eval handles recursion', () => {
        const result = lua.eval(`
            function factorial(n)
                if n <= 1 then
                    return 1
                else
                    return n * factorial(n - 1)
                end
            end
            return factorial(5)
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(120);
    });
});

test.describe('Lua WASM - External Tables', () => {
    test('ext.table() creates a table', () => {
        const result = lua.eval(`
            local t = ext.table()
            return t ~= nil
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('external table stores and retrieves string values', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["key"] = "value"
            return t["key"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('value');
    });

    test('external table stores and retrieves numeric values', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["number"] = 42
            return t["number"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(42);
    });

    test('external table stores and retrieves boolean values', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["bool"] = true
            return t["bool"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('external table stores nil values', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["nil_key"] = nil
            return t["nil_key"] == nil
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('external table returns nil for non-existent keys', () => {
        const result = lua.eval(`
            local t = ext.table()
            return t["nonexistent"] == nil
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('external table supports multiple keys', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["a"] = "alpha"
            t["b"] = "beta"
            t["c"] = "gamma"
            return t["b"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('beta');
    });

    test('external table persistence across evals', () => {
        lua.eval(`
            t = ext.table()
            t["value"] = 100
        `);
        const result = lua.eval('return t["value"]');
        expect(result).not.toBeNull();
        expect(result.value).toBe(100);
    });

    test('external table supports numeric keys', () => {
        const result = lua.eval(`
            local t = ext.table()
            t[1] = "first"
            t[2] = "second"
            return t[1]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('first');
    });

    test('external table size function', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["a"] = 1
            t["b"] = 2
            return #t
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(2);
    });

    test('external table deletion', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["key"] = "value"
            t["key"] = nil
            return t["key"] == nil
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('multiple independent external tables', () => {
        const result = lua.eval(`
            local t1 = ext.table()
            local t2 = ext.table()
            t1["x"] = 10
            t2["x"] = 20
            return t1["x"] + t2["x"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(30);
    });

    test('external table with large strings', () => {
        const result = lua.eval(`
            local t = ext.table()
            local big_string = string.rep("x", 1000)
            t["big"] = big_string
            return string.len(t["big"])
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(1000);
    });
});

test.describe('Lua WASM - Error Handling', () => {
    test('syntax error is reported', () => {
        const result = lua.eval('return 42 +++');
        expect(result).toBeNull();
        expect(lua.getLastError()).not.toBeNull();
        expect(lua.getLastError()).toContain('syntax');
    });

    test('runtime error is reported', () => {
        const result = lua.eval('return unknown_function()');
        expect(result).toBeNull();
        expect(lua.getLastError()).not.toBeNull();
    });

    test('division by zero is caught', () => {
        const result = lua.eval('return 1 / 0');
        expect(result).not.toBeNull();
    });

    test('table access error is reported', () => {
        const result = lua.eval('local t = {}; return t.key.nested.value');
        expect(result).toBeNull();
    });

    test('error does not affect subsequent evals', () => {
        lua.eval('return invalid +++');
        const result = lua.eval('return 42');
        expect(result).not.toBeNull();
        expect(result.value).toBe(42);
    });

    test('stack safety after error', () => {
        lua.eval('invalid code');
        const result = lua.eval(`
            for i = 1, 1000 do
                table.insert({}, i)
            end
            return "ok"
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('ok');
    });

    test('error message readability', () => {
        const result = lua.eval('return nil.value');
        expect(result).toBeNull();
        const error = lua.getLastError();
        expect(error).toBeTruthy();
        expect(typeof error).toBe('string');
        expect(error.length > 0).toBe(true);
    });

    test('error clearing between evals', () => {
        lua.eval('invalid');
        expect(lua.getLastError()).not.toBeNull();
        
        const result = lua.eval('return 42');
        expect(result).not.toBeNull();
        expect(lua.getLastError()).toBeNull();
    });
});

test.describe('Lua WASM - Output Capture', () => {
    test('single print is captured', () => {
        const result = lua.eval('print("test"); return 42');
        expect(result).not.toBeNull();
        expect(result.output).toContain('test');
    });

    test('multiple prints are combined', () => {
        const result = lua.eval(`
            print("a")
            print("b")
            print("c")
            return 1
        `);
        expect(result).not.toBeNull();
        expect(result.output).toContain('a');
        expect(result.output).toContain('b');
        expect(result.output).toContain('c');
    });

    test('print with multiple arguments', () => {
        const result = lua.eval('print("hello", "world"); return 1');
        expect(result).not.toBeNull();
        expect(result.output).toContain('hello');
        expect(result.output).toContain('world');
    });

    test('output with special characters', () => {
        const result = lua.eval('print("hello\\nworld"); return 1');
        expect(result).not.toBeNull();
        expect(result.output).toBeTruthy();
    });

    test('numeric output formatting', () => {
        const result = lua.eval('print(42); print(3.14); return 1');
        expect(result).not.toBeNull();
        expect(result.output).toContain('42');
    });

    test('boolean output formatting', () => {
        const result = lua.eval('print(true); print(false); return 1');
        expect(result).not.toBeNull();
        expect(result.output).toContain('true');
        expect(result.output).toContain('false');
    });

    test('nil output formatting', () => {
        const result = lua.eval('print(nil); return 1');
        expect(result).not.toBeNull();
        expect(result.output).toContain('nil');
    });

    test('large output is handled', () => {
        const result = lua.eval(`
            for i = 1, 100 do
                print("line " .. i)
            end
            return 1
        `);
        expect(result).not.toBeNull();
        expect(result.output).toBeTruthy();
    });

    test('output does not affect return value', () => {
        const result = lua.eval(`
            print("output")
            return 123
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(123);
        expect(result.output).toContain('output');
    });

    test('empty output when no print', () => {
        const result = lua.eval('return 42');
        expect(result).not.toBeNull();
        expect(result.output).toBe('');
    });
});

test.describe('Lua WASM - Memory Management', () => {
    test('memory stats are available', () => {
        const stats = lua.getMemoryStats();
        expect(stats).not.toBeNull();
        expect(stats.io_buffer_size).toBeGreaterThan(0);
        expect(stats.wasm_pages).toBeGreaterThan(0);
    });

    test('repeated evals do not leak memory', () => {
        const statsStart = lua.getMemoryStats();
        
        for (let i = 0; i < 100; i++) {
            lua.eval(`
                local t = {}
                for j = 1, 10 do
                    table.insert(t, j)
                end
                return #t
            `);
        }
        
        const statsEnd = lua.getMemoryStats();
        expect(statsEnd.io_buffer_size).toBe(statsStart.io_buffer_size);
    });

    test('large table storage', () => {
        const result = lua.eval(`
            local t = ext.table()
            for i = 1, 100 do
                t["key_" .. i] = "value_" .. i
            end
            return #t
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(100);
    });

    test('garbage collection can be triggered', () => {
        expect(() => {
            lua.gc();
        }).not.toThrow();
    });
});

test.describe('Lua WASM - Serialization', () => {
    test('all types round-trip correctly through external table', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["nil"] = nil
            t["bool_true"] = true
            t["bool_false"] = false
            t["int"] = 42
            t["float"] = 3.14
            t["string"] = "hello"
            
            return t["int"] + (t["float"] > 3 and 1 or 0) + (t["bool_true"] and 1 or 0)
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBeGreaterThan(0);
    });

    test('empty string serialization', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["empty"] = ""
            return t["empty"] == ""
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('zero value serialization', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["zero"] = 0
            return t["zero"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(0);
    });

    test('negative number serialization', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["neg"] = -999
            return t["neg"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(-999);
    });

    test('large number serialization', () => {
        const result = lua.eval(`
            local t = ext.table()
            t["big"] = 9007199254740991
            return t["big"]
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe(9007199254740991);
    });
});

test.describe('Lua WASM - Complex Scenarios', () => {
    test('counter example with persistence', () => {
        lua.eval(`
            counter = ext.table()
            counter["count"] = 0
        `);

        lua.eval(`counter["count"] = counter["count"] + 1`);
        const result = lua.eval('return counter["count"]');
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(1);

        lua.eval(`counter["count"] = counter["count"] + 1`);
        const result2 = lua.eval('return counter["count"]');
        
        expect(result2).not.toBeNull();
        expect(result2.value).toBe(2);
    });

    test('todo list simulation', () => {
        lua.eval(`
            todos = ext.table()
            todos["1"] = "Buy milk"
            todos["2"] = "Walk dog"
            todos["3"] = "Code review"
        `);

        const result = lua.eval(`
            count = 0
            for k, v in pairs(todos) do
                count = count + 1
            end
            return count
        `);

        expect(result).not.toBeNull();
        expect(result.value).toBeGreaterThan(0);
    });

    test('state machine simulation', () => {
        lua.eval(`
            state = ext.table()
            state["current"] = "idle"
        `);

        lua.eval(`state["current"] = "running"`);
        const result1 = lua.eval('return state["current"]');
        expect(result1.value).toBe('running');

        lua.eval(`state["current"] = "stopped"`);
        const result2 = lua.eval('return state["current"]');
        expect(result2.value).toBe('stopped');
    });

    test('data aggregation', () => {
        const result = lua.eval(`
            local store = ext.table()
            
            for i = 1, 50 do
                store["item_" .. i] = i * 2
            end
            
            return #store
        `);

        expect(result).not.toBeNull();
        expect(result.value).toBe(50);
    });
});
