# Enhanced Cu WASM External Storage API - Architecture

## Overview

This document describes the architecture of the Enhanced Cu WASM External Storage API, a production-ready system that extends the core Cu WASM implementation with advanced persistence capabilities, function serialization, batch operations, and sophisticated querying features.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              JavaScript API                           │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  EnhancedLuaAPI Class                           │  │  │
│  │  │  - Function Persistence                         │  │  │
│  │  │  - Batch Operations                             │  │  │
│  │  │  - Advanced Querying                            │  │  │
│  │  └────────────────┬──────────────────────────────┘  │  │
│  │                   │                                  │  │
│  │  ┌────────────────┴──────────────────────────────┐  │  │
│  │  │  AdvancedStorageManager                       │  │  │
│  │  │  - Storage Orchestration                      │  │  │
│  │  │  - Compression Service                        │  │  │
│  │  │  - Transaction Management                     │  │  │
│  │  └────────────────┬──────────────────────────────┘  │  │
│  │                   │                                  │  │
│  │  ┌────────────────┴──────────────────────────────┐  │  │
│  │  │  QueryEngine & IndexManager                   │  │  │
│  │  │  - B-tree and Hash Indices                    │  │  │
│  │  │  - Query Optimization                         │  │  │
│  │  │  - Result Caching                             │  │  │
│  │  └────────────────┬──────────────────────────────┘  │  │
│  └───────────────────┼──────────────────────────────────┘  │
│                      │                                      │
├──────────────────────┼──────────────────────────────────────┤
│                      ▼                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              WASM Boundary                           │  │
│  └──────────────────┬──────────────────────────────────┘  │
│                      │                                      │
│                      ▼                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           WebAssembly Module (lua.wasm)              │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Enhanced Lua 5.4.7 VM                          │  │  │
│  │  │  - Function Serialization                       │  │  │
│  │  │  - Bytecode Validation                          │  │  │
│  │  │  - Memory Management                            │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Enhanced Serialization System                  │  │  │
│  │  │  - Function Bytecode Support                    │  │  │
│  │  │  - C Function Registry                          │  │  │
│  │  │  - Compression Integration                      │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  External Table System                          │  │  │
│  │  │  - Enhanced Table Operations                    │  │  │
│  │  │  - Batch Operation Support                      │  │  │
│  │  │  - Function Registry Integration                │  │  │
│  │  └────────────────┬──────────────────────────────┘  │  │
│  │                   │                                  │  │
│  │  ┌────────────────┴──────────────────────────────┐  │  │
│  │  │  Memory Management Layer                      │  │  │
│  │  │  - 512KB Lua Heap                            │  │  │
│  │  │  - 64KB I/O Buffer                           │  │  │
│  │  │  - Custom Allocator                          │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────┬──────────────────────────────────┘  │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Browser Storage Layer                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  IndexedDB Integration                                │  │
│  │  - Automatic Persistence                              │  │
│  │  - Compression Support                              │  │  │
│  │  - Transaction Safety                                │  │  │
│  │  - Storage Quota Management                          │  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Enhanced JavaScript API Layer

#### EnhancedLuaAPI Class
The main interface providing high-level functionality to developers:

```javascript
class EnhancedLuaAPI {
    // Core functionality
    async init(options);
    eval(code);
    
    // Function persistence
    async persistFunction(table, name, code, options);
    async restoreFunction(table, name);
    
    // Batch operations
    async batchTableOperations(operations);
    
    // Advanced querying
    async createIndex(table, field, type);
    async queryTable(table, query);
    
    // Utility functions
    async getMemoryStats();  // Returns WASM memory statistics
    async validateFunction(code);
    async compressData(data);
    
    // Home table utilities
    async getHomeTableId();  // Get the _home table ID
}
```

**Note on Naming:** The home table (accessible as `_G._home` in Lua) represents the primary persistent storage location - your "home base" for data. The old name `Memory` is still supported as an alias for backward compatibility.

#### AdvancedStorageManager
Orchestrates complex storage operations and provides transaction support:

```javascript
class AdvancedStorageManager {
    // Storage operations
    async setValue(tableId, key, value, options);
    async getValue(tableId, key);
    async deleteValue(tableId, key);
    
    // Function persistence
    async persistFunction(tableId, key, bytecode, metadata);
    async restoreFunction(tableId, key);
    
    // Batch operations
    async processBatch(operations);
    
    // Transaction support
    async beginTransaction();
    async commitTransaction(transaction);
    async rollbackTransaction(transaction);
}
```

#### QueryEngine and IndexManager
Provides advanced querying capabilities with indexing support:

```javascript
class QueryEngine {
    // Index management
    async createIndex(tableId, fieldPath, indexType);
    async dropIndex(tableId, fieldPath);
    
    // Query execution
    async query(tableId, querySpec);
    async rangeQuery(tableId, field, min, max);
    
    // Performance optimization
    getQueryPlan(query);
    optimizeQuery(query);
}
```

### 2. Enhanced WASM Layer

#### Function Serialization System
Extends the existing serialization to support Lua functions:

```zig
// Enhanced serialization types
pub const SerializationType = enum(u8) {
    nil = 0x00,
    boolean = 0x01,
    integer = 0x02,
    float = 0x03,
    string = 0x04,
    function_bytecode = 0x05,    // Lua function bytecode
    function_ref = 0x06,           // C function reference
    table_ref = 0x07,            // External table reference
    compressed_data = 0x08,      // Compressed data
};

// Function serialization
pub fn serialize_function(L: *lua.lua_State, idx: c_int, buffer: [*]u8, max_len: usize) !usize {
    if (lua.iscfunction(L, idx)) {
        return serialize_c_function_ref(L, idx, buffer, max_len);
    }
    
    // Use Lua's string.dump for bytecode generation
    const bytecode = try dump_function(L, idx, true);
    return encode_bytecode(buffer, max_len, bytecode);
}
```

#### C Function Registry
Maintains a registry of standard C functions for proper serialization:

```zig
const CFunctionRegistry = struct {
    name: []const u8,
    func: lua.CFunction,
    category: FunctionCategory,
};

const c_function_registry = [_]CFunctionRegistry{
    .{ .name = "print", .func = lua.print, .category = .io },
    .{ .name = "math.sin", .func = lua.math_sin, .category = .math },
    .{ .name = "string.sub", .func = lua.string_sub, .category = .string },
    // ... additional standard library functions
};
```

#### Enhanced External Table System
Provides advanced table operations with batch support:

```zig
// Batch operation support
pub fn process_batch_operation(L: *lua.lua_State, operation_type: BatchOpType, data: [*]const u8, len: usize) !void {
    var stream = BatchStream.init(data, len);
    
    while (stream.has_next()) {
        const chunk = try stream.next_chunk();
        switch (operation_type) {
            .set => try process_batch_set(L, chunk),
            .get => try process_batch_get(L, chunk),
            .delete => try process_batch_delete(L, chunk),
        }
    }
}
```

### 3. Browser Storage Integration

#### IndexedDB Schema
Optimized storage schema for enhanced functionality:

```javascript
// Database structure
const dbSchema = {
    name: 'LuaEnhancedStorage',
    version: 2,
    stores: {
        externalTables: {
            keyPath: 'id',
            indexes: [
                { name: 'tableId', keyPath: 'tableId', unique: false },
                { name: 'timestamp', keyPath: 'timestamp', unique: false }
            ]
        },
        functionRegistry: {
            keyPath: 'id',
            indexes: [
                { name: 'tableId_name', keyPath: ['tableId', 'name'], unique: true }
            ]
        },
        indices: {
            keyPath: 'id',
            indexes: [
                { name: 'table_field', keyPath: ['tableId', 'field'], unique: true }
            ]
        }
    }
};
```

#### Compression Service
Intelligent compression for large data:

