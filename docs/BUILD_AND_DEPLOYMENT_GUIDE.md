# Build and Deployment Guide

**Document**: How to Build, Deploy, and Use Cu WASM  
**Date**: October 23, 2025  
**Audience**: Developers, DevOps, System Administrators

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Building from Source](#building-from-source)
4. [Understanding the Build](#understanding-the-build)
5. [JavaScript Integration](#javascript-integration)
6. [Production Deployment](#production-deployment)
7. [Testing & Validation](#testing--validation)
8. [Troubleshooting](#troubleshooting)
9. [Performance Tuning](#performance-tuning)

---

## Quick Start

### For the Impatient

```bash
# 1. Check prerequisites
zig version      # Should be 0.15.1+
node --version   # Should be 18+

# 2. Build
./build.sh

# 3. Test in browser
cd web
python3 -m http.server 8000
# Open http://localhost:8000
```

### Build Output

```
✅ Build complete!
   Output: web/cu.wasm
   Size: 1,313 KB
```

---

## Prerequisites

### Required

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Zig** | 0.15.1+ | WASM compiler | https://ziglang.org/download |
| **Node.js** | 18+ | WebAssembly testing | https://nodejs.org |
| **Python** | 3.8+ | Web server (optional) | Built-in most systems |

### Optional (For Phase 6+)

| Tool | Purpose | Install |
|------|---------|---------|
| **wasm-opt** | Binary optimization | `npm install -g binaryen` |
| **wabt** | WASM tooling | https://github.com/WebAssembly/wabt |
| **llvm-tools** | Advanced optimization | Via Zig or system package |

### Verification

```bash
# Check Zig
$ zig version
0.15.1

# Check Node.js
$ node --version
v18.17.0

# Check Python
$ python3 --version
Python 3.11.0
```

---

## Building from Source

### Full Build Process

```bash
# Clone repository (if needed)
git clone <repo-url>
cd cu

# Run build script
./build.sh

# Expected output
🔨 Building Lua Persistent Wasm with Zig...
🔧 Compiling Lua C sources...
  lapi.c               ✓
  lauxlib.c            ✓
  ... (31 more files)
🔧 Compiling Zig main...
✅ Build complete!
   Output: web/cu.wasm
   Size: 1,313 KB
```

### Build Time

```
Clean Build:           ~6-8 seconds
Incremental Build:     ~2-3 seconds (if only main.zig changed)
Cache Clean:           rm -rf .zig-cache
Full Rebuild:          rm -rf .zig-cache .build && ./build.sh
```

### Build Directories

```
Project Root/
├── .zig-cache/        # Zig compiler cache
├── .build/            # Object files (.o)
│   ├── lapi.o
│   ├── lvm.o
│   └── ... (31 more)
└── web/
    ├── cu.wasm       # Final WASM binary
    └── ... (JS files)
```

### Clean Build

```bash
# Full clean
./build.sh --clean

# Or manual
rm -rf .zig-cache .build web/cu.wasm
./build.sh
```

---

## Understanding the Build

### Build Phases

The `build.sh` script executes in 5 phases:

#### Phase 0: Verification
```bash
✓ Check Zig installation
✓ Verify Zig version (0.15.1+)
✓ Set optimization level
```

#### Phase 1: Setup
```bash
✓ Create .build/ directory for object files
✓ Create web/ directory for output
✓ Log build status
```

#### Phase 2: Source Verification
```bash
✓ Verify all 33 Lua C files present
✓ Verify all 8 Zig files present
✓ Check header files exist
```

#### Phase 3: Lua C Compilation
```bash
for each .c file in src/lua/:
  zig cc -target wasm32-wasi -c -O2 file.c -o .build/file.o
```

**Output**: 33 object files in `.build/`

#### Phase 4: Zig Compilation & Linking
```bash
zig build-exe -target wasm32-wasi -O ReleaseFast \
    -I src/lua -lc \
    -D_WASI_EMULATED_SIGNAL \
    src/main.zig \
    .build/*.o \
    -lwasi-emulated-signal \
    -femit-bin=web/cu.wasm
```

**Output**: `web/cu.wasm` (1.3 MB)

#### Phase 5: Verification
```bash
✓ Check binary created
✓ Verify WASM magic bytes
✓ Report size and completion
```

### Build Flags Explained

| Flag | Purpose | Value |
|------|---------|-------|
| `-target wasm32-wasi` | Compilation target | WebAssembly with WASI |
| `-O ReleaseFast` | Optimization level | Balance size/speed |
| `-I src/lua` | Include path | Lua headers |
| `-lc` | Link C library | WASI libc |
| `-D_WASI_EMULATED_*` | Define symbols | Signal/clock support |
| `-lwasi-emulated-*` | Link libraries | WASI emulation |
| `-femit-bin=...` | Output path | Location of .wasm |

### Customization

#### Change Output Directory
```bash
# Edit build.sh
-femit-bin=/custom/path/cu.wasm
```

#### Change Optimization Level
```bash
# Options: Debug, ReleaseSafe, ReleaseFast, ReleaseSmall
-O ReleaseSmall   # Smallest binary (~1.1 MB)
-O Debug          # Fastest builds, larger binary
```

#### Change Target
```bash
# Currently: wasm32-wasi
# Alternative: wasm32-freestanding (see NEXT_PHASE_ROADMAP.md)
-target wasm32-freestanding
```

---

## JavaScript Integration

### Loading the Module

#### Browser Environment

```javascript
// 1. Fetch WASM binary
const response = await fetch('cu.wasm');
const buffer = await response.arrayBuffer();

// 2. Create import object
const imports = {
  env: {
    js_ext_table_set: function(table_id, key_ptr, key_len, val_ptr, val_len) {
      // Implement: store value in JS Map
      console.log('js_ext_table_set called');
      return 0; // success
    },
    js_ext_table_get: function(table_id, key_ptr, key_len, val_ptr, max_len) {
      // Implement: retrieve value from JS Map
      console.log('js_ext_table_get called');
      return 0;
    },
    js_ext_table_delete: function(table_id, key_ptr, key_len) {
      console.log('js_ext_table_delete called');
      return 0;
    },
    js_ext_table_size: function(table_id) {
      console.log('js_ext_table_size called');
      return 0;
    },
    js_ext_table_keys: function(table_id, buf_ptr, max_len) {
      console.log('js_ext_table_keys called');
      return 0;
    }
  }
};

// 3. Instantiate module
const module = await WebAssembly.instantiate(buffer, imports);
```

#### Node.js Environment

```javascript
const fs = require('fs');
const buffer = fs.readFileSync('cu.wasm');

// Import object same as browser
const imports = { env: { ... } };

const module = new WebAssembly.Module(buffer);
const instance = new WebAssembly.Instance(module, imports);
```

### Using Exported Functions

#### After instantiation:
```javascript
const instance = module.instance;
const exports = instance.exports;

// Note: Phase 6 will enable these calls
// Currently requires post-processing fix

// Initialize Lua
const init_result = exports.init();
console.log('init() returned:', init_result);  // 0 = success

// Get buffer info
const buf_ptr = exports.get_buffer_ptr();
const buf_size = exports.get_buffer_size();
console.log(`Buffer: ${buf_ptr} - ${buf_size} bytes`);

// Execute Lua code
const code = "print('Hello from Lua!')";
const code_bytes = new TextEncoder().encode(code);

// Copy code to WASM memory
const memory = new Uint8Array(exports.memory.buffer);
memory.set(code_bytes, buf_ptr);

// Execute
const result = exports.compute(buf_ptr, code_bytes.length);
console.log('compute() returned:', result);

// Read output
const output = new TextDecoder().decode(
  memory.slice(buf_ptr, buf_ptr + buf_size)
);
console.log('Output:', output);
```

### Complete Example

```javascript
class LuaWasm {
  constructor() {
    this.instance = null;
    this.buffer = null;
  }

  async init(wasmPath) {
    const response = await fetch(wasmPath);
    const wasmBuffer = await response.arrayBuffer();
    
    const imports = {
      env: this.createImports()
    };
    
    const module = await WebAssembly.instantiate(wasmBuffer, imports);
    this.instance = module.instance;
    this.buffer = new Uint8Array(this.instance.exports.memory.buffer);
    
    // Initialize Lua
    const result = this.instance.exports.init();
    if (result !== 0) {
      throw new Error('Failed to initialize Lua');
    }
  }

  createImports() {
    const tables = new Map(); // Store JavaScript data
    
    return {
      js_ext_table_set: (table_id, key_ptr, key_len, val_ptr, val_len) => {
        const key = this.readString(key_ptr, key_len);
        const val = this.readString(val_ptr, val_len);
        
        if (!tables.has(table_id)) tables.set(table_id, new Map());
        tables.get(table_id).set(key, val);
        
        return 0;
      },
      
      js_ext_table_get: (table_id, key_ptr, key_len, val_ptr, max_len) => {
        const key = this.readString(key_ptr, key_len);
        const table = tables.get(table_id);
        
        if (!table || !table.has(key)) return -1;
        
        const val = table.get(key);
        this.writeString(val_ptr, val);
        
        return 0;
      },
      
      js_ext_table_delete: (table_id, key_ptr, key_len) => {
        const key = this.readString(key_ptr, key_len);
        const table = tables.get(table_id);
        
        if (table) table.delete(key);
        return 0;
      },
      
      js_ext_table_size: (table_id) => {
        const table = tables.get(table_id);
        return table ? table.size : 0;
      },
      
      js_ext_table_keys: (table_id, buf_ptr, max_len) => {
        const table = tables.get(table_id);
        if (!table) return 0;
        
        const keys = Array.from(table.keys()).join(',');
        this.writeString(buf_ptr, keys);
        
        return keys.length;
      }
    };
  }

  readString(ptr, len) {
    return new TextDecoder().decode(
      this.buffer.slice(ptr, ptr + len)
    );
  }

  writeString(ptr, str) {
    const bytes = new TextEncoder().encode(str);
    this.buffer.set(bytes, ptr);
  }

  execute(code) {
    const buf_ptr = this.instance.exports.get_buffer_ptr();
    const buf_size = this.instance.exports.get_buffer_size();
    
    this.writeString(buf_ptr, code);
    
    const result = this.instance.exports.compute(buf_ptr, code.length);
    
    const output = this.readString(buf_ptr, buf_size);
    
    return { result, output };
  }
}

// Usage
const lua = new LuaWasm();
await lua.init('cu.wasm');

const { result, output } = lua.execute("print('Hello, World!')");
console.log('Result:', result);
console.log('Output:', output);
```

---

## Production Deployment

### Binary Preparation

#### 1. Optimize Binary (Phase 7)
```bash
# Install tools
npm install -g binaryen

# Optimize for size
wasm-opt -O4 web/cu.wasm -o web/lua-opt.wasm

# Expected savings: 50-100 KB
```

#### 2. Compression
```bash
# Gzip compression
gzip -k web/lua-opt.wasm
# Creates: lua-opt.wasm.gz

# File sizes
-rw-r--r--  1.3M lua-opt.wasm
-rw-r--r--  400K lua-opt.wasm.gz (70% compression)
```

#### 3. Deployment Checklist
- [ ] Binary optimized (wasm-opt)
- [ ] Binary compressed (gzip)
- [ ] Hashes computed for verification
- [ ] CDN configuration ready
- [ ] Cache headers configured
- [ ] Security headers verified
- [ ] CORS headers set correctly

### Server Configuration

#### MIME Type
```
Add to .htaccess or web server config:
AddType application/wasm .wasm
AddEncoding gzip .wasm
```

#### Nginx Configuration
```nginx
location ~* \.wasm$ {
  # Enable gzip
  gzip on;
  gzip_types application/wasm;
  
  # Cache headers
  cache_control max-age=31536000, immutable;
  
  # CORS
  add_header 'Access-Control-Allow-Origin' '*';
  add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS';
  
  # Security
  add_header 'X-Content-Type-Options' 'nosniff';
}
```

#### Apache Configuration
```apache
<FilesMatch "\.wasm$">
  Header set Content-Type "application/wasm"
  Header set Content-Encoding "gzip"
  Header set Cache-Control "max-age=31536000, immutable"
  Header set Access-Control-Allow-Origin "*"
  Header set X-Content-Type-Options "nosniff"
</FilesMatch>
```

### Docker Deployment

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install Zig
RUN apk add --no-cache zig

# Copy source
COPY . .

# Build
RUN ./build.sh

# Expose web directory
EXPOSE 3000

# Serve
CMD ["npx", "http-server", "web", "-p", "3000"]
```

#### Build & Deploy
```bash
# Build image
docker build -t lua-wasm:latest .

# Run container
docker run -p 3000:8000 lua-wasm:latest

# Push to registry
docker tag lua-wasm:latest myregistry.azurecr.io/lua-wasm:latest
docker push myregistry.azurecr.io/lua-wasm:latest
```

### CDN Deployment

#### Upload to CDN
```bash
# Example: AWS S3 + CloudFront
aws s3 cp web/lua-opt.wasm.gz s3://my-bucket/cu.wasm \
  --metadata-directive COPY \
  --cache-control "max-age=31536000" \
  --content-encoding gzip \
  --content-type application/wasm

# Example: Cloudflare
wrangler publish  # Using Wrangler CLI
```

---

## Testing & Validation

### Build Validation

```bash
# 1. Check binary format
file web/cu.wasm
# Expected: WebAssembly (wasm) binary module

# 2. Verify magic bytes
od -x web/cu.wasm | head -1
# Expected: 0061 736d 0100 0000

# 3. Check size
ls -lh web/cu.wasm
# Expected: ~1.3M

# 4. Validate with wabt
wasm-objdump -h web/cu.wasm
```

### JavaScript Testing

```bash
# 1. Load in Node.js
node -e "
  const fs = require('fs');
  const buffer = fs.readFileSync('web/cu.wasm');
  const mod = new WebAssembly.Module(buffer);
  console.log('✓ Module loaded');
  
  const inst = new WebAssembly.Instance(mod, { env: {...} });
  console.log('✓ Instance created');
  console.log('✓ Exports:', Object.keys(inst.exports));
"

# 2. Test in browser
cd web && python3 -m http.server 8000
# Open http://localhost:8000
# Check browser console
```

### Functional Testing

```javascript
// test.js
const fs = require('fs');

async function test() {
  const buffer = fs.readFileSync('web/cu.wasm');
  const imports = { env: { /* ... */ } };
  
  const module = await WebAssembly.instantiate(buffer, imports);
  const instance = module.instance;
  
  // Test 1: init()
  const init_result = instance.exports.init();
  console.assert(init_result === 0, 'init() failed');
  console.log('✓ init() passed');
  
  // Test 2: get_buffer_ptr()
  const ptr = instance.exports.get_buffer_ptr();
  console.assert(ptr > 0, 'get_buffer_ptr() returned invalid');
  console.log('✓ get_buffer_ptr() passed');
  
  // Test 3: get_buffer_size()
  const size = instance.exports.get_buffer_size();
  console.assert(size === 65536, 'get_buffer_size() incorrect');
  console.log('✓ get_buffer_size() passed');
  
  console.log('✅ All tests passed');
}

test().catch(console.error);
```

---

## Troubleshooting

### Build Issues

#### "Zig not found"
```bash
# Solution: Install Zig
# https://ziglang.org/download

# Or add to PATH
export PATH="/path/to/zig-0.15.1:$PATH"
```

#### "Source file not found: lapi.c"
```bash
# Solution: Verify file location
ls -la src/lua/lapi.c

# Or re-clone repository
git clone <repo-url>
cd cu
./build.sh
```

#### "WASI is not found"
```bash
# Solution: Update Zig
zig version
# Upgrade if < 0.15.1

zig update
./build.sh
```

### Runtime Issues

#### "Module instantiation failed"
```javascript
// Problem: Missing import functions
// Solution: Provide all 5 js_ext_table_* functions

const imports = {
  env: {
    js_ext_table_set: function(...) { ... },
    js_ext_table_get: function(...) { ... },
    js_ext_table_delete: function(...) { ... },
    js_ext_table_size: function(...) { ... },
    js_ext_table_keys: function(...) { ... }
  }
};
```

#### "init() returns -1"
```javascript
// Problem: Lua state creation failed
// Possible causes:
// - Memory allocation error
// - Memory exhausted
// - Lua library loading failed

// Solution: Check memory availability
const stats = instance.exports.get_memory_stats();
console.log('Memory available:', stats);
```

#### "compute() returns -1"
```javascript
// Problem: Invalid parameters or uninitialized state
// Solutions:
// 1. Call init() first
// 2. Verify code_ptr and code_len
// 3. Check buffer size

const buf_ptr = instance.exports.get_buffer_ptr();
const buf_size = instance.exports.get_buffer_size();
console.log(`Buffer: ${buf_ptr}, size: ${buf_size}`);
```

### Performance Issues

#### Slow Module Loading
```javascript
// Problem: Module takes > 200 ms to load
// Solutions:
// 1. Compress WASM (gzip): 70% size reduction
// 2. Use CDN to reduce latency
// 3. Cache compiled module

// Cache example:
if ('caches' in window) {
  const cacheName = 'lua-wasm-cache-v1';
  const cache = await caches.open(cacheName);
  const cached = await cache.match('cu.wasm');
  
  if (cached) {
    return cached.arrayBuffer();
  }
}
```

#### Slow Lua Execution
```javascript
// Problem: Lua scripts run slowly
// Solutions:
// 1. Optimize script (profile with built-in functions)
// 2. Reduce script complexity
// 3. Use compiled chunks if available

// Profiling:
console.time('lua_execution');
instance.exports.compute(ptr, len);
console.timeEnd('lua_execution');
```

---

## Performance Tuning

### Binary Optimization

```bash
# 1. Strip debug information
wasm-strip web/cu.wasm
# Expected: 100 KB savings

# 2. Run optimizer
wasm-opt -O4 web/cu.wasm -o web/lua-opt.wasm
# Expected: 50-100 KB savings

# 3. Compress
gzip web/lua-opt.wasm
# Expected: 70% compression
```

### Runtime Optimization

```javascript
// 1. Cache module
let wasmModule = null;

async function getModule() {
  if (!wasmModule) {
    const response = await fetch('cu.wasm');
    const buffer = await response.arrayBuffer();
    wasmModule = await WebAssembly.instantiate(buffer, imports);
  }
  return wasmModule;
}

// 2. Reuse instance
const instance = (await getModule()).instance;

// 3. Batch operations
const results = [];
for (const code of scripts) {
  results.push(executeCode(code));
}
```

### Deployment Optimization

```bash
# 1. Enable HTTP/2 push
Link: </cu.wasm>; rel=preload; as=fetch

# 2. Enable service worker caching
// In service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('lua-wasm-v1').then(cache => {
      return cache.addAll(['/cu.wasm']);
    })
  );
});

# 3. Use resource hints
<link rel="preconnect" href="https://cdn.example.com">
<link rel="prefetch" href="https://cdn.example.com/cu.wasm">
```

---

## FAQ

### Q: Can I use this in production?
**A**: After Phase 6 (export fix) completes, yes. Phase 7 optimization recommended first.

### Q: How large is the binary?
**A**: 1.3 MB (uncompressed), 400 KB (gzipped). Phase 7 targets < 1.0 MB.

### Q: Can I modify the Lua source?
**A**: Yes, edit `src/lua/*.c` and rebuild with `./build.sh`.

### Q: Can I add C modules?
**A**: Yes, add `.c` files to `src/lua/`, update `build.sh`, rebuild.

### Q: Is it compatible with wasm32-freestanding?
**A**: Yes, see `NEXT_PHASE_ROADMAP.md` for Phase 6 option.

### Q: How do I debug issues?
**A**: Check `TECHNICAL_REFERENCE.md` for debugging tips.

---

**Document Status**: Complete  
**Last Updated**: October 23, 2025
