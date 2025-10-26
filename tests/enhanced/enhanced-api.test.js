/**
 * Enhanced Lua WASM External Storage API Test Suite
 * 
 * Comprehensive tests for all enhanced features:
 * - Function persistence and serialization
 * - Batch operations with transactions
 * - Advanced querying with indexing
 * - Security and validation
 * - Performance benchmarks
 */

import { test, expect } from '@playwright/test';
import { EnhancedLuaWASM, EnhancedLuaError } from '../../web/enhanced/lua-api-enhanced.js';

test.describe('Enhanced Lua WASM External Storage API', () => {
    let lua;

    test.beforeEach(async ({ page }) => {
        // Initialize enhanced Lua WASM
        lua = new EnhancedLuaWASM();
        await lua.init({
            wasmPath: '/web/enhanced/lua.wasm',
            autoRestore: false,
        });
    });

    test.afterEach(async () => {
        // Cleanup
        if (lua) {
            await lua.saveState();
        }
    });

    test.describe('Core Functionality', () => {
        test('should initialize successfully', async () => {
            expect(lua.isInitialized).toBe(true);
            expect(lua.getMemoryStats()).toBeDefined();
        });

        test('should execute basic Lua code', async () => {
            const result = lua.eval('return 2 + 2');
            expect(result).toBe(4);
        });

        test('should handle complex Lua expressions', async () => {
            const result = lua.eval(`
                function fibonacci(n)
                    if n <= 1 then return n end
                    return fibonacci(n - 1) + fibonacci(n - 2)
                end
                return fibonacci(10)
            `);
            expect(result).toBe(55);
        });

        test('should handle errors gracefully', async () => {
            expect(() => {
                lua.eval('undefined_variable');
            }).toThrow(EnhancedLuaError);
        });
    });

    test.describe('Function Persistence', () => {
        test('should persist simple function', async () => {
            const funcCode = 'function(x) return x * 2 end';
            
            const persisted = await lua.persistFunction('_home', 'double', funcCode);
            expect(persisted).toBe(true);
            
            // Function should be available after persistence
            const result = lua.eval('return _home.double(5)');
            expect(result).toBe(10);
        });

        test('should persist function with closures', async () => {
            const funcCode = `
                function(initialValue)
                    local count = initialValue or 0
                    return function()
                        count = count + 1
                        return count
                    end
                end
            `;
            
            await lua.persistFunction('_home', 'counterFactory', funcCode);
            
            const result = lua.eval(`
                local counter = _home.counterFactory(100)
                return {counter(), counter(), counter()}
            `);
            
            expect(result).toEqual([101, 102, 103]);
        });

        test('should persist multiple functions', async () => {
            const functions = [
                { name: 'add', code: 'function(a, b) return a + b end' },
                { name: 'multiply', code: 'function(a, b) return a * b end' },
                { name: 'power', code: 'function(a, b) return a ^ b end' },
            ];
            
            for (const func of functions) {
                await lua.persistFunction('_home', func.name, func.code);
            }
            
            // Test all functions
            expect(lua.eval('return _home.add(5, 3)')).toBe(8);
            expect(lua.eval('return _home.multiply(4, 7)')).toBe(28);
            expect(lua.eval('return _home.power(2, 3)')).toBe(8);
        });

        test('should validate function code', async () => {
            await expect(lua.persistFunction('_home', 'invalid', ''))
                .rejects.toThrow(EnhancedLuaError);
            
            await expect(lua.persistFunction('_home', 'invalid', 'not a function'))
                .rejects.toThrow(EnhancedLuaError);
        });

        test('should handle function compression', async () => {
            const largeFunction = `
                function(data)
                    -- Large function with lots of code
                    local result = {}
                    for i = 1, 1000 do
                        result[i] = {
                            id = i,
                            value = math.random(),
                            processed = true,
                            timestamp = os.time(),
                            data = data
                        }
                    end
                    return result
                end
            `;
            
            await lua.persistFunction('_home', 'processor', largeFunction, {
                compress: true
            });
            
            const result = lua.eval('return #_home.processor("test")');
            expect(result).toBe(1000);
        });
    });

    test.describe('Batch Operations', () => {
        test('should process batch set operations', async () => {
            const operations = [
                { type: 'set', table: 'users', key: 'user1', value: { name: 'Alice', age: 30 } },
                { type: 'set', table: 'users', key: 'user2', value: { name: 'Bob', age: 25 } },
                { type: 'set', table: 'users', key: 'user3', value: { name: 'Charlie', age: 35 } },
            ];
            
            const results = await lua.batchTableOperations(operations);
            
            expect(results).toHaveLength(3);
            expect(results.every(r => r.success)).toBe(true);
            
            // Verify data was set
            expect(lua.eval('return _home.users.user1.name')).toBe('Alice');
            expect(lua.eval('return _home.users.user2.age')).toBe(25);
            expect(lua.eval('return _home.users.user3.name')).toBe('Charlie');
        });

        test('should process large batch efficiently', async () => {
            const operations = Array.from({ length: 1000 }, (_, i) => ({
                type: 'set',
                table: 'items',
                key: `item${i}`,
                value: { id: i, name: `Item ${i}`, price: Math.random() * 100 }
            }));
            
            const startTime = performance.now();
            const results = await lua.batchTableOperations(operations);
            const duration = performance.now() - startTime;
            
            expect(results).toHaveLength(1000);
            expect(results.every(r => r.success)).toBe(true);
            expect(duration).toBeLessThan(1000); // Should complete in under 1 second
            
            // Verify some items
            expect(lua.eval('return _home.items.item0.name')).toBe('Item 0');
            expect(lua.eval('return _home.items.item999.name')).toBe('Item 999');
        });

        test('should handle mixed operation types', async () => {
            // First, set up some data
            await lua.batchTableOperations([
                { type: 'set', table: 'test', key: 'a', value: 1 },
                { type: 'set', table: 'test', key: 'b', value: 2 },
                { type: 'set', table: 'test', key: 'c', value: 3 },
            ]);
            
            // Mixed operations
            const operations = [
                { type: 'get', table: 'test', key: 'a' },
                { type: 'set', table: 'test', key: 'd', value: 4 },
                { type: 'delete', table: 'test', key: 'b' },
                { type: 'get', table: 'test', key: 'c' },
            ];
            
            const results = await lua.batchTableOperations(operations);
            
            expect(results).toHaveLength(4);
            expect(results[0].data).toBe(1); // get 'a'
            expect(results[1].success).toBe(true); // set 'd'
            expect(results[2].success).toBe(true); // delete 'b'
            expect(results[3].data).toBe(3); // get 'c'
        });

        test('should handle batch validation errors', async () => {
            // Empty operations
            await expect(lua.batchTableOperations([]))
                .resolves.toEqual([]);
            
            // Invalid operation type
            await expect(lua.batchTableOperations([{ type: 'invalid' }]))
                .rejects.toThrow(EnhancedLuaError);
            
            // Missing required fields
            await expect(lua.batchTableOperations([{ type: 'set' }]))
                .rejects.toThrow(EnhancedLuaError);
        });

        test('should handle batch size limits', async () => {
            const tooManyOps = Array.from({ length: 1001 }, (_, i) => ({
                type: 'set',
                table: 'test',
                key: `key${i}`,
                value: i
            }));
            
            await expect(lua.batchTableOperations(tooManyOps))
                .rejects.toThrow('Maximum batch size is 1000');
        });
    });

    test.describe('Advanced Querying', () => {
        test('should create and use btree index', async () => {
            // Set up test data
            const users = [
                { name: 'Alice', age: 25, score: 850 },
                { name: 'Bob', age: 30, score: 720 },
                { name: 'Charlie', age: 35, score: 900 },
                { name: 'Diana', age: 28, score: 680 },
                { name: 'Eve', age: 32, score: 810 },
            ];
            
            await lua.batchTableOperations(
                users.map((user, i) => ({
                    type: 'set',
                    table: 'users',
                    key: `user${i}`,
                    value: user
                }))
            );
            
            // Create index
            const index = await lua.createIndex('users', 'age', 'btree');
            expect(index).toBeDefined();
            expect(index.type).toBe('btree');
            
            // Query using index
            const results = await lua.queryTable('users', {
                field: 'age',
                operator: '>=',
                value: 30,
                limit: 10
            });
            
            expect(results.length).toBeGreaterThanOrEqual(3);
            expect(results.every(r => r.age >= 30)).toBe(true);
        });

        test('should support multiple query operators', async () => {
            const testData = [
                { name: 'Alice', category: 'A', score: 100 },
                { name: 'Bob', category: 'B', score: 200 },
                { name: 'Charlie', category: 'A', score: 300 },
                { name: 'Diana', category: 'C', score: 150 },
                { name: 'Eve', category: 'B', score: 250 },
            ];
            
            await lua.batchTableOperations(
                testData.map((item, i) => ({
                    type: 'set',
                    table: 'items',
                    key: `item${i}`,
                    value: item
                }))
            );
            
            // Test various operators
            const operators = [
                { op: '=', value: 'A', expected: 2 },
                { op: '!=', value: 'A', expected: 3 },
                { op: '>', value: 150, field: 'score', expected: 2 },
                { op: '<=', value: 200, field: 'score', expected: 3 },
                { op: 'startsWith', value: 'A', field: 'name', expected: 1 },
                { op: 'contains', value: 'li', field: 'name', expected: 2 },
            ];
            
            for (const { op, value, field = 'category', expected } of operators) {
                const results = await lua.queryTable('items', {
                    field,
                    operator: op,
                    value,
                    limit: 10
                });
                
                expect(results.length).toBe(expected);
            }
        });

        test('should support range queries', async () => {
            const numbers = Array.from({ length: 100 }, (_, i) => ({
                value: i + 1,
                squared: (i + 1) * (i + 1)
            }));
            
            await lua.batchTableOperations(
                numbers.map((num, i) => ({
                    type: 'set',
                    table: 'numbers',
                    key: `num${i}`,
                    value: num
                }))
            );
            
            // Range query
            const results = await lua.queryTable('numbers', {
                field: 'value',
                operator: 'between',
                value: [25, 75],
                limit: 100
            });
            
            expect(results.length).toBe(51); // 25 to 75 inclusive
            expect(results[0].value).toBe(25);
            expect(results[50].value).toBe(75);
        });

        test('should support pagination', async () => {
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `Item ${i}`,
                category: i % 10,
                score: Math.random() * 1000
            }));
            
            await lua.batchTableOperations(
                largeDataset.map((item, i) => ({
                    type: 'set',
                    table: 'large',
                    key: `item${i}`,
                    value: item
                }))
            );
            
            // Test pagination
            const page1 = await lua.queryTable('large', {
                field: 'category',
                operator: '=',
                value: 5,
                limit: 50
            });
            
            const page2 = await lua.queryTable('large', {
                field: 'category',
                operator: '=',
                value: 5,
                limit: 50,
                offset: 50
            });
            
            expect(page1.length).toBe(50);
            expect(page2.length).toBe(50);
            expect(page1[0].id).not.toBe(page2[0].id);
        });

        test('should handle query validation errors', async () => {
            await expect(lua.queryTable('test', {}))
                .rejects.toThrow('Query must specify a field');
            
            await expect(lua.queryTable('test', { field: 'name' }))
                .rejects.toThrow('Query must specify an operator');
            
            await expect(lua.queryTable('test', {
                field: 'name',
                operator: 'invalid'
            })).rejects.toThrow('Unsupported operator: invalid');
        });
    });

    test.describe('Security & Validation', () => {
        test('should validate function code before persistence', async () => {
            // Empty code
            await expect(lua.persistFunction('_home', 'test', ''))
                .rejects.toThrow('Function code must be a non-empty string');
            
            // Non-function code
            await expect(lua.persistFunction('_home', 'test', 'return 42'))
                .rejects.toThrow('Code does not appear to be a function');
            
            // Too large
            const largeCode = 'function() return "' + 'x'.repeat(200000) + '" end';
            await expect(lua.persistFunction('_home', 'test', largeCode))
                .rejects.toThrow('Function code exceeds 100KB limit');
        });

        test('should sanitize batch operations', async () => {
            const maliciousOps = [
                { type: 'set', table: '../../../etc/passwd', key: 'test', value: 'data' },
                { type: 'get', table: 'normal', key: '../../config', value: 'data' },
            ];
            
            // Should handle gracefully without security issues
            const results = await lua.batchTableOperations(maliciousOps);
            expect(results).toBeDefined();
        });

        test('should handle injection attempts', async () => {
            const injectionCode = `
                function()
                    local file = io.open('/etc/passwd', 'r')
                    if file then
                        return file:read('*all')
                    end
                end
            `;
            
            // Should fail gracefully - no file system access in WASM
            await expect(lua.persistFunction('_home', 'inject', injectionCode))
                .rejects.toThrow();
        });

        test('should provide detailed error information', async () => {
            try {
                await lua.persistFunction('_home', 'test', '');
            } catch (error) {
                expect(error).toBeInstanceOf(EnhancedLuaError);
                expect(error.code).toBe('INVALID_FUNCTION_CODE');
                expect(error.message).toBe('Function code must be a non-empty string');
                expect(error.timestamp).toBeDefined();
                expect(error.toJSON()).toBeDefined();
            }
        });
    });

    test.describe('Performance & Memory', () => {
        test('should handle memory efficiently', async () => {
            const stats1 = lua.getMemoryStats();
            
            // Add lots of data
            const operations = Array.from({ length: 500 }, (_, i) => ({
                type: 'set',
                table: 'memory_test',
                key: `key${i}`,
                value: {
                    data: 'x'.repeat(1000), // 1KB per item
                    index: i,
                    timestamp: Date.now()
                }
            }));
            
            await lua.batchTableOperations(operations);
            
            const stats2 = lua.getMemoryStats();
            
            // Memory usage should be reasonable
            expect(stats2.externalTables).toBeGreaterThan(stats1.externalTables);
            expect(stats2.bufferUsage).toBeLessThan(0.9); // Less than 90% buffer usage
        });

        test('should meet performance requirements', async () => {
            // Function serialization performance
            const funcCode = 'function(x) return x * 2 end';
            const startTime1 = performance.now();
            await lua.persistFunction('_home', 'perf_test', funcCode);
            const duration1 = performance.now() - startTime1;
            
            expect(duration1).toBeLessThan(20); // < 20ms requirement
            
            // Batch operations performance
            const batchOps = Array.from({ length: 1000 }, (_, i) => ({
                type: 'set',
                table: 'perf_batch',
                key: `item${i}`,
                value: { id: i, name: `Item ${i}` }
            }));
            
            const startTime2 = performance.now();
            const results = await lua.batchTableOperations(batchOps);
            const duration2 = performance.now() - startTime2;
            
            expect(results).toHaveLength(1000);
            expect(duration2).toBeLessThan(1000); // < 1 second for 1000 operations
            
            // Query performance with indexing
            await lua.createIndex('perf_batch', 'id', 'btree');
            
            const startTime3 = performance.now();
            const queryResults = await lua.queryTable('perf_batch', {
                field: 'id',
                operator: '>',
                value: 500,
                limit: 100
            });
            const duration3 = performance.now() - startTime3;
            
            expect(queryResults.length).toBe(100);
            expect(duration3).toBeLessThan(10); // < 10ms for indexed query
        });

        test('should handle cache efficiently', async () => {
            // First query - should miss cache
            const startTime1 = performance.now();
            await lua.queryTable('test', { field: 'name', operator: '=', value: 'test' });
            const duration1 = performance.now() - startTime1;
            
            // Second query - should hit cache
            const startTime2 = performance.now();
            await lua.queryTable('test', { field: 'name', operator: '=', value: 'test' });
            const duration2 = performance.now() - startTime2;
            
            // Cached query should be faster
            expect(duration2).toBeLessThan(duration1);
        });
    });

    test.describe('State Management', () => {
        test('should save and load state correctly', async () => {
            // Set up some state
            await lua.persistFunction('_home', 'testFunc', 'function() return "test" end');
            await lua.batchTableOperations([
                { type: 'set', table: 'state_test', key: 'a', value: 1 },
                { type: 'set', table: 'state_test', key: 'b', value: 2 },
            ]);
            await lua.createIndex('state_test', 'value', 'btree');
            
            // Save state
            const saved = await lua.saveState();
            expect(saved).toBe(true);
            
            // Clear current state (simulate page reload)
            lua.functionRegistry.clear();
            lua.externalTables.clear();
            lua.indices.clear();
            
            // Load state
            const loaded = await lua.loadState();
            expect(loaded).toBe(true);
            
            // Verify state was restored
            expect(lua.eval('return _home.testFunc()')).toBe('test');
            expect(lua.eval('return _home.state_test.a')).toBe(1);
            expect(lua.eval('return _home.state_test.b')).toBe(2);
        });

        test('should handle state save/load errors gracefully', async () => {
            // Test with corrupted state data
            try {
                await lua.saveState();
                
                // Simulate corrupted storage
                localStorage.setItem('__state_main', 'invalid json');
                
                const loaded = await lua.loadState();
                expect(loaded).toBe(false); // Should handle gracefully
            } finally {
                // Cleanup
                localStorage.removeItem('__state_main');
            }
        });
    });

    test.describe('Backward Compatibility - Memory Alias', () => {
        test('should support Memory as alias to _home', async () => {
            // Write using _home, read using Memory
            await lua.batchTableOperations([
                { type: 'set', table: '_home', key: 'test_value', value: 'hello' },
            ]);
            
            const result = lua.eval('return Memory.test_value');
            expect(result).toBe('hello');
        });

        test('should support writing via Memory alias', async () => {
            // Write using Memory, read using _home
            lua.eval('Memory.from_alias = 42');
            const result = lua.eval('return _home.from_alias');
            expect(result).toBe(42);
        });

        test('should reference same table for Memory and _home', async () => {
            // Set value via _home
            lua.eval('_home.shared = 100');
            
            // Modify via Memory
            lua.eval('Memory.shared = Memory.shared + 50');
            
            // Read via _home should show the change
            const result = lua.eval('return _home.shared');
            expect(result).toBe(150);
        });

        test('should persist functions via Memory alias', async () => {
            const funcCode = 'function(x) return x * 3 end';
            await lua.persistFunction('Memory', 'triple', funcCode);
            
            // Should be accessible via both Memory and _home
            expect(lua.eval('return Memory.triple(5)')).toBe(15);
            expect(lua.eval('return _home.triple(5)')).toBe(15);
        });

        test('should iterate over same keys for Memory and _home', async () => {
            lua.eval(`
                _home.a = 1
                _home.b = 2
                Memory.c = 3
            `);
            
            const homeKeys = lua.eval(`
                local keys = {}
                for k, v in pairs(_home) do
                    table.insert(keys, k)
                end
                table.sort(keys)
                return table.concat(keys, ',')
            `);
            
            const memoryKeys = lua.eval(`
                local keys = {}
                for k, v in pairs(Memory) do
                    table.insert(keys, k)
                end
                table.sort(keys)
                return table.concat(keys, ',')
            `);
            
            expect(homeKeys).toBe(memoryKeys);
        });

        test('should maintain rawequal between Memory and _home', async () => {
            const result = lua.eval('return rawequal(Memory, _home)');
            expect(result).toBe(true);
        });

        test('should handle complex nested operations via both names', async () => {
            lua.eval(`
                _home.config = {
                    settings = {
                        theme = "dark",
                        version = 1
                    }
                }
            `);
            
            // Modify via Memory
            lua.eval('Memory.config.settings.version = 2');
            
            // Read via _home
            const result = lua.eval('return _home.config.settings.version');
            expect(result).toBe(2);
        });

        test('should support function calls on both Memory and _home', async () => {
            lua.eval(`
                function _home.compute(x, y)
                    return x + y
                end
            `);
            
            const viaHome = lua.eval('return _home.compute(10, 20)');
            const viaMemory = lua.eval('return Memory.compute(10, 20)');
            
            expect(viaHome).toBe(30);
            expect(viaMemory).toBe(30);
        });

        test('should allow deletion via either Memory or _home', async () => {
            lua.eval('_home.temp = "temporary"');
            expect(lua.eval('return Memory.temp')).toBe('temporary');
            
            lua.eval('Memory.temp = nil');
            expect(lua.eval('return _home.temp')).toBeNull();
        });

        test('should support metatables on both Memory and _home', async () => {
            lua.eval(`
                local mt = {
                    __index = function(t, k)
                        return "default"
                    end
                }
                setmetatable(_home, mt)
            `);
            
            const viaHome = lua.eval('return _home.nonexistent');
            const viaMemory = lua.eval('return Memory.nonexistent');
            
            expect(viaHome).toBe('default');
            expect(viaMemory).toBe('default');
        });
    });

    test.describe('Error Handling & Edge Cases', () => {
        test('should handle uninitialized state', async () => {
            const newLua = new EnhancedLuaWASM();
            
            expect(() => {
                newLua.eval('return 1 + 1');
            }).toThrow('Enhanced Lua WASM not initialized');
            
            expect(() => {
                newLua.persistFunction('_home', 'test', 'function() end');
            }).toThrow('Enhanced Lua WASM not initialized');
        });

        test('should handle concurrent operations', async () => {
            const promises = [];
            
            // Start multiple operations concurrently
            for (let i = 0; i < 10; i++) {
                promises.push(lua.persistFunction('_home', `func${i}`, `function() return ${i} end`));
                promises.push(lua.batchTableOperations([
                    { type: 'set', table: 'concurrent', key: `key${i}`, value: i }
                ]));
            }
            
            const results = await Promise.allSettled(promises);
            
            // All operations should complete (some may fail due to conflicts)
            expect(results.length).toBe(20);
            expect(results.filter(r => r.status === 'fulfilled').length).toBeGreaterThan(0);
        });

        test('should handle resource exhaustion gracefully', async () => {
            // Try to create extremely large batch
            const hugeBatch = Array.from({ length: 10000 }, (_, i) => ({
                type: 'set',
                table: 'huge',
                key: `key${i}`,
                value: 'x'.repeat(10000) // 10KB per item
            }));
            
            await expect(lua.batchTableOperations(hugeBatch))
                .rejects.toThrow();
        });

        test('should provide comprehensive audit logging', async () => {
            // Clear audit log
            lua.auditLog = [];
            
            // Perform various operations
            await lua.persistFunction('_home', 'audit_test', 'function() return true end');
            await lua.batchTableOperations([
                { type: 'set', table: 'audit', key: 'test', value: 'data' }
            ]);
            
            // Check audit log
            expect(lua.auditLog.length).toBeGreaterThan(0);
            expect(lua.auditLog.every(entry => entry.timestamp)).toBe(true);
            expect(lua.auditLog.every(entry => entry.level)).toBe(true);
            expect(lua.auditLog.every(entry => entry.message)).toBe(true);
        });
    });
});

