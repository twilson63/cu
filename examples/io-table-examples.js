/**
 * _io External Table Examples
 * 
 * This file demonstrates practical usage patterns for the _io external table,
 * which enables structured data exchange between JavaScript and Lua without
 * the 64KB I/O buffer limitation.
 * 
 * Prerequisites:
 * - WASM module loaded and initialized
 * - _io table implementation complete (see PRPs/io-external-table-prp.md)
 */

import { IoWrapper } from '../web/io-wrapper.js';
import * as lua from '../web/lua-api.js';

// ============================================================================
// Example 1: Basic Input/Output
// ============================================================================

/**
 * Demonstrates basic structured data exchange between host and Lua.
 * This pattern is useful for simple data transformations where you need
 * to preserve type information (booleans, nested objects, arrays).
 */
async function basicInputOutputExample() {
  console.log('=== Example 1: Basic Input/Output ===\n');
  
  const io = new IoWrapper();
  
  // Input: User data with nested structure
  const userData = {
    id: 123,
    firstName: "Alice",
    lastName: "Smith",
    age: 30,
    email: "alice@example.com",
    address: {
      street: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001"
    },
    preferences: {
      newsletter: true,
      notifications: false
    }
  };
  
  // Process in Lua: Transform user data
  const result = await io.computeWithIo(`
    -- Access input data
    local user = _io.input.user
    
    -- Transform data in Lua
    local processed = {
      id = user.id,
      fullName = user.firstName .. " " .. user.lastName,
      age = user.age,
      isAdult = user.age >= 18,
      location = user.address.city .. ", " .. user.address.state,
      contactEmail = user.email,
      subscribedToNewsletter = user.preferences.newsletter
    }
    
    -- Write output
    _io.output = processed
    
    -- Optional: Return summary via traditional I/O buffer
    return "Processed user " .. user.id
  `, {
    user: userData
  });
  
  console.log('Input user data:', userData);
  console.log('Output processed data:', result.output);
  console.log('Return value:', result.returnValue);
  console.log('\n');
  
  // Expected output:
  // {
  //   id: 123,
  //   fullName: "Alice Smith",
  //   age: 30,
  //   isAdult: true,
  //   location: "New York, NY",
  //   contactEmail: "alice@example.com",
  //   subscribedToNewsletter: true
  // }
}

// ============================================================================
// Example 2: Large Dataset Processing
// ============================================================================

/**
 * Demonstrates processing large datasets that would exceed the 64KB I/O buffer.
 * This pattern is useful for data analysis, aggregations, and bulk transformations
 * where the input/output data is too large for the traditional I/O buffer.
 */
async function largeDatasetExample() {
  console.log('=== Example 2: Large Dataset Processing ===\n');
  
  const io = new IoWrapper();
  
  // Create a large dataset (100,000 items ~= several MB)
  const largeDataset = new Array(100000).fill(0).map((_, i) => ({
    id: i,
    timestamp: Date.now() - (i * 1000),
    value: Math.random() * 100,
    category: ['A', 'B', 'C', 'D'][i % 4],
    metadata: {
      source: `sensor-${i % 10}`,
      quality: Math.random()
    }
  }));
  
  console.log(`Generated dataset with ${largeDataset.length} items`);
  console.log(`Estimated size: ~${(JSON.stringify(largeDataset).length / 1024 / 1024).toFixed(2)} MB`);
  
  // Process in Lua: Calculate comprehensive statistics
  const startTime = Date.now();
  
  const result = await io.computeWithIo(`
    local items = _io.input.items
    
    -- Initialize statistics
    local stats = {
      count = #items,
      totalValue = 0,
      minValue = math.huge,
      maxValue = -math.huge,
      categories = {},
      sensors = {},
      qualitySum = 0
    }
    
    -- Process all items
    for i = 1, #items do
      local item = items[i]
      local value = item.value
      
      -- Aggregate values
      stats.totalValue = stats.totalValue + value
      stats.minValue = math.min(stats.minValue, value)
      stats.maxValue = math.max(stats.maxValue, value)
      
      -- Count by category
      local cat = item.category
      stats.categories[cat] = (stats.categories[cat] or 0) + 1
      
      -- Count by sensor
      local sensor = item.metadata.source
      stats.sensors[sensor] = (stats.sensors[sensor] or 0) + 1
      
      -- Aggregate quality
      stats.qualitySum = stats.qualitySum + item.metadata.quality
    end
    
    -- Calculate derived statistics
    stats.averageValue = stats.totalValue / stats.count
    stats.averageQuality = stats.qualitySum / stats.count
    stats.valueRange = stats.maxValue - stats.minValue
    
    -- Output results
    _io.output = stats
    
    return "Processed " .. stats.count .. " items"
  `, {
    items: largeDataset
  });
  
  const elapsedTime = Date.now() - startTime;
  
  console.log(`Processed in ${elapsedTime}ms`);
  console.log('Statistics:', result.output);
  console.log('Categories:', result.output.categories);
  console.log('Sensors:', result.output.sensors);
  console.log('\n');
  
  // Expected output:
  // {
  //   count: 100000,
  //   averageValue: ~50,
  //   minValue: ~0,
  //   maxValue: ~100,
  //   valueRange: ~100,
  //   averageQuality: ~0.5,
  //   categories: { A: 25000, B: 25000, C: 25000, D: 25000 },
  //   sensors: { sensor-0: 10000, sensor-1: 10000, ... }
  // }
}

