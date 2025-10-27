# ⚡ cu - Compute Unit

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build Status](https://img.shields.io/github/actions/workflow/status/twilson63/cu/build.yml?branch=main)
![Version](https://img.shields.io/badge/version-2.0.0-green.svg)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?logo=webassembly&logoColor=white)
![Lua](https://img.shields.io/badge/Lua-5.4.7-2C2D72?logo=lua&logoColor=white)

```
                
   ___ _   _ 
  / __| | | |
 | (__| |_| |
  \___|\__,_|
             
  compute unit
```

> **Secure Sandboxed Compute Platform** - Production-ready Lua 5.4.7 in WebAssembly with persistent storage, function serialization, wallet-authenticated relay services, and encrypted secret management

## ✨ Key Features

- **🔄 Complete State Persistence** - Functions, data, and application state survive page reloads
- **⚡ High-Performance Operations** - Batch processing, indexing, and optimized queries
- **🔒 Function Serialization** - Persist user-defined functions and closures across sessions
- **📊 Advanced Querying** - Indexed queries, filters, and complex data operations
- **🛡️ Production Ready** - Comprehensive error handling, validation, and security
- **🎯 Zero Dependencies** - Pure WebAssembly, no external libraries required
- **📦 Tiny Footprint** - 1.6MB WASM binary (gzips to ~400KB)
- **🌐 Universal Browser Support** - Works in all modern browsers

## 🚀 Quick Start

> **Note on Naming**: As of v2.0.0, the persistent storage table is now called `_home` instead of `Memory`. This change provides better clarity and follows Lua naming conventions (prefixed with underscore to indicate it's a special/system table). See the [Migration Guide](docs/MIGRATION_TO_HOME.md) for upgrading from v1.x.

### CDN Usage (Fastest)

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/cu@2.0.0/dist/cu.js"></script>
</head>
<body>
    <script type="module">
        import lua from './web/lua-api.js';
        
        // Initialize Lua WASM
        await lua.loadLuaWasm();
        lua.init();
        
        // Basic computation
        const result = await lua.compute('return 2 + 2');
        console.log('Result:', result); // 4
        
        // Define and persist functions in _home table
        await lua.compute(`
            function _home.fibonacci(n)
                if n <= 1 then return n end
                return _home.fibonacci(n - 1) + _home.fibonacci(n - 2)
            end
        `);
        
        // Save state (includes functions)
        await lua.saveState();
        
        // After page reload, function still exists and works
        const fibResult = await lua.compute('return _home.fibonacci(10)');
        console.log('Fibonacci(10):', fibResult); // 55
    </script>
</body>
</html>
```

### npm Installation

```bash
npm install cu
```

```javascript
import lua from './web/lua-api.js';

await lua.loadLuaWasm();
lua.init();

// Basic usage
const result = await lua.compute('return "Hello from Lua!"');
console.log(result); // "Hello from Lua!"

// Store data in _home table (with automatic persistence)
await lua.compute(`
    _home.users = _home.users or {}
    _home.users.user1 = { name = 'Alice', age = 30 }
    _home.users.user2 = { name = 'Bob', age = 25 }
`);

// Data persists automatically - save to IndexedDB
await lua.saveState();

// After page refresh, data is automatically restored
```

## 📖 Advanced Usage Examples

### Structured I/O with _io Table

The `_io` external table enables passing arbitrarily large structured data between JavaScript and Lua, bypassing the 64KB I/O buffer limitation. Perfect for processing large datasets while preserving type information.

```javascript
import lua from './lua-api.js';

// Initialize
await lua.loadLuaWasm();
lua.init();

// Process structured data with setInput/getOutput
lua.setInput({
  users: [
    { id: 1, name: "Alice", score: 95 },
    { id: 2, name: "Bob", score: 87 },
    { id: 3, name: "Charlie", score: 92 }
  ],
  threshold: 90
});

lua.compute(`
  local users = _io.input.users
  local threshold = _io.input.threshold
  
  local highScorers = {}
  for i, user in ipairs(users) do
    if user.score >= threshold then
      table.insert(highScorers, {
        name = user.name,
        score = user.score
      })
    end
  end
  
  _io.output = {
    highScorers = highScorers,
    count = #highScorers
  }
`);

const result = lua.getOutput();
console.log(result);
// {
//   highScorers: [
//     { name: "Alice", score: 95 },
//     { name: "Charlie", score: 92 }
//   ],
//   count: 2
// }
```

**Using the IoWrapper for convenience:**

```javascript
import { IoWrapper } from './io-wrapper.js';

const io = new IoWrapper();

// Simple request/response pattern
const result = await io.computeWithIo(`
  local data = _io.input.dataset
  local sum = 0
  for i, v in ipairs(data) do
    sum = sum + v
  end
  _io.output = { sum = sum, average = sum / #data }
`, {
  dataset: [10, 20, 30, 40, 50]
});

console.log(result.output); // { sum: 150, average: 30 }

// Stream processing for very large datasets
const largeDataset = new Array(100000).fill(0).map((_, i) => ({
  id: i,
  value: Math.random() * 100
}));

const results = await io.processStream(`
  local batch = _io.input.batch
  local processed = {}
  for i, item in ipairs(batch) do
    processed[i] = {
      id = item.id,
      doubled = item.value * 2
    }
  end
  _io.output = processed
`, largeDataset, { batchSize: 1000 });
```

**Performance Comparison:**

| Approach | Max Data Size | Type Preservation | Use Case |
|----------|---------------|-------------------|----------|
| Direct `compute()` | 64KB (buffer) | Limited | Simple calculations, small data |
| `_io` table | Unlimited* | Full | Large datasets, complex structures |
| `_home` table | Unlimited* | Full | Persistent data across sessions |

*Limited only by available browser memory

For detailed _io table documentation, see [IO_TABLE_API.md](docs/IO_TABLE_API.md).

---

### Function Persistence

```javascript
// Define functions in _home table
await lua.compute(`
    function _home.taxCalculator(income, deductions) 
        local taxable = income - (deductions or 0)
        local brackets = {10000, 50000, 100000}
        local rates = {0.1, 0.2, 0.3, 0.4}
        -- Complex tax calculation logic
        return taxable * rates[1]  -- Simplified
    end
`);

// Function with closures
await lua.compute(`
    local count = 0
    function _home.counterFactory()
        count = count + 1
        return count
    end
`);

// Save functions to persist across page reloads
await lua.saveState();

// Use functions (they persist automatically after reload)
const result = await lua.compute(`
    return {
        tax = _home.taxCalculator(75000, 5000),
        count1 = _home.counterFactory(),
        count2 = _home.counterFactory()
    }
`);
console.log(result);
```

### Bulk Data Operations

```javascript
// Store bulk data using Lua tables
const users = Array.from({length: 1000}, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    score: Math.floor(Math.random() * 1000)
}));

// Insert users via Lua
console.time('Insert 1000 users');
await lua.compute(`
    _home.appUsers = _home.appUsers or {}
    -- Users will be populated via JavaScript calls
`);

// Build Lua code to insert all users
let insertCode = '_home.appUsers = _home.appUsers or {}\n';
users.forEach(user => {
    insertCode += `_home.appUsers.user_${user.id} = {
        id = ${user.id},
        name = "${user.name}",
        email = "${user.email}",
        score = ${user.score}
    }\n`;
});

await lua.compute(insertCode);
console.timeEnd('Insert 1000 users');

// Save all data
await lua.saveState();
```

### Querying and Filtering

```javascript
// Query data using Lua directly
const highScorers = await lua.compute(`
    local results = {}
    for key, user in pairs(_home.appUsers) do
        if user.score >= 800 then
            table.insert(results, user)
        end
    end
    table.sort(results, function(a, b) return a.score > b.score end)
    return results
`);

console.log('Top scorers:', highScorers);

// Range queries
const midRangeUsers = await lua.compute(`
    local results = {}
    for key, user in pairs(_home.appUsers) do
        if user.score >= 400 and user.score <= 600 then
            table.insert(results, user)
        end
    end
    return results
`);

// String matching
const emailResults = await lua.compute(`
    local results = {}
    for key, user in pairs(_home.appUsers) do
        if string.match(user.email, "example") then
            table.insert(results, user)
        end
    end
    return results
`);
```

### Data Analysis

```javascript
// Define analytical functions
await lua.compute(`
    function _home.average(values)
        local sum = 0
        for _, v in ipairs(values) do sum = sum + v end
        return sum / #values
    end
    
    function _home.median(values)
        table.sort(values)
        local n = #values
        if n % 2 == 0 then
            return (values[n/2] + values[n/2 + 1]) / 2
        else
            return values[(n + 1) / 2]
        end
    end
    
    function _home.stdev(values)
        local avg = _home.average(values)
        local sum = 0
        for _, v in ipairs(values) do
            sum = sum + (v - avg)^2
        end
        return math.sqrt(sum / #values)
    end
`);

// Use analytical functions
const analysis = await lua.compute(`
    local scores = {}
    for i = 1, 100 do
        scores[i] = math.random(100, 1000)
    end
    
    return {
        average = _home.average(scores),
        median = _home.median(scores),
        stdev = _home.stdev(scores),
        min = math.min(unpack(scores)),
        max = math.max(unpack(scores))
    }
`);

console.log('Score analysis:', analysis);

// Save analysis functions for reuse
await lua.saveState();
```

## 📚 API Reference

### Core Functions

#### `LuaWASM.init(options?)`
Initialize the enhanced Lua WASM environment.

**Parameters:**
- `options` (optional): Configuration object
  - `memorySize`: Initial memory size (default: 16MB)
  - `autoRestore`: Restore persisted state on init (default: true)
  - `compression`: Enable compression (default: true)
  - `validation`: Enable input validation (default: true)

**Returns:** Promise<EnhancedLuaInstance>

#### `lua.compute(code)`
Execute Lua code and return the result.

**Parameters:**
- `code`: String containing Lua code

**Returns:** Promise that resolves to the last returned value from Lua (as string/number/object)

#### `lua.saveState(name?)`
Save the _home table and all external tables to browser storage (IndexedDB).

**Parameters:**
- `name`: Optional snapshot name (default: 'default')

**Returns:** Promise<boolean> - Success status

#### `lua.loadState(name?)`
Restore the _home table and all external tables from browser storage.

**Parameters:**
- `name`: Optional snapshot name (default: 'default')

**Returns:** Promise<boolean> - Success status

#### `lua.init()`
Initialize the Lua VM after loading the WASM module.

**Returns:** number - Status code (0 = success)

#### `lua.getMemoryStats()`
Get memory statistics from the Lua VM.

**Returns:** Object with memory information
- `total`: Total memory allocated
- `used`: Memory currently in use
- `free`: Available memory

#### `lua.runGc()`
Run garbage collection on the Lua VM.

**Returns:** void

#### `lua.readBuffer(ptr, len)`
Read raw bytes from WASM memory.

**Parameters:**
- `ptr`: Memory pointer
- `len`: Number of bytes to read

**Returns:** string - Decoded buffer contents

#### `lua.getTableInfo()`
Get information about external tables.

**Returns:** Object with table information
- `memoryTableId`: ID of _home table
- `tableCount`: Total number of tables
- `tableIds`: Array of all table IDs

### _io Table API

The `_io` table provides structured input/output capabilities for passing large datasets between JavaScript and Lua.

#### `lua.getIoTableId()`
Get the numeric identifier for the `_io` external table.

**Returns:** `number|null` - Table ID or null if not initialized

#### `lua.setInput(data)`
Set input data accessible as `_io.input` in Lua.

**Parameters:**
- `data` (any): JavaScript value (primitives, objects, arrays, nested structures)

**Example:**
```javascript
lua.setInput({
  users: [{ id: 1, name: "Alice" }],
  config: { limit: 100 }
});

lua.compute(`
  local users = _io.input.users
  local limit = _io.input.config.limit
  -- Process data
`);
```

#### `lua.getOutput()`
Retrieve output data set by Lua via `_io.output`.

**Returns:** `any` - JavaScript value matching the structure set in Lua

**Example:**
```javascript
lua.compute(`
  _io.output = {
    result = "success",
    items = {1, 2, 3}
  }
`);

const output = lua.getOutput();
console.log(output); // { result: "success", items: [1, 2, 3] }
```

#### `lua.setInputField(key, value)`
Set a specific field in `_io.input` without replacing entire input.

**Parameters:**
- `key` (string): Field name
- `value` (any): Value to set

#### `lua.getOutputField(key)`
Retrieve a specific field from `_io.output`.

**Parameters:**
- `key` (string): Field name

**Returns:** `any` - Field value or null

#### `lua.setMetadata(meta)`
Set metadata in `_io.meta` for tracking and debugging.

**Parameters:**
- `meta` (object): Metadata object

**Example:**
```javascript
lua.setMetadata({
  requestId: 'req-123',
  timestamp: Date.now()
});
```

#### `lua.clearIo()`
Clear all data in the `_io` table (input, output, and metadata).

**Returns:** `void`

**Example:**
```javascript
lua.clearIo(); // Reset _io state between requests
```

### IoWrapper Class

High-level wrapper for common _io table patterns.

#### `new IoWrapper()`
Create a new IoWrapper instance.

**Example:**
```javascript
import { IoWrapper } from './io-wrapper.js';
const io = new IoWrapper();
```

#### `io.computeWithIo(code, inputData, options)`
Execute Lua code with structured input/output.

**Parameters:**
- `code` (string): Lua code to execute
- `inputData` (any): Input data for `_io.input`
- `options` (object): Optional configuration
  - `clearBefore` (boolean): Clear I/O before execution (default: true)
  - `metadata` (object): Additional metadata

**Returns:** `Promise<Object>` - `{ returnValue, output, metadata }`

**Example:**
```javascript
const result = await io.computeWithIo(`
  local sum = 0
  for i, v in ipairs(_io.input.numbers) do
    sum = sum + v
  end
  _io.output = { sum = sum }
`, { numbers: [1, 2, 3, 4, 5] });

console.log(result.output.sum); // 15
```

#### `io.processStream(code, dataStream, options)`
Process large datasets in batches.

**Parameters:**
- `code` (string): Lua code to execute per batch
- `dataStream` (array): Array of items to process
- `options` (object): Optional configuration
  - `batchSize` (number): Items per batch (default: 100)

**Returns:** `Promise<Array>` - Array of outputs from each batch

**Example:**
```javascript
const results = await io.processStream(`
  local batch = _io.input.batch
  local processed = {}
  for i, item in ipairs(batch) do
    processed[i] = item.value * 2
  end
  _io.output = processed
`, largeDataset, { batchSize: 1000 });
```

#### `io.request(method, params)`
RPC-style method invocation pattern.

**Parameters:**
- `method` (string): Lua function name to call
- `params` (object): Parameters to pass

**Returns:** `Promise<Object>` - Result from computeWithIo

**Example:**
```javascript
// Define handler in Lua
await lua.compute(`
  function calculateStats(params)
    local sum = 0
    for _, v in ipairs(params.data) do
      sum = sum + v
    end
    return { sum = sum }
  end
`);

// Call via request
const result = await io.request('calculateStats', {
  data: [1, 2, 3, 4, 5]
});
```

### Lua Table Access Patterns

Since all data is stored in Lua tables accessed via the _home table, you can query using standard Lua operations:

```javascript
// Direct table access
const user = await lua.compute('return _home.users.user1');

// Iteration over tables
const userCount = await lua.compute(`
    local count = 0
    for key, user in pairs(_home.users) do
        count = count + 1
    end
    return count
`);

// Filtering and mapping
const results = await lua.compute(`
    local active = {}
    for key, user in pairs(_home.users) do
        if user.status == "active" then
            table.insert(active, user)
        end
    end
    return active
`);
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│         Enhanced JavaScript API             │
│  ┌───────────────────────────────────────┐  │
│  │  Advanced Storage Manager             │  │
│  │  - Function Persistence               │  │
│  │  - Batch Operations                   │  │
│  │  - Query Engine                       │  │
│  │  - Compression Service                │  │
│  └────────────────┬──────────────────────┘  │
│                   │                           │
│  ┌────────────────┴──────────────────────┐  │
│  │  Transaction & Index Manager            │  │
│  └────────────────┬──────────────────────┘  │
│                   │                           │
├───────────────────┼───────────────────────────┤
│                   ▼                           │
│  ┌───────────────────────────────────────┐  │
│  │  WASM Module (lua.wasm)               │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Enhanced Lua 5.4.7 VM          │  │  │
│  │  │  - Function Serialization        │  │  │
│  │  │  - Advanced Memory Management    │  │  │
│  │  └─────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  External Table System          │  │  │
│  │  │  - Function Registry            │  │  │
│  │  │  - Batch Operation Support      │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └────────────────┬──────────────────────┘  │
│                   │                           │
└───────────────────┼───────────────────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│           Browser Storage                   │
│  ┌───────────────────────────────────────┐  │
│  │  IndexedDB Integration                │  │
│  │  - Automatic Persistence              │  │
│  │  - Compression Support                │  │
│  │  - Transaction Safety                  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 🧪 Testing

### Comprehensive Test Suite

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:function-persistence
npm run test:batch-operations  
npm run test:advanced-querying
npm run test:performance

# Run with coverage
npm run test:coverage

# Run performance benchmarks
npm run benchmark
```

### Performance Benchmarks

```javascript
// Function serialization performance
console.time('Function Persistence');
await lua.compute(`
    function _home.testFunc(x) 
        return x * 2 
    end
`);
await lua.saveState();
console.timeEnd('Function Persistence'); // ~2-10ms

// Bulk data storage
console.time('Store 1000 items');
let code = '_home.bench = {}\n';
for (let i = 0; i < 1000; i++) {
    code += `_home.bench.key${i} = "value${i}"\n`;
}
await lua.compute(code);
console.timeEnd('Store 1000 items'); // ~50-100ms

// Table iteration performance
console.time('Query 1000 items');
const results = await lua.compute(`
    local results = {}
    for key, value in pairs(_home.bench) do
        if string.match(key, "key5") then
            table.insert(results, {key = key, value = value})
        end
    end
    return results
`);
console.timeEnd('Query 1000 items'); // ~5-20ms
```

## 🔒 Security

### Built-in Security Features

- **Sandboxed Execution**: Lua code runs in isolated WASM environment
- **Bytecode Validation**: All persisted functions are validated before execution
- **Input Sanitization**: All user inputs are sanitized and validated
- **Storage Isolation**: Data is isolated per origin/domain
- **Memory Boundaries**: Enforced WASM memory limits prevent overflow

### Best Practices

```javascript
// Always wrap code in try-catch for error handling
try {
    const result = await lua.compute(`
        return _home.getValue("key")
    `);
} catch (error) {
    console.error('Lua execution error:', error);
}

// Save state regularly to persist data
setInterval(async () => {
    await lua.saveState();
    console.log('State saved');
}, 5000);

// Use consistent naming for _home table keys
await lua.compute(`
    _home.config = _home.config or {}
    _home.data = _home.data or {}
    _home.cache = _home.cache or {}
`);

// Monitor memory usage
const stats = lua.getMemoryStats();
console.log('Memory used:', stats.used, 'bytes');
```

## 🌐 Browser Compatibility

| Browser | Version | Function Persistence | Batch Ops | Query Index | Status |
|---------|---------|---------------------|-----------|-------------|---------|
| Chrome | 80+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Recommended** |
| Firefox | 79+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Supported** |
| Safari | 13.1+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Supported** |
| Edge | 79+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Supported** |
| Mobile Chrome | 80+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Supported** |
| Mobile Safari | 13.1+ | ✅ Full Support | ✅ Full Support | ✅ Full Support | **Supported** |

## 🔨 Building from Source

### Prerequisites

- [Zig](https://ziglang.org/) 0.15.1 or later
- Node.js 16+ and npm
- Python 3.x (for local development server)

### Quick Build

```bash
# Clone repository
git clone https://github.com/yourusername/lua-wasm-external-storage.git
cd lua-wasm-external-storage

# Install dependencies
npm install

# Build enhanced WASM module
./build.sh --enhanced

# Run tests
npm test

# Start development server
npm run dev
# Open http://localhost:8000
```

### Build Options

```bash
# Development build with debug symbols
./build.sh --debug --enhanced

# Production build (optimized)
./build.sh --release --enhanced

# Minimal build (core features only)
./build.sh --minimal

# Clean and rebuild
rm -rf .zig-cache .build web/lua.wasm && ./build.sh --enhanced
```

## 📊 Performance Characteristics

### Function Persistence
- **Serialization Time**: ~2ms per function
- **Deserialization Time**: ~1ms per function
- **Storage per Function**: ~200 bytes (typical simple function)
- **Maximum Size**: 16KB per value (IO buffer limit)

### Data Operations
- **Computation Speed**: <10ms for typical Lua operations
- **Table Storage**: Direct Lua table access (no intermediate layer)
- **Memory Persistence**: ~50ms for IndexedDB I/O
- **Memory Usage**: Minimal overhead (~1MB for 1000+ items)

### Persistence Performance
- **Save State**: ~50-100ms for IndexedDB storage
- **Load State**: ~50-100ms from IndexedDB
- **Compression**: 2:1 to 5:1 ratio for binary data
- **Browser Storage**: Up to 50MB per origin (varies by browser)

## 🔄 Migration from v1.x

If you're upgrading from v1.x, the primary change is renaming the persistent storage table from `Memory` to `_home`:

**Before (v1.x):**
```lua
Memory.data = { key = "value" }
function Memory.myFunction() end
```

**After (v2.0.0):**
```lua
_home.data = { key = "value" }
function _home.myFunction() end
```

**Migration steps:**
1. Update all references from `Memory.` to `_home.` in your Lua code
2. Update all references from `Memory[` to `_home[` if using bracket notation
3. Test your application thoroughly
4. See the [Migration Guide](docs/MIGRATION_TO_HOME.md) for detailed instructions and automated migration tools

The API remains otherwise unchanged, ensuring a smooth upgrade path.

## 🔧 Low-Level WASM API

For developers integrating lua.wasm into **non-JavaScript environments** (Rust, C, Go, custom WASM runtimes), we provide comprehensive low-level API documentation:

**📘 [WASM Low-Level API Reference](docs/WASM_API_REFERENCE.md)**

This guide documents:
- All 11 WASM exports (init, compute, etc.)
- All 5 required host function imports
- Memory protocol and I/O buffer (64KB)
- Complete integration examples in Rust, C, Go, and Node.js
- Type mappings and calling conventions
- Error handling and best practices

**Working Integration Examples:**
- [Rust + wasmtime](examples/wasm-integration/rust-example/)
- [C + WAMR](examples/wasm-integration/c-example/)
- [Go + wazero](examples/wasm-integration/go-example/)
- [Node.js (bare WASM)](examples/wasm-integration/nodejs-example/)

Perfect for building custom Lua runtimes or language bindings.

## 📚 Complete Documentation

### Core Documentation

- **[API Reference](docs/API_REFERENCE.md)** - Complete JavaScript API documentation
- **[Architecture Guide](docs/ARCHITECTURE.md)** - System design and data flows
- **[Enhanced Architecture](docs/ENHANCED_ARCHITECTURE.md)** - Advanced features and optimizations
- **[Quick Start Guide](docs/QUICK_START.md)** - Get up and running in 5 minutes
- **[Technical Reference](docs/TECHNICAL_REFERENCE.md)** - Deep dive into implementation

### Security & Advanced Use Cases

- **[Secure Relay Architecture](docs/SECURE_RELAY_ARCHITECTURE.md)** - Build secure LLM relay services with wallet-signed requests and encrypted secret vaults
- **[API Naming Clarification](docs/API_NAMING_CLARIFICATION.md)** - Understanding `compute()` vs `eval()` API naming

### Integration Guides

- **[WASM Low-Level API](docs/WASM_API_REFERENCE.md)** - Integrate with Rust, C, Go, and other languages
- **[Browser Testing Guide](docs/BROWSER_TESTING.md)** - Playwright integration and testing strategies
- **[Build & Deployment](docs/BUILD_AND_DEPLOYMENT_GUIDE.md)** - Production deployment guide

### Feature Documentation

- **[Function Persistence](docs/PHASE1_FUNCTION_PERSISTENCE.md)** - Serialize and restore Lua functions
- **[_io External Table API](docs/IO_TABLE_API.md)** - Structured I/O for large datasets
- **[Memory Protocol](docs/MEMORY_PROTOCOL.md)** - External storage protocol specification
- **[Performance Guide](docs/PERFORMANCE_GUIDE.md)** - Optimization strategies and benchmarks

### Migration & Troubleshooting

- **[Migration to _home](docs/MIGRATION_TO_HOME.md)** - Upgrade from v1.x Memory table
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Implementation Decisions](docs/IMPLEMENTATION_DECISIONS_LOG.md)** - Design rationale and tradeoffs

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Style

- **Zig**: Follow existing patterns in `src/`
- **JavaScript**: ES6+ modules, async/await, comprehensive JSDoc
- **Tests**: Playwright for integration, unit tests for core logic
- **Documentation**: Update docs for all new features

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Lua Team](https://www.lua.org/) - For the amazing Lua language
- [Zig Language](https://ziglang.org/) - For making WASM compilation straightforward
- [WebAssembly Community](https://www.w3.org/community/webassembly/) - For the WebAssembly standard
- [Contributors](https://github.com/twilson63/cu/contributors) - For making this project better

## 📈 Project Status

- ✅ **Phase 1**: Core function persistence implemented
- ✅ **Phase 2**: Batch operations and transactions complete
- ✅ **Phase 3**: Advanced querying with indexing delivered
- 🚧 **Phase 4**: Performance optimization in progress
- 📋 **Phase 5**: Enterprise features planned

**Current Version**: 2.0.0  
**Last Updated**: 2024  
**Next Release**: 2.1.0 (Q2 2024)

---

<p align="center">
  Made with ❤️ by the Lua WASM community
</p>