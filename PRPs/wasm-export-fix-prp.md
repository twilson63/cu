# Project Request Protocol: WASM Export Function Fix

**Project Name**: wasm-export-fix  
**Date**: October 23, 2025  
**Priority**: HIGH (Blocker for MVP)  
**Estimated Effort**: 2-3 hours  
**Risk Level**: LOW  

---

## 1. Project Overview

### Background
The Lua Persistent WebAssembly project has successfully compiled Lua 5.4 into a WebAssembly binary using Zig. All 6 core functions (`init`, `compute`, `get_buffer_ptr`, `get_buffer_size`, `get_memory_stats`, `run_gc`) are implemented and compiled into the WASM code section. However, these functions are not visible in the WASM export table, preventing JavaScript from calling them directly.

### Problem Statement
- Functions marked with `export fn` in Zig are not appearing in the WASM export table
- JavaScript cannot access the compiled functions
- Web demo is completely blocked until exports are accessible
- Current build uses `wasm32-wasi` target which may be contributing to the issue

### Project Goal
Make all 6 exported functions directly callable from JavaScript without using Emscripten or rewriting the codebase.

---

## 2. Technical Requirements

### Functional Requirements
1. All 6 functions must be visible in `WebAssembly.Instance.exports`
2. Functions must be callable from JavaScript without errors
3. Function signatures must match the original definitions
4. No changes to existing Zig source code (if possible)
5. Build process must remain automated and reproducible

### Non-Functional Requirements
1. Solution must not increase binary size by more than 5%
2. Build time should not exceed 10 seconds
3. No runtime performance degradation
4. Solution must work across all modern browsers
5. Must maintain compatibility with Node.js 16+

### Constraints
- **MUST NOT** use Emscripten
- **MUST NOT** require rewriting existing code
- **SHOULD** use existing toolchain where possible
- **SHOULD** be scriptable for CI/CD integration

---

## 3. Proposed Solutions

### Solution A: WASM Binary Post-Processing with wasm-opt

**Description**: Use Binaryen's wasm-opt tool to process the compiled WASM binary and force export visibility.

**Implementation**:
```bash
# Install wasm-opt
npm install -g binaryen

# Process WASM file
wasm-opt web/lua.wasm \
  --legalize-js-interface \
  --export=init \
  --export=compute \
  --export=get_buffer_ptr \
  --export=get_buffer_size \
  --export=get_memory_stats \
  --export=run_gc \
  -O0 \
  -o web/lua-exports.wasm
```

**Pros**:
- ✅ Single command solution
- ✅ Well-maintained tool from WebAssembly team
- ✅ Preserves original binary structure
- ✅ Can be easily integrated into build.sh
- ✅ Also provides optimization capabilities

**Cons**:
- ❌ Requires external dependency (binaryen)
- ❌ May not work if functions are completely stripped
- ❌ Limited control over export details

### Solution B: WABT Tools Text Format Manipulation

**Description**: Convert WASM to WebAssembly Text (WAT) format, manually add export directives, then convert back to WASM.

**Implementation**:
```bash
# Install WABT tools
brew install wabt  # or apt-get install wabt

# Convert to text format
wasm2wat web/lua.wasm > web/lua.wat

# Add exports manually or via script
sed -i '' '/(func $init/a\
  (export "init" (func $init))' web/lua.wat

# Convert back to binary
wat2wasm web/lua.wat -o web/lua-exports.wasm
```

**Pros**:
- ✅ Complete control over exports
- ✅ Can inspect and verify function presence
- ✅ Educational - shows WASM structure
- ✅ Can fix other issues if found

**Cons**:
- ❌ More complex implementation
- ❌ Requires parsing/editing text files
- ❌ Fragile - depends on text format
- ❌ Slower than binary manipulation

### Solution C: Custom WASM Section Injection

**Description**: Write a custom tool to directly inject an export section into the WASM binary format.

