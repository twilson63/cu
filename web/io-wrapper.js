/**
 * High-level wrapper for _io table operations
 * Provides convenient API for common patterns with structured input/output
 * 
 * The _io table enables passing arbitrarily large structured data between
 * JavaScript and Lua, bypassing the 64KB I/O buffer limitation.
 * 
 * Usage:
 *   import { IoWrapper } from './io-wrapper.js';
 *   const io = new IoWrapper();
 *   const result = await io.computeWithIo(code, inputData);
 */

import * as cu from './cu-api.js';

/**
 * IoWrapper class - Provides high-level API for _io table operations
 * 
 * This wrapper simplifies working with the _io external table by providing
 * convenient methods for common patterns like request/response and stream processing.
 */
export class IoWrapper {
  /**
   * Execute Lua code with structured input/output via _io table
   * 
   * This method handles the full lifecycle of an _io-based compute operation:
   * 1. Optionally clear previous I/O state
   * 2. Set structured input data to _io.input
   * 3. Set metadata to _io.meta
   * 4. Execute the Lua code
   * 5. Retrieve output from _io.output
   * 
   * @param {string} code - Lua code to execute (can access _io.input, write to _io.output)
   * @param {*} inputData - Structured input data (objects, arrays, primitives) or null
   * @param {Object} options - Optional configuration
   * @param {boolean} options.clearBefore - Clear I/O state before execution (default: true)
   * @param {Object} options.metadata - Additional metadata to attach to _io.meta
   * @returns {Promise<Object>} Result object with { returnValue, output, metadata }
   * 
   * @example
   * const result = await io.computeWithIo(`
   *   local user = _io.input.user
   *   _io.output = {
   *     fullName = user.firstName .. " " .. user.lastName,
   *     isAdult = user.age >= 18
   *   }
   * `, {
   *   user: { firstName: "Alice", lastName: "Smith", age: 30 }
   * });
   * console.log(result.output.fullName); // "Alice Smith"
   */
  async computeWithIo(code, inputData = null, options = {}) {
    const { clearBefore = true, metadata = {} } = options;
    
    // Clear previous I/O state if requested
    if (clearBefore) {
      lua.clearIo();
    }
    
    // Set input if provided
    if (inputData !== null) {
      lua.setInput(inputData);
    }
    
    // Set metadata with timestamp and request ID
    if (Object.keys(metadata).length > 0) {
      lua.setMetadata({
        ...metadata,
        timestamp: Date.now(),
        requestId: this.generateRequestId()
      });
    }
    
    // Execute code
    const resultBytes = await lua.compute(code);
    const result = lua.readResult(lua.getBufferPtr(), resultBytes);
    
    // Get output from _io.output
    const output = lua.getOutput();
    
    return {
      returnValue: result.value,
      output: output,
      metadata: metadata
    };
  }
  
  /**
   * Stream processing pattern for large datasets
   * 
   * Processes a large dataset in batches by repeatedly calling computeWithIo.
   * Each batch is provided with metadata about its position in the stream.
   * 
   * @param {string} code - Lua code to execute for each batch
   * @param {Array} dataStream - Array of items to process
   * @param {Object} options - Optional configuration
   * @param {number} options.batchSize - Number of items per batch (default: 100)
   * @returns {Promise<Array>} Array of output results from each batch
   * 
   * @example
   * const results = await io.processStream(`
   *   local batch = _io.input.batch
   *   local results = {}
   *   for i, item in ipairs(batch) do
   *     results[i] = { id = item.id, processed = true }
   *   end
   *   _io.output = results
   * `, largeDataset, { batchSize: 1000 });
   */
  async processStream(code, dataStream, options = {}) {
    const { batchSize = 100 } = options;
    const results = [];
    
    for (let i = 0; i < dataStream.length; i += batchSize) {
      const batch = dataStream.slice(i, i + batchSize);
      
      const result = await this.computeWithIo(code, {
        batch: batch,
        batchIndex: Math.floor(i / batchSize),
        hasMore: i + batchSize < dataStream.length
      });
      
      results.push(result.output);
    }
    
    return results;
  }
  
  /**
   * Request/response pattern for RPC-style API calls
   * 
   * Provides a standardized way to call Lua functions by method name.
   * The Lua code should define global functions that can be called by name.
   * 
   * @param {string} method - Name of the Lua function to call
   * @param {Object} params - Parameters to pass to the function (default: {})
   * @returns {Promise<Object>} Result from computeWithIo
   * 
   * @example
   * // First, set up Lua handler functions:
   * await lua.compute(`
   *   function calculateStats(params)
   *     local sum = 0
   *     for _, v in ipairs(params.data) do
   *       sum = sum + v
   *     end
   *     return { sum = sum, count = #params.data }
   *   end
   * `);
   * 
   * // Then call via request:
   * const result = await io.request('calculateStats', {
   *   data: [1, 2, 3, 4, 5]
   * });
   * console.log(result.output); // { sum: 15, count: 5 }
   */
  async request(method, params = {}) {
    return this.computeWithIo(`
      -- Standard request handler
      local method = _io.input.method
      local params = _io.input.params
      
      -- Route to handler
      if _G[method] then
        _io.output = _G[method](params)
      else
        _io.output = {
          error = "Unknown method: " .. method
        }
      end
    `, {
      method: method,
      params: params
    });
  }
  
  /**
   * Generate a unique request ID for tracking
   * 
   * @returns {string} Unique request ID in format "timestamp-random"
   * @private
   */
  generateRequestId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default IoWrapper;
