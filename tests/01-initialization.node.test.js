const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadWasm, init, compute, getBufferPtr, readResult, reset } = require('./node-test-utils');

describe('Cu Initialization', () => {
  beforeEach(async () => {
    reset();
  });

  it('Loads WASM successfully', async () => {
    const instance = await loadWasm();
    assert.ok(instance, 'WASM instance should be loaded');
    assert.ok(instance.exports, 'WASM instance should have exports');
    assert.strictEqual(typeof instance.exports.init, 'function', 'Should have init export');
    assert.strictEqual(typeof instance.exports.compute, 'function', 'Should have compute export');
  });

  it('Initializes Lua VM', async () => {
    await loadWasm();
    const result = init();
    assert.strictEqual(result, 0, 'init() should return 0 on success');
  });

  it('Has required exports', async () => {
    const instance = await loadWasm();
    
    assert.strictEqual(typeof instance.exports.init, 'function');
    assert.strictEqual(typeof instance.exports.compute, 'function');
    assert.strictEqual(typeof instance.exports.get_buffer_ptr, 'function');
    assert.strictEqual(typeof instance.exports.get_buffer_size, 'function');
    assert.strictEqual(typeof instance.exports.get_memory_table_id, 'function');
    assert.strictEqual(typeof instance.exports.get_io_table_id, 'function');
  });

  it('Buffer pointer is valid', async () => {
    await loadWasm();
    init();
    const ptr = getBufferPtr();
    assert.ok(ptr > 0, 'Buffer pointer should be greater than 0');
  });
});
