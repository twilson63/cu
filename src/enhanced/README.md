# Enhanced Lua WASM External Storage API

This directory contains the enhanced implementation of the Lua WASM External Storage API with advanced features including function persistence, batch operations, and sophisticated querying capabilities.

## Directory Structure

```
src/enhanced/              # Enhanced WASM components
├── serialization/         # Function serialization system
├── batch/                # Batch operation processing
├── query/                # Query engine and indexing
└── security/              # Security and validation

web/enhanced/              # Enhanced JavaScript API
├── lua-api-enhanced.js   # Main enhanced API
├── storage-manager.js    # Advanced storage management
├── query-engine.js       # Query processing
└── batch-processor.js    # Batch operation handling

tests/enhanced/            # Enhanced test suite
├── function-persistence.test.js
├── batch-operations.test.js
├── query-engine.test.js
└── security.test.js

docs/enhanced/             # Enhanced documentation
├── API_REFERENCE.md      # Complete API reference
├── ARCHITECTURE.md       # Technical architecture
├── SECURITY.md           # Security guidelines
└── PERFORMANCE.md      # Performance optimization
```

## Key Features

- **Function Persistence**: Serialize and restore Lua functions with closure support
- **Batch Operations**: High-performance bulk operations with atomic transactions
- **Advanced Querying**: B-tree and hash indexing with multiple operators
- **Security Framework**: Comprehensive validation and sandboxing
- **Performance Optimization**: Intelligent caching and compression

## Quick Start

```javascript
import { EnhancedLuaWASM } from './web/enhanced/lua-api-enhanced.js';

const lua = await EnhancedLuaWASM.init();

// Function persistence
await lua.persistFunction('Memory', 'calculate', `
    function(x, y) return x * y + 100 end
`);

// Batch operations
const results = await lua.batchTableOperations([
    { type: 'set', table: 'users', key: '1', value: { name: 'Alice' } },
    { type: 'set', table: 'users', key: '2', value: { name: 'Bob' } }
]);

// Advanced querying
await lua.createIndex('Memory', 'users.name', 'btree');
const users = await lua.queryTable('Memory', {
    table: 'users',
    field: 'name',
    operator: 'startsWith',
    value: 'A'
});
```

## Implementation Status

- ✅ Project structure created
- 🔄 Function serialization system (in development)
- ⏳ Batch operations engine (pending)
- ⏳ Query engine with indexing (pending)
- ⏳ Enhanced JavaScript API (pending)
- ⏳ Security framework (pending)
- ⏳ Test suite (pending)
- ⏳ Documentation (pending)

## Architecture

The enhanced API builds upon the existing Lua WASM foundation with additional layers for advanced functionality while maintaining backward compatibility.

For detailed architecture information, see `docs/enhanced/ARCHITECTURE.md`.