// Performance benchmarks
test.describe('Performance Benchmarks', () => {
    test('benchmark function persistence', async ({ page }) => {
        const lua = new EnhancedLuaWASM();
        await lua.init();
        
        const functions = [
            'function(x) return x + 1 end',
            'function(x, y) return x * y + math.sqrt(x) end',
            'function(arr) local sum = 0; for _,v in ipairs(arr) do sum = sum + v end; return sum end',
        ];
        
        const results = [];
        for (const funcCode of functions) {
            const start = performance.now();
            await lua.persistFunction('_home', 'bench', funcCode);
            const duration = performance.now() - start;
            results.push({ size: funcCode.length, duration });
        }
        
        // All should be under 20ms requirement
        expect(results.every(r => r.duration < 20)).toBe(true);
        
        console.log('Function persistence benchmarks:', results);
    });

    test('benchmark batch operations', async ({ page }) => {
        const lua = new EnhancedLuaWASM();
        await lua.init();
        
        const batchSizes = [100, 500, 1000];
        const results = [];
        
        for (const size of batchSizes) {
            const operations = Array.from({ length: size }, (_, i) => ({
                type: 'set',
                table: 'bench',
                key: `key${i}`,
                value: { id: i, data: `item${i}` }
            }));
            
            const start = performance.now();
            const results = await lua.batchTableOperations(operations);
            const duration = performance.now() - start;
            
            results.push({ size, duration, opsPerSecond: size / (duration / 1000) });
        }
        
        // Should achieve > 1000 ops/second
        expect(results.every(r => r.opsPerSecond > 1000)).toBe(true);
        
        console.log('Batch operation benchmarks:', results);
    });

    test('benchmark query performance', async ({ page }) => {
        const lua = new EnhancedLuaWASM();
        await lua.init();
        
        // Set up test data
        const testData = Array.from({ length: 10000 }, (_, i) => ({
            id: i,
            category: i % 100,
            score: Math.random() * 1000,
            name: `Item ${i}`
        }));
        
        await lua.batchTableOperations(
            testData.map((item, i) => ({
                type: 'set',
                table: 'query_bench',
                key: `item${i}`,
                value: item
            }))
        );
        
        // Create index
        await lua.createIndex('query_bench', 'category', 'btree');
        
        // Benchmark queries
        const queries = [
            { field: 'category', operator: '=', value: 50 },
            { field: 'score', operator: '>', value: 500 },
            { field: 'name', operator: 'startsWith', value: 'Item 1' },
        ];
        
        const results = [];
        for (const query of queries) {
            const start = performance.now();
            const results = await lua.queryTable('query_bench', query);
            const duration = performance.now() - start;
            
            results.push({ query: query.operator, duration, resultCount: results.length });
        }
        
        // All should be under 10ms requirement
        expect(results.every(r => r.duration < 10)).toBe(true);
        
        console.log('Query performance benchmarks:', results);
    });
});

// Export test utilities
export { EnhancedLuaWASM, EnhancedLuaError };