```javascript
class CompressionService {
    constructor() {
        this.algorithms = {
            gzip: new GzipCompression(),
            brotli: new BrotliCompression(),
            lz4: new LZ4Compression()
        };
        this.threshold = 1024; // 1KB
    }
    
    async compress(data) {
        if (data.length < this.threshold) {
            return { compressed: false, data };
        }
        
        const algorithm = this.selectAlgorithm(data);
        const compressed = await algorithm.compress(data);
        
        return {
            compressed: true,
            algorithm: algorithm.name,
            data: compressed,
            originalSize: data.length,
            compressedSize: compressed.length
        };
    }
}
```

## Data Flow

### Function Persistence Flow

```
1. JavaScript: persistFunction('Memory', 'calc', code)
   │
   ├─ Validate function code
   ├─ Compile in Lua VM
   ├─ Generate bytecode with string.dump
   │
2. WASM: serialize_function()
   │
   ├─ Detect function type (Lua vs C)
   ├─ For Lua: extract bytecode
   ├─ For C: find in registry
   ├─ Encode with type information
   │
3. JavaScript: AdvancedStorageManager
   │
   ├─ Compress large functions
   ├─ Store in IndexedDB
   ├─ Update function registry
   └─ Return success status

4. Restoration (reverse flow)
   │
   ├─ Retrieve from storage
   ├─ Decompress if needed
   ├─ Validate bytecode
   ├─ Load with luaL_loadbuffer
   └─ Restore to table
```

### Batch Operation Flow

```
1. JavaScript: batchTableOperations(operations)
   │
   ├─ Validate operation format
   ├─ Group by operation type
   ├─ Optimize operation order
   │
2. AdvancedStorageManager
   │
   ├─ Begin transaction
   ├─ Process operations in chunks
   ├─ Handle errors gracefully
   │
3. WASM: process_batch_operation()
   │
   ├─ Parse batch data stream
   ├─ Execute operations
   ├─ Collect results
   │
4. JavaScript
   │
   ├─ Commit transaction
   ├─ Return results array
   └─ Handle rollback if needed
```

### Query Execution Flow

```
1. JavaScript: queryTable('_home', query)
   │
   ├─ Parse query specification
   ├─ Check for available indices
   ├─ Generate query plan
   │
2. QueryEngine
   │
   ├─ Use index if available
   ├─ Fall back to full scan
   ├─ Apply filters and limits
   │
3. IndexManager (if indexed)
   │
   ├─ Navigate B-tree structure
   ├─ Find matching entries
   ├─ Return result set
   │
4. JavaScript
   │
   ├─ Deserialize results
   ├─ Apply sorting if needed
   ├─ Cache for future use
   └─ Return to caller
```

## Memory Management

### Enhanced Memory Layout

```
WASM Memory: 2MB (2097152 bytes)

0x000000  ┌──────────────────────────┐
          │  Lua State & Heap        │
          │  (~1.5MB)                │
          │                          │
0x180000  ├──────────────────────────┤
          │  I/O Buffer (64KB)       │
          │  ┌──────────────────────┐ │
          │  │ Input/Output         │ │
          │  │ Serialization        │ │
          │  │ Function bytecode    │ │
          │  └──────────────────────┘ │
0x1C0000  ├──────────────────────────┤
          │  Reserved Stack Space    │
0x200000  └──────────────────────────┘
```

### Memory Optimization Strategies

1. **Function Bytecode Caching**: Frequently used functions are cached in memory
2. **Compression Thresholds**: Large data is compressed before storage
3. **Batch Processing**: Operations are processed in memory-efficient chunks
4. **Index Memory Management**: Indices are loaded on-demand
5. **Garbage Collection**: Lua GC is triggered based on memory pressure

### Memory Safety

- **Buffer Overflow Protection**: All operations check buffer bounds
- **Type Safety**: Zig's type system prevents memory errors
- **Validation**: All inputs are validated before processing
- **Sandboxing**: WASM memory isolation prevents external access

## Performance Optimization

### Function Serialization Optimization

```javascript
// Function bytecode caching
const functionCache = new Map();

async function getCachedFunction(tableId, name) {
    const key = `${tableId}:${name}`;
    
    if (functionCache.has(key)) {
        const entry = functionCache.get(key);
        if (Date.now() - entry.timestamp < 300000) { // 5 min cache
            return entry.bytecode;
        }
    }
    
    // Load from storage
    const bytecode = await loadFromStorage(tableId, name);
    functionCache.set(key, { bytecode, timestamp: Date.now() });
    
    return bytecode;
}
```

### Batch Operation Optimization

```javascript
// Intelligent batch sizing
function optimizeBatchSize(operations) {
    const totalSize = operations.reduce((sum, op) => {
        return sum + estimateOperationSize(op);
    }, 0);
    
    if (totalSize > 1024 * 1024) { // > 1MB
        return Math.min(50, operations.length); // Smaller batches
    } else if (operations.length > 1000) {
        return Math.min(200, operations.length); // Larger batches
    }
    
    return Math.min(100, operations.length); // Default
}
```

### Query Optimization

```javascript
// Query plan optimization
function optimizeQuery(query) {
    const plan = {
        useIndex: false,
        indexName: null,
        estimatedCost: Infinity,
        strategy: 'full_scan'
    };
    
    // Check for available indices
    const availableIndex = findAvailableIndex(query.table, query.field);
    if (availableIndex && supportsOperator(availableIndex, query.operator)) {
        plan.useIndex = true;
        plan.indexName = availableIndex.name;
        plan.estimatedCost = estimateIndexCost(query);
        plan.strategy = 'index_scan';
    }
    
    return plan;
}
```

## Security Architecture

### Function Security

1. **Bytecode Validation**: All function bytecode is validated before execution
2. **Sandbox Execution**: Functions run in isolated Lua environment
3. **Resource Limits**: Execution time and memory limits enforced
4. **C Function Restrictions**: Only whitelisted C functions can be serialized

### Data Security

1. **Input Validation**: All user inputs are validated and sanitized
2. **Type Safety**: Zig's type system prevents buffer overflows
3. **Storage Isolation**: Data is isolated per origin/domain
4. **Encryption**: Sensitive data can be encrypted before storage

### Access Control

1. **Same-Origin Policy**: Browser enforces origin-based isolation
2. **Storage Quotas**: Respects browser storage limitations
3. **Rate Limiting**: Prevents abuse through operation throttling
4. **Audit Logging**: Tracks sensitive operations for security monitoring

## Scalability Considerations

### Horizontal Scaling
- **Multiple Instances**: Support for multiple independent Lua instances
- **Shared Storage**: Common storage backend for multiple instances
- **Load Balancing**: Distribute operations across instances

### Vertical Scaling
- **Memory Management**: Efficient memory usage for large datasets
- **Index Optimization**: B-tree indices for logarithmic query performance
- **Compression**: Reduce storage requirements for large data
- **Caching**: Multi-level caching for frequently accessed data

### Performance Limits
- **Function Size**: 100KB maximum bytecode per function
- **Batch Size**: 10,000 operations per batch maximum
- **Query Results**: 10,000 results per query maximum
- **Storage**: Browser-dependent (typically 50-80% of available quota)

## Future Enhancements

### Planned Features
1. **Schema Validation**: Runtime schema validation for data integrity
2. **Migration Tools**: Automated schema evolution and data migration
3. **Replication**: Multi-browser synchronization capabilities
4. **Analytics**: Built-in analytics and monitoring tools

### Architecture Evolution
1. **Web Workers**: Background processing for heavy operations
2. **Service Workers**: Offline capability and background sync
3. **WebAssembly SIMD**: Vector operations for data processing
4. **Streaming**: Support for streaming large datasets

## Conclusion

The Enhanced Cu WASM External Storage API provides a robust, scalable, and secure platform for browser-based Lua applications with advanced persistence capabilities. The architecture balances performance, functionality, and security while maintaining the lightweight nature of the original system.

The modular design allows for future enhancements and adaptations as browser technologies evolve, ensuring the system remains relevant and performant in the changing web development landscape.