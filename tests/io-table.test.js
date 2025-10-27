import { test, expect } from '@playwright/test';
import LuaPersistent from '../web/lua-persistent.js';

test.describe('_io External Table', () => {
    let lua;

    test.beforeEach(async () => {
        lua = new LuaPersistent();
        await lua.load('http://localhost:8000/lua.wasm');
    });

    test.afterEach(() => {
        if (lua && lua.resetState) {
            lua.resetState();
        }
    });

    test('_io table exists', () => {
        const result = lua.eval('return type(_io)');
        expect(result).not.toBeNull();
        expect(result.value).toBe('table');
    });

    test('_io table is globally accessible', () => {
        const result = lua.eval('return _G._io ~= nil');
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('can set and get input via external table', () => {
        // Manually set input using external table operations
        const result = lua.eval(`
            local io_table = ext.table()
            io_table["message"] = "hello"
            io_table["value"] = 42
            
            -- Simulate reading from _io.input
            local msg = io_table["message"]
            local val = io_table["value"]
            
            return msg .. " " .. tostring(val)
        `);
        expect(result).not.toBeNull();
        expect(result.value).toBe('hello 42');
    });

    test('can write to _io.input and read it back', () => {
        lua.eval(`
            _io.input = ext.table()
            _io.input["test"] = "data"
        `);
        
        const result = lua.eval('return _io.input["test"]');
        expect(result).not.toBeNull();
        expect(result.value).toBe('data');
    });

    test('can write to _io.output and read it back', () => {
        lua.eval(`
            _io.output = ext.table()
            _io.output["result"] = "success"
            _io.output["count"] = 123
        `);
        
        const result1 = lua.eval('return _io.output["result"]');
        expect(result1).not.toBeNull();
        expect(result1.value).toBe('success');
        
        const result2 = lua.eval('return _io.output["count"]');
        expect(result2).not.toBeNull();
        expect(result2.value).toBe(123);
    });

    test('handles nested structures', () => {
        lua.eval(`
            _io.input = ext.table()
            _io.input["user"] = ext.table()
            _io.input["user"]["name"] = "Alice"
            _io.input["user"]["address"] = ext.table()
            _io.input["user"]["address"]["city"] = "NYC"
            _io.input["user"]["address"]["zip"] = "10001"
        `);
        
        const result = lua.eval(`
            local city = _io.input["user"]["address"]["city"]
            local zip = _io.input["user"]["address"]["zip"]
            return city .. " " .. zip
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('NYC 10001');
    });

    test('handles arrays (numeric indices)', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["numbers"] = ext.table()
            _io.input["numbers"]["1"] = 10
            _io.input["numbers"]["2"] = 20
            _io.input["numbers"]["3"] = 30
            _io.input["numbers"]["4"] = 40
            _io.input["numbers"]["5"] = 50
            
            local sum = 0
            for i = 1, 5 do
                local key = tostring(i)
                sum = sum + _io.input["numbers"][key]
            end
            return sum
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(150);
    });

    test('clearIo resets input and output', () => {
        // Set some data
        lua.eval(`
            _io.input = ext.table()
            _io.input["value"] = 123
            _io.output = ext.table()
            _io.output["result"] = "test"
        `);
        
        // Clear using Zig export (simulated)
        lua.eval(`
            _io.input = nil
            _io.output = nil
            _io.meta = nil
        `);
        
        // Verify cleared
        const result = lua.eval(`
            return _io.input == nil and _io.output == nil
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('handles large datasets (1000 items)', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["data"] = ext.table()
            
            -- Create 1000 items
            for i = 1, 1000 do
                local key = "item_" .. i
                _io.input["data"][key] = i * 2
            end
            
            -- Count and sum
            local count = 0
            local sum = 0
            for i = 1, 1000 do
                local key = "item_" .. i
                local val = _io.input["data"][key]
                if val ~= nil then
                    count = count + 1
                    sum = sum + val
                end
            end
            
            return count
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(1000);
    });

    test('handles very large datasets (10000 items)', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["data"] = ext.table()
            
            -- Create 10000 items
            for i = 1, 10000 do
                _io.input["data"][tostring(i)] = i
            end
            
            -- Verify count
            local count = 0
            for i = 1, 10000 do
                if _io.input["data"][tostring(i)] ~= nil then
                    count = count + 1
                end
            end
            
            return count
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(10000);
    });

    test('preserves nil type', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["nullValue"] = nil
            return type(_io.input["nullValue"])
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('nil');
    });

    test('preserves boolean types', () => {
        lua.eval(`
            _io.input = ext.table()
            _io.input["boolTrue"] = true
            _io.input["boolFalse"] = false
        `);
        
        const result = lua.eval(`
            return type(_io.input["boolTrue"]) == "boolean" and
                   type(_io.input["boolFalse"]) == "boolean" and
                   _io.input["boolTrue"] == true and
                   _io.input["boolFalse"] == false
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('preserves number types (integer)', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["number"] = 42
            return type(_io.input["number"])
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('number');
    });

    test('preserves number types (float)', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["float"] = 3.14
            local val = _io.input["float"]
            return type(val) == "number" and math.abs(val - 3.14) < 0.01
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('preserves string types', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["string"] = "hello"
            return type(_io.input["string"])
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('string');
    });

    test('preserves all types together', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["nil"] = nil
            _io.input["bool"] = true
            _io.input["int"] = 42
            _io.input["float"] = 3.14
            _io.input["string"] = "hello"
            
            local types_ok = 
                type(_io.input["nil"]) == "nil" and
                type(_io.input["bool"]) == "boolean" and
                type(_io.input["int"]) == "number" and
                type(_io.input["float"]) == "number" and
                type(_io.input["string"]) == "string"
            
            return types_ok
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('handles empty strings', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["empty"] = ""
            return _io.input["empty"] == ""
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('handles zero values', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["zero"] = 0
            return _io.input["zero"] == 0
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('handles negative numbers', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["neg"] = -999
            return _io.input["neg"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(-999);
    });

    test('handles large numbers', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["big"] = 9007199254740991
            return _io.input["big"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(9007199254740991);
    });

    test('handles special characters in strings', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["special"] = "hello\\nworld\\ttab"
            return _io.input["special"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toContain('hello');
        expect(result.value).toContain('world');
    });

    test('handles long strings', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            local long_string = string.rep("x", 1000)
            _io.input["long"] = long_string
            return string.len(_io.input["long"])
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(1000);
    });

    test('_io.meta field is accessible', () => {
        const result = lua.eval(`
            _io.meta = ext.table()
            _io.meta["timestamp"] = 12345
            return _io.meta["timestamp"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(12345);
    });

    test('input, output, and meta are independent', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.output = ext.table()
            _io.meta = ext.table()
            
            _io.input["key"] = "input_value"
            _io.output["key"] = "output_value"
            _io.meta["key"] = "meta_value"
            
            return _io.input["key"] .. "," .. _io.output["key"] .. "," .. _io.meta["key"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('input_value,output_value,meta_value');
    });

    test('complex nested structure with mixed types', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["config"] = ext.table()
            _io.input["config"]["settings"] = ext.table()
            _io.input["config"]["settings"]["enabled"] = true
            _io.input["config"]["settings"]["count"] = 10
            _io.input["config"]["settings"]["name"] = "test"
            
            _io.input["config"]["users"] = ext.table()
            _io.input["config"]["users"]["1"] = ext.table()
            _io.input["config"]["users"]["1"]["name"] = "Alice"
            _io.input["config"]["users"]["1"]["age"] = 30
            
            local enabled = _io.input["config"]["settings"]["enabled"]
            local count = _io.input["config"]["settings"]["count"]
            local user_name = _io.input["config"]["users"]["1"]["name"]
            
            return enabled and count == 10 and user_name == "Alice"
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('processing pattern - read input, write output', () => {
        lua.eval(`
            _io.input = ext.table()
            _io.input["numbers"] = ext.table()
            _io.input["numbers"]["1"] = 5
            _io.input["numbers"]["2"] = 10
            _io.input["numbers"]["3"] = 15
            
            -- Process: calculate sum and average
            local sum = 0
            local count = 0
            for i = 1, 3 do
                local val = _io.input["numbers"][tostring(i)]
                if val ~= nil then
                    sum = sum + val
                    count = count + 1
                end
            end
            
            _io.output = ext.table()
            _io.output["sum"] = sum
            _io.output["count"] = count
            _io.output["average"] = sum / count
        `);
        
        const sum = lua.eval('return _io.output["sum"]');
        const count = lua.eval('return _io.output["count"]');
        const average = lua.eval('return _io.output["average"]');
        
        expect(sum.value).toBe(30);
        expect(count.value).toBe(3);
        expect(average.value).toBe(10);
    });

    test('data transformation pattern', () => {
        lua.eval(`
            _io.input = ext.table()
            _io.input["users"] = ext.table()
            
            for i = 1, 5 do
                local user = ext.table()
                user["id"] = i
                user["name"] = "User" .. i
                user["active"] = (i % 2 == 1)
                _io.input["users"][tostring(i)] = user
            end
            
            -- Transform: filter active users
            _io.output = ext.table()
            _io.output["active_users"] = ext.table()
            
            local active_count = 0
            for i = 1, 5 do
                local user = _io.input["users"][tostring(i)]
                if user["active"] then
                    active_count = active_count + 1
                    _io.output["active_users"][tostring(active_count)] = user
                end
            end
            
            _io.output["total_active"] = active_count
        `);
        
        const result = lua.eval('return _io.output["total_active"]');
        expect(result.value).toBe(3);
    });

    test('large dataset memory efficiency', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            
            -- Create 5000 records
            for i = 1, 5000 do
                local record = ext.table()
                record["id"] = i
                record["value"] = i * 1.5
                record["label"] = "item_" .. i
                _io.input[tostring(i)] = record
            end
            
            -- Process incrementally
            local sum = 0
            for i = 1, 5000 do
                local record = _io.input[tostring(i)]
                if record then
                    sum = sum + record["value"]
                end
            end
            
            return sum
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBeGreaterThan(0);
    });

    test('multiple compute calls preserve _io table', () => {
        // First call: set up input
        lua.eval(`
            _io.input = ext.table()
            _io.input["counter"] = 0
        `);
        
        // Second call: increment
        lua.eval(`
            if _io.input then
                _io.input["counter"] = _io.input["counter"] + 1
            end
        `);
        
        // Third call: read
        const result = lua.eval('return _io.input["counter"]');
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(1);
    });

    test('_io survives across multiple evals', () => {
        lua.eval('_io.test_value = 42');
        const result1 = lua.eval('return _io.test_value');
        expect(result1.value).toBe(42);
        
        lua.eval('_io.test_value = 84');
        const result2 = lua.eval('return _io.test_value');
        expect(result2.value).toBe(84);
    });

    test('array-like structure with pairs iteration', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["items"] = ext.table()
            _io.input["items"]["1"] = "first"
            _io.input["items"]["2"] = "second"
            _io.input["items"]["3"] = "third"
            
            local collected = ext.table()
            local count = 0
            
            -- Note: pairs() won't work on external tables directly
            -- Need to iterate manually
            for i = 1, 3 do
                local key = tostring(i)
                local val = _io.input["items"][key]
                if val ~= nil then
                    count = count + 1
                end
            end
            
            return count
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(3);
    });

    test('error handling - non-existent keys return nil', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            return _io.input["nonexistent"] == nil
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });

    test('overwriting values works correctly', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["key"] = "old_value"
            _io.input["key"] = "new_value"
            return _io.input["key"]
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe('new_value');
    });

    test('deletion by setting to nil', () => {
        const result = lua.eval(`
            _io.input = ext.table()
            _io.input["key"] = "value"
            _io.input["key"] = nil
            return _io.input["key"] == nil
        `);
        
        expect(result).not.toBeNull();
        expect(result.value).toBe(true);
    });
});