**Implementation**:
```javascript
// Node.js script to inject exports
const fs = require('fs');
const wasmBuffer = fs.readFileSync('web/lua.wasm');

// Parse WASM sections
const sections = parseWasmSections(wasmBuffer);

// Create export section
const exportSection = createExportSection([
  { name: 'init', kind: 'func', index: findFuncIndex('init') },
  { name: 'compute', kind: 'func', index: findFuncIndex('compute') },
  // ... other exports
]);

// Inject and write
const newWasm = injectSection(wasmBuffer, exportSection);
fs.writeFileSync('web/lua-exports.wasm', newWasm);
```

**Pros**:
- ✅ No external dependencies
- ✅ Fast execution
- ✅ Full control over binary structure
- ✅ Can be customized for specific needs

**Cons**:
- ❌ Requires deep WASM format knowledge
- ❌ High implementation complexity
- ❌ Error-prone binary manipulation
- ❌ Maintenance burden

### Solution D: Zig Build System Migration

**Description**: Migrate from shell script to Zig's build system for better control over exports.

**Implementation**:
```zig
// build.zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{
        .default_target = .{
            .cpu_arch = .wasm32,
            .os_tag = .freestanding,
        },
    });

    const exe = b.addExecutable(.{
        .name = "lua",
        .root_source_file = .{ .path = "src/main.zig" },
        .target = target,
    });

    // Force export symbols
    exe.export_symbol_names = &.{
        "init", "compute", "get_buffer_ptr",
        "get_buffer_size", "get_memory_stats", "run_gc"
    };
}
```

**Pros**:
- ✅ Native Zig solution
- ✅ Better long-term maintainability
- ✅ More control over compilation
- ✅ Can switch to wasm32-freestanding

**Cons**:
- ❌ Requires significant refactoring
- ❌ Learning curve for build.zig
- ❌ May still face same export issues
- ❌ More time investment (4-5 hours)

---

## 4. Solution Comparison Matrix

| Criteria | Solution A (wasm-opt) | Solution B (WAT) | Solution C (Custom) | Solution D (build.zig) |
|----------|----------------------|------------------|---------------------|------------------------|
| Implementation Time | 30 mins | 1-2 hours | 3-4 hours | 4-5 hours |
| Complexity | Low | Medium | High | Medium |
| Maintainability | High | Medium | Low | High |
| External Dependencies | 1 (binaryen) | 1 (wabt) | 0 | 0 |
| Success Probability | 85% | 95% | 70% | 60% |
| Learning Curve | Low | Medium | High | Medium |
| Flexibility | Medium | High | Very High | High |
| Future-proof | High | Medium | Low | Very High |

---

## 5. Recommended Solution

**Selected Solution: Solution A (wasm-opt Post-Processing)**

### Rationale for Selection

1. **Fastest Implementation**: Can be implemented and tested within 30 minutes
2. **Proven Technology**: wasm-opt is the official tool used by many projects
3. **Low Risk**: Non-invasive approach that doesn't modify source code
4. **Easy Integration**: Single line addition to build.sh
5. **Additional Benefits**: Can also optimize the binary in the same pass
6. **Fallback Options**: If it fails, Solution B is a natural next step

### Why Not Others?

- **Solution B**: More complex for minimal additional benefit
- **Solution C**: Too much effort for a one-time fix
- **Solution D**: Better as a future enhancement, not urgent fix

---

## 6. Implementation Steps

### Phase 1: Setup and Installation (15 minutes)

1. **Install Binaryen**
   ```bash
   # macOS
   brew install binaryen
   
   # Linux
   sudo apt-get install binaryen
   
   # Or via npm (cross-platform)
   npm install -g binaryen
   ```

2. **Verify Installation**
   ```bash
   wasm-opt --version
   # Expected: version 117 or higher
   ```

3. **Create Backup**
   ```bash
   cp web/lua.wasm web/lua-backup.wasm
   ```

### Phase 2: Initial Testing (20 minutes)