// ============================================================================
// Example 3: Streaming Pattern
// ============================================================================

/**
 * Demonstrates batch processing of large datasets in chunks.
 * This pattern is useful when you need to process data that's too large
 * to fit in memory all at once, or when you want to show progress updates.
 */
async function streamingPatternExample() {
  console.log('=== Example 3: Streaming Pattern ===\n');
  
  const io = new IoWrapper();
  
  // Create a large dataset to process in batches
  const totalItems = 50000;
  const dataStream = new Array(totalItems).fill(0).map((_, i) => ({
    id: i,
    value: Math.random() * 100,
    needsProcessing: Math.random() > 0.5
  }));
  
  console.log(`Streaming ${totalItems} items in batches...`);
  
  // Define the Lua processing code (runs once per batch)
  const processingCode = `
    local batch = _io.input.batch
    local batchIndex = _io.input.batchIndex
    local hasMore = _io.input.hasMore
    
    -- Process each item in the batch
    local results = {}
    local processedCount = 0
    local skippedCount = 0
    
    for i, item in ipairs(batch) do
      if item.needsProcessing then
        results[i] = {
          id = item.id,
          originalValue = item.value,
          processedValue = item.value * 2,
          timestamp = os.time(),
          batchIndex = batchIndex
        }
        processedCount = processedCount + 1
      else
        skippedCount = skippedCount + 1
      end
    end
    
    -- Return batch results
    _io.output = {
      batchIndex = batchIndex,
      batchSize = #batch,
      processedCount = processedCount,
      skippedCount = skippedCount,
      results = results,
      hasMore = hasMore
    }
    
    return "Batch " .. batchIndex .. " complete"
  `;
  
  // Process in batches
  const batchSize = 1000;
  const batchResults = [];
  let totalProcessed = 0;
  let totalSkipped = 0;
  
  const startTime = Date.now();
  
  for (let i = 0; i < dataStream.length; i += batchSize) {
    const batch = dataStream.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    const hasMore = i + batchSize < dataStream.length;
    
    const result = await io.computeWithIo(processingCode, {
      batch: batch,
      batchIndex: batchIndex,
      hasMore: hasMore
    }, {
      clearBefore: true,
      metadata: {
        totalItems: dataStream.length,
        progress: ((i + batch.length) / dataStream.length * 100).toFixed(1)
      }
    });
    
    batchResults.push(result.output);
    totalProcessed += result.output.processedCount;
    totalSkipped += result.output.skippedCount;
    
    // Show progress
    if (batchIndex % 10 === 0) {
      console.log(`Progress: ${result.metadata.progress}% (batch ${batchIndex})`);
    }
  }
  
  const elapsedTime = Date.now() - startTime;
  
  console.log(`\nCompleted ${batchResults.length} batches in ${elapsedTime}ms`);
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Average time per batch: ${(elapsedTime / batchResults.length).toFixed(2)}ms`);
  console.log(`Throughput: ${(totalItems / (elapsedTime / 1000)).toFixed(0)} items/sec`);
  console.log('\n');
  
  // Example of accessing results from a specific batch
  const firstBatch = batchResults[0];
  console.log('First batch summary:', {
    batchIndex: firstBatch.batchIndex,
    batchSize: firstBatch.batchSize,
    processedCount: firstBatch.processedCount,
    skippedCount: firstBatch.skippedCount
  });
}

// ============================================================================
// Example 4: Request/Response API Pattern
// ============================================================================

/**
 * Demonstrates using _io for a request/response API pattern.
 * This pattern is useful for building stateful services where Lua acts as
 * a handler for different methods/operations with structured request/response.
 */
async function requestResponseApiExample() {
  console.log('=== Example 4: Request/Response API Pattern ===\n');
  
  const io = new IoWrapper();
  
  // First, initialize a Lua "service" with handler functions
  await lua.compute(`
    -- Define API handlers
    
    function calculateStats(params)
      local dataset = params.dataset
      local sum = 0
      local min = math.huge
      local max = -math.huge
      
      for i, value in ipairs(dataset) do
        sum = sum + value
        min = math.min(min, value)
        max = math.max(max, value)
      end
      
      return {
        count = #dataset,
        sum = sum,
        average = sum / #dataset,
        min = min,
        max = max,
        range = max - min
      }
    end
    
    function filterData(params)
      local dataset = params.dataset
      local threshold = params.threshold or 50
      local filtered = {}
      
      for i, value in ipairs(dataset) do
        if value >= threshold then
          filtered[#filtered + 1] = value
        end
      end
      
      return {
        original_count = #dataset,
        filtered_count = #filtered,
        threshold = threshold,
        filtered_data = filtered
      }
    end
    
    function transformData(params)
      local dataset = params.dataset
      local operation = params.operation or "double"
      local transformed = {}
      
      for i, value in ipairs(dataset) do
        if operation == "double" then
          transformed[i] = value * 2
        elseif operation == "square" then
          transformed[i] = value * value
        elseif operation == "sqrt" then
          transformed[i] = math.sqrt(value)
        else
          transformed[i] = value
        end
      end
      
      return {
        operation = operation,
        count = #transformed,
        data = transformed
      }
    end
    
    function batchProcess(params)
      local operations = params.operations
      local dataset = params.dataset
      local results = {}
      
      for i, op in ipairs(operations) do
        if op.method == "calculateStats" then
          results[i] = calculateStats({ dataset = dataset })
        elseif op.method == "filterData" then
          results[i] = filterData({ 
            dataset = dataset, 
            threshold = op.threshold 
          })
        elseif op.method == "transformData" then
          results[i] = transformData({ 
            dataset = dataset, 
            operation = op.operation 
          })
        end
      end
      
      return {
        operation_count = #operations,
        results = results
      }
    end
    
    return "API handlers initialized"
  `);
  
  console.log('API handlers initialized\n');
  
  // Example dataset
  const testDataset = [12, 45, 78, 23, 56, 89, 34, 67, 91, 28];
  
  // Request 1: Calculate statistics
  console.log('Request 1: calculateStats');
  const statsResult = await io.request('calculateStats', {
    dataset: testDataset
  });
  console.log('Response:', statsResult.output);
  console.log('');
  
  // Request 2: Filter data
  console.log('Request 2: filterData (threshold=50)');
  const filterResult = await io.request('filterData', {
    dataset: testDataset,
    threshold: 50
  });
  console.log('Response:', filterResult.output);
  console.log('');
  
  // Request 3: Transform data
  console.log('Request 3: transformData (operation=square)');
  const transformResult = await io.request('transformData', {
    dataset: testDataset,
    operation: 'square'
  });
  console.log('Response:', transformResult.output);
  console.log('');
  
  // Request 4: Batch processing (multiple operations)
  console.log('Request 4: batchProcess (3 operations)');
  const batchResult = await io.request('batchProcess', {
    dataset: testDataset,
    operations: [
      { method: 'calculateStats' },
      { method: 'filterData', threshold: 60 },
      { method: 'transformData', operation: 'double' }
    ]
  });
  console.log('Response:', batchResult.output);
  console.log('Individual results:');
  batchResult.output.results.forEach((result, index) => {
    console.log(`  Operation ${index + 1}:`, result);
  });
  console.log('');
  
  // Request 5: Error handling (unknown method)
  console.log('Request 5: unknownMethod (error handling)');
  const errorResult = await io.request('unknownMethod', {
    dataset: testDataset
  });
  console.log('Response:', errorResult.output);
  console.log('');
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Run all examples
 * 
 * To run this file:
 * 1. Ensure WASM module is built: ./build.sh
 * 2. Start demo server: npm run demo
 * 3. Open browser console and run examples
 * 
 * Or use in Node.js with appropriate WASM loader
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         _io External Table Examples                       ║');
  console.log('║         Demonstrating structured data exchange             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    // Initialize Lua WASM
    console.log('Initializing Lua WASM...');
    await lua.loadLuaWasm();
    lua.init();
    console.log('Lua WASM initialized successfully\n');
    
    // Run examples
    await basicInputOutputExample();
    await largeDatasetExample();
    await streamingPatternExample();
    await requestResponseApiExample();
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         All examples completed successfully!               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('Error running examples:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Export for use in browser or Node.js
export {
  basicInputOutputExample,
  largeDatasetExample,
  streamingPatternExample,
  requestResponseApiExample,
  runAllExamples
};

// Auto-run if loaded directly in browser
if (typeof window !== 'undefined' && window.location) {
  // Browser environment
  window.ioExamples = {
    basicInputOutputExample,
    largeDatasetExample,
    streamingPatternExample,
    requestResponseApiExample,
    runAllExamples
  };
  
  console.log('_io Examples loaded!');
  console.log('Run window.ioExamples.runAllExamples() to execute all examples');
  console.log('Or run individual examples:');
  console.log('  - window.ioExamples.basicInputOutputExample()');
  console.log('  - window.ioExamples.largeDatasetExample()');
  console.log('  - window.ioExamples.streamingPatternExample()');
  console.log('  - window.ioExamples.requestResponseApiExample()');
}