1. **Test Basic Export**
   ```bash
   # Try automatic export detection
   wasm-opt web/lua.wasm --print | grep -A5 "export"
   
   # Force exports
   wasm-opt web/lua.wasm \
     --export=init \
     --export=compute \
     -O0 \
     -o web/lua-test.wasm
   ```

2. **Verify Exports**
   ```javascript
   // test-exports.js
   const fs = require('fs');
   const wasmBuffer = fs.readFileSync('web/lua-test.wasm');
   const wasmModule = new WebAssembly.Module(wasmBuffer);
   const exports = WebAssembly.Module.exports(wasmModule);
   console.log('Exports found:', exports.map(e => e.name));
   ```

### Phase 3: Full Implementation (30 minutes)

1. **Create Post-Processing Script**
   ```bash
   # post-process-wasm.sh
   #!/bin/bash
   set -e
   
   echo "🔧 Post-processing WASM exports..."
   
   wasm-opt web/lua.wasm \
     --legalize-js-interface \
     --export=init \
     --export=compute \
     --export=get_buffer_ptr \
     --export=get_buffer_size \
     --export=get_memory_stats \
     --export=run_gc \
     -O2 \
     -o web/lua-exports.wasm
   
   # Verify exports
   echo "✅ Verifying exports..."
   node verify-exports.js
   
   # Replace original if successful
   if [ $? -eq 0 ]; then
     mv web/lua-exports.wasm web/lua.wasm
     echo "✅ Export fix complete!"
   else
     echo "❌ Export verification failed!"
     exit 1
   fi
   ```

2. **Update build.sh**
   ```bash
   # Add at the end of build.sh
   echo "🔧 Fixing WASM exports..."
   ./post-process-wasm.sh
   ```

3. **Create Verification Script**
   ```javascript
   // verify-exports.js
   const fs = require('fs');
   const path = require('path');
   
   const wasmPath = path.join(__dirname, 'web/lua-exports.wasm');
   const wasmBuffer = fs.readFileSync(wasmPath);
   const wasmModule = new WebAssembly.Module(wasmBuffer);
   const exports = WebAssembly.Module.exports(wasmModule);
   
   const requiredExports = [
     'memory', 'init', 'compute', 
     'get_buffer_ptr', 'get_buffer_size',
     'get_memory_stats', 'run_gc'
   ];
   
   const exportNames = exports.map(e => e.name);
   const missing = requiredExports.filter(name => !exportNames.includes(name));
   
   if (missing.length > 0) {
     console.error('❌ Missing exports:', missing);
     process.exit(1);
   }
   
   console.log('✅ All required exports found:', exportNames);
   process.exit(0);
   ```

### Phase 4: Testing and Validation (30 minutes)

1. **Run Full Build**
   ```bash
   ./build.sh
   # Should complete without errors
   ```

2. **Test in Node.js**
   ```javascript
   // test-integration.js
   const fs = require('fs');
   
   async function test() {
     const wasmBuffer = fs.readFileSync('web/lua.wasm');
     const imports = {
       env: {
         js_ext_table_set: () => 0,
         js_ext_table_get: () => 0,
         js_ext_table_delete: () => 0,
         js_ext_table_size: () => 0,
         js_ext_table_keys: () => 0,
       }
     };
     
     const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
     
     console.log('Exports:', Object.keys(instance.exports));
     
     // Test init
     const initResult = instance.exports.init();
     console.log('init() returned:', initResult);
     
     // Test buffer functions
     const bufferPtr = instance.exports.get_buffer_ptr();
     const bufferSize = instance.exports.get_buffer_size();
     console.log('Buffer:', { ptr: bufferPtr, size: bufferSize });
   }
   
   test().catch(console.error);
   ```

3. **Test in Browser**
   ```html
   <!-- test.html -->
   <!DOCTYPE html>
   <html>
   <head>
     <title>WASM Export Test</title>
   </head>
   <body>
     <script>
       async function test() {
         const response = await fetch('lua.wasm');
         const wasmBuffer = await response.arrayBuffer();
         
         const imports = {
           env: {
             js_ext_table_set: () => 0,
             js_ext_table_get: () => 0,
             js_ext_table_delete: () => 0,
             js_ext_table_size: () => 0,
             js_ext_table_keys: () => 0,
           }
         };
         
         const { instance } = await WebAssembly.instantiate(wasmBuffer, imports);
         console.log('Exports:', Object.keys(instance.exports));
         
         // Initialize Lua
         const result = instance.exports.init();
         console.log('Lua initialized:', result === 0 ? 'Success' : 'Failed');
       }
       
       test();
     </script>
   </body>
   </html>
   ```

### Phase 5: Documentation and Cleanup (15 minutes)

1. **Update README**
   ```markdown
   ## Build Process
   
   The build now includes a post-processing step to ensure WASM exports are visible:
   
   1. Compile Lua C files with Zig
   2. Link into WASM binary
   3. Post-process with wasm-opt to fix exports
   4. Verify all functions are exported
   ```

2. **Add to .gitignore**
   ```
   web/lua-backup.wasm
   web/lua-exports.wasm
   web/lua-test.wasm
   ```

3. **Commit Changes**
   ```bash
   git add post-process-wasm.sh verify-exports.js
   git commit -m "fix: Add WASM export post-processing to make functions callable from JS"
   ```

---

## 7. Success Criteria

### Must Have (Critical)
- ✅ All 6 functions visible in `WebAssembly.Instance.exports`
- ✅ `init()` returns 0 when called
- ✅ `get_buffer_ptr()` returns valid pointer
- ✅ `get_buffer_size()` returns 65536 (64KB)
- ✅ No JavaScript errors when calling functions
- ✅ Build process completes in under 10 seconds

### Should Have (Important)
- ✅ Binary size increase < 5%
- ✅ Works in Chrome, Firefox, Safari, and Node.js
- ✅ Automated verification in build process
- ✅ Clear error messages if post-processing fails

### Nice to Have (Optional)
- ✅ Performance metrics before/after
- ✅ Integration test suite
- ✅ CI/CD pipeline integration

---

## 8. Risk Mitigation

### Risk: wasm-opt fails to find functions
**Mitigation**: 
- Try different wasm-opt flags (--export-all, --pass-arg=export-all)
- Fallback to Solution B (WAT manipulation)
- Already have working POC in documentation

### Risk: Exports work but functions crash
**Mitigation**:
- Verify function indices match
- Check calling conventions
- Test with minimal imports first

### Risk: Binary size increases significantly
**Mitigation**:
- Use -Os flag instead of -O2
- Strip unnecessary exports
- Measure and optimize post-export

---

## 9. Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| Install tools and setup | 15 min | None |
| Initial testing | 20 min | Tools installed |
| Implementation | 30 min | Testing complete |
| Full testing | 30 min | Implementation done |
| Documentation | 15 min | All tests passing |
| **Total** | **1 hour 50 min** | |
| Buffer time | 1 hour 10 min | |
| **Worst case** | **3 hours** | |

---

## 10. Next Steps

1. **Immediate**: Implement Solution A as described
2. **If Solution A fails**: Pivot to Solution B within 30 minutes
3. **After success**: Proceed to Phase 7 (Performance Optimization)
4. **Long-term**: Consider Solution D for better maintainability

---

## Appendix: Alternative Commands

### If standard wasm-opt fails:

```bash
# Option 1: Force all functions
wasm-opt web/lua.wasm --export-all -o web/lua-exports.wasm

# Option 2: Use wasm-metadce
wasm-metadce web/lua.wasm --export-all -o web/lua-exports.wasm

# Option 3: Use wasm-ctor-eval
wasm-ctor-eval web/lua.wasm --export=init --export=compute -o web/lua-exports.wasm
```

### Quick verification one-liner:

```bash
node -e "const m=new WebAssembly.Module(require('fs').readFileSync('web/lua.wasm'));console.log(WebAssembly.Module.exports(m).map(e=>e.name))"
```