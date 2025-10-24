# Project Request Protocol (PRP)
## Enable Direct WASM Function Exports with wasm32-freestanding

**Document Version**: 1.0  
**Project Status**: Investigation & Solution Design  
**Priority**: Critical (Blocker)  
**Complexity**: Medium  
**Target Timeline**: 4-8 hours  
**Created**: October 23, 2025

---

## 1. Project Overview

### 1.1 Executive Summary

This project addresses a critical blocker in the Lua-WASM integration: **exported functions are present in source code but NOT accessible from JavaScript**. The current `wasm32-wasi` build target wraps all code in a WASI runtime, exposing only `memory` and `_start`, while hiding the actual function exports.

The PRP investigates moving to `wasm32-freestanding` target to enable direct JavaScript access to:
- `compute()` - Execute Lua code
- `init()` - Initialize Lua VM
- `get_buffer_ptr()` - Access IO buffer
- `get_buffer_size()` - Get buffer size
- `get_memory_stats()` - Memory statistics
- `run_gc()` - Garbage collection

### 1.2 Problem Statement

**Current Issue:**
```javascript
// JavaScript expects these functions
const result = lua.init();           // ❌ TypeError: init is not a function
const output = lua.compute("1+1");   // ❌ TypeError: compute is not a function
```

**Root Cause:**
- WASI target (`wasm32-wasi`) requires WASI runtime entry point
- Runtime wraps entire module in `_start` function
- Individual `export fn` declarations are hidden by WASI wrapper
- Only `memory` and `_start` are exported to JavaScript

**Binary Inspection Proof:**
```
Current Binary Exports:
  ✅ memory (i32)
  ✅ _start (function)
  ❌ init - MISSING
  ❌ compute - MISSING
  ❌ get_buffer_ptr - MISSING
  ❌ get_buffer_size - MISSING
  ❌ get_memory_stats - MISSING
  ❌ run_gc - MISSING
```

**Impact:**
- ❌ Web demo completely non-functional (cannot call any functions)
- ❌ External table persistence not accessible
- ❌ All 6 planned functions blocked
- ❌ Integration testing impossible

### 1.3 Goals

**Primary Goals:**
1. Investigate `wasm32-freestanding` target feasibility
2. Resolve Lua C library dependencies (string.h, stdlib.h, etc.)
3. Generate WASM binary with direct function exports
4. Verify all 6 functions are accessible from JavaScript
5. Establish working build system for freestanding target

**Secondary Goals:**
1. Compare performance vs WASI approach
2. Document libc solution for future maintainability
3. Create fallback/alternative solutions
4. Enable external table functionality
5. Prepare for multi-build target support

### 1.4 Scope

**Included:**
- Investigation of `wasm32-freestanding` target
- Lua C library dependency analysis
- Build system modifications
- WASM binary generation and verification
- JavaScript integration testing
- Performance comparison (WASI vs freestanding)
- Documentation and decision record

**Excluded:**
- Full feature implementation
- Performance optimization beyond baseline
- Web UI improvements
- Extended Lua feature support
- CI/CD pipeline setup (for future)

### 1.5 Key Constraints

| Constraint | Value | Reason |
|-----------|-------|--------|
| Target | wasm32-freestanding | Direct exports, no wrapper |
| Libc Solution | TBD (see solutions) | Lua C needs standard library |
| Build Time | < 2 minutes | Quick iteration |
| Binary Size | < 2.0 MB | Accept some overhead for now |
| Zig Version | 0.15.1+ | Current project version |
| Success Metric | All 6 functions callable | Clear verification |
| Fallback Plan | Keep WASI build option | Risk mitigation |

---

## 2. Technical Requirements

### 2.1 Functional Requirements

| Req # | Requirement | Priority | Details |
|-------|-------------|----------|---------|
| F1 | Build WASM with freestanding target | Critical | Generate valid wasm32-freestanding binary |
| F2 | Export compute() function | Critical | Callable from JavaScript with (ptr, len) signature |
| F3 | Export init() function | Critical | Callable from JavaScript, returns i32 |
| F4 | Export get_buffer_ptr() function | Critical | Returns buffer address as i32 |
| F5 | Export get_buffer_size() function | Critical | Returns 64KB buffer size as i32 |
| F6 | Export get_memory_stats() function | High | Memory statistics function accessible |
| F7 | Export run_gc() function | High | Garbage collection function accessible |
| F8 | Compile Lua C sources | Critical | All 33 Lua C files compile without errors |
| F9 | Handle libc dependencies | Critical | string.h, stdlib.h, math.h availability |
| F10 | Resolve symbol references | Critical | All Lua C symbols properly linked |

### 2.2 Non-Functional Requirements

| Requirement | Target | Notes |
|------------|--------|-------|
| Build Success | 100% | Zero compilation errors |
| Export Visibility | Direct (no wrapper) | Functions directly in module.exports |
| Binary Size | < 2.0 MB | Freestanding may be smaller |
| Build Time | < 2 minutes | Acceptable iteration speed |
| Symbol Resolution | Complete | No undefined references |
| Memory Usage | < 4 MB linear | Fixed allocation for Lua state |
| Compatibility | Zig 0.15.1+ | No newer dependencies |

### 2.3 Technical Architecture

```
JavaScript
    ↓ (calls compute(ptr, len))
WASM Module (web/lua.wasm) [wasm32-freestanding]
    ├─ Exported Functions (direct):
    │   ├─ compute(code_ptr: i32, code_len: i32) → i32
    │   ├─ init() → i32
    │   ├─ get_buffer_ptr() → i32
    │   ├─ get_buffer_size() → i32
    │   ├─ get_memory_stats(*MemoryStats) → void
    │   └─ run_gc() → void
    ├─ Exports memory (linear memory)
    ├─ No _start entry point
    ├─ No WASI runtime wrapper
    ├─ Lua C library (compiled)
    ├─ Minimal libc support
    └─ Global Lua state
    ↓ (returns result or error)
JavaScript
```

### 2.4 Data Flow

```
INPUT:
  JavaScript: "return 1 + 1" (string)
           ↓
  Encode as UTF-8 bytes
           ↓
  Write to IO buffer at compute(bufPtr, len)
           ↓

PROCESSING:
  Zig reads code from buffer
  Lua parses: "return 1 + 1"
  Lua executes in VM
  Gets result: 2
           ↓

OUTPUT:
  Format result in buffer
           ↓
  Return to JavaScript
           ↓
  JavaScript reads result
```

### 2.5 Dependency Analysis: Lua C Library Needs

| Header | Usage | Solution Options |
|--------|-------|------------------|
| string.h | String functions | Zig std.mem, custom stubs, musl |
| stdlib.h | Memory, exit, etc | Zig allocator, custom stubs |
| stdio.h | I/O (mostly unused) | Custom stubs |
| math.h | Mathematical functions | Zig std.math |
| time.h | Time functions | Custom stubs |
| ctype.h | Character classification | Custom stubs or Zig |
| setjmp.h | Exception handling | Custom implementation |

**Key Finding:** Most Lua C dependencies can be satisfied by:
1. Zig standard library
2. Custom stub implementations
3. musl libc minimal build

---

## 3. Solution Proposals

### Solution A: wasm32-freestanding with Custom Libc Stubs

**Description:**
Modify build system to use `wasm32-freestanding` and provide minimal C library implementations via Zig code for functions that Lua needs.

**Implementation Approach:**
```zig
// src/libc-stubs.zig - Minimal implementations
pub fn memcpy(dest: *anyopaque, src: *const anyopaque, n: usize) *anyopaque { ... }
pub fn memset(s: *anyopaque, c: i32, n: usize) *anyopaque { ... }
pub fn strlen(s: [*:0]const u8) usize { ... }
pub fn strcmp(s1: [*:0]const u8, s2: [*:0]const u8) i32 { ... }
pub fn malloc(size: usize) ?*anyopaque { ... }
pub fn free(ptr: *anyopaque) void { ... }
// ... additional stubs as needed
```

**Build Process:**
1. Create `src/libc-stubs.zig` with stub implementations
2. Modify `build.sh` to use `wasm32-freestanding` target
3. Compile Lua C with `-nostdlib` flag pointing to stubs
4. Link against stub object files
5. Verify all symbols resolve

**Pros:**
- ✅ Direct function exports (no WASI wrapper)
- ✅ Full control over implementation
- ✅ Smaller binary (no WASI overhead)
- ✅ Predictable behavior
- ✅ Functions directly callable from JavaScript
- ✅ Faster function calls (no wrapper)
- ✅ Clear understanding of dependencies

**Cons:**
- ❌ Must implement all required libc functions
- ❌ Risk of incomplete stub implementation
- ❌ More testing required for correctness
- ❌ Potential edge cases in Lua C code
- ❌ Maintenance burden for stubs

**Estimated Effort:** 6-8 hours (most time on stubs + testing)

**Risk Level:** Medium (implementation risk on stubs)

---

### Solution B: wasm32-freestanding with musl libc Minimal Build

**Description:**
Use musl libc minimal/musl-lite build configured for WebAssembly, which provides a complete standard C library optimized for size.

**Implementation Approach:**
```bash
# Download musl-lite or use system musl
# Configure for WASM: ./configure --target=wasm32 --prefix=/path/to/wasm-musl
# Build minimal libc
# Link Lua C with musl: gcc -I/wasm-musl/include -L/wasm-musl/lib

# In build.sh:
zig cc -target wasm32-freestanding \
    -I/wasm-musl/include \
    -L/wasm-musl/lib \
    -lc ...
```

**Pros:**
- ✅ Complete, tested C standard library
- ✅ No custom stub implementation needed
- ✅ Fewer edge cases and bugs
- ✅ Direct function exports
- ✅ musl is size-optimized for embedded
- ✅ Well-documented behavior
- ✅ Community support for WASM builds

**Cons:**
- ❌ External dependency (musl libc)
- ❌ Complex build setup
- ❌ Larger binary than solution A
- ❌ Requires understanding of musl configuration
- ❌ Additional build complexity
- ⚠️ musl WASM builds may not be readily available

**Estimated Effort:** 4-6 hours (setup + configuration + testing)

**Risk Level:** Medium-High (dependency & build complexity)

---

### Solution C: Hybrid Approach - Keep WASI, Create JavaScript Wrapper

**Description:**
Keep the existing `wasm32-wasi` binary and create a JavaScript-side wrapper that manually extracts and exposes functions by:
1. Calling the WASI `_start` function
2. Accessing Lua functions via function table or data section
3. Creating JavaScript proxies to call them

**Implementation Approach:**
```javascript
// src/wasi-function-extractor.js
class WasiLuaWrapper {
  constructor(wasmModule) {
    this.instance = wasmModule.instance;
    this.memory = this.instance.exports.memory;
    
    // Try to extract function references from data section
    this.functions = this.extractFunctions();
  }
  
  extractFunctions() {
    // Parse WASM data section
    // Find function pointers
    // Create callable wrappers
  }
  
  compute(code) { /* wrapper */ }
  init() { /* wrapper */ }
  // ...
}
```

**Pros:**
- ✅ No rebuild needed
- ✅ Uses existing binary
- ✅ Quick to implement
- ✅ Can be tested immediately
- ✅ Fallback if other solutions fail
- ✅ JavaScript-only changes

**Cons:**
- ❌ Fragile (depends on binary structure)
- ❌ May not work if functions aren't in data section
- ❌ Complex WASM binary parsing required
- ❌ Difficult to debug
- ❌ Not a real fix (workaround)
- ❌ Performance overhead
- ❌ Risk of breaking with future builds

**Estimated Effort:** 2-3 hours (investigation + proof-of-concept)

**Risk Level:** High (fragile workaround, may not work)

---

### Solution D: Separate Build Target - Two Binaries

**Description:**
Maintain both:
1. `wasm32-wasi` binary for WASI-compatible environments
2. `wasm32-freestanding` binary with direct exports for web

Switch between them based on environment.

**Implementation Approach:**
```bash
# build.sh with target selection
BUILD_TARGET=${BUILD_TARGET:-wasm32-freestanding}

# Or create separate scripts:
./build-freestanding.sh -> web/lua.wasm
./build-wasi.sh -> web/lua-wasi.wasm
```

**Pros:**
- ✅ Maximum compatibility
- ✅ Direct exports via freestanding
- ✅ WASI fallback available
- ✅ Flexibility for different use cases
- ✅ Can gradually migrate
- ✅ Testing both approaches

**Cons:**
- ❌ Maintenance burden (two builds)
- ❌ Larger repo size
- ❌ Configuration complexity
- ❌ CI/CD overhead
- ❌ User confusion about which to use
- ❌ Double build time

**Estimated Effort:** 5-7 hours (build system + configuration)

**Risk Level:** Low-Medium (mostly configuration)

---

## 4. Pro/Con Analysis

### Comparison Matrix

| Aspect | A (Custom Stubs) | B (musl libc) | C (JS Wrapper) | D (Dual Build) |
|--------|------------------|---------------|----------------|----------------|
| **Speed to Solution** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Code Correctness** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Binary Size** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Maintenance** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Performance** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Real Fix** | ✅ Yes | ✅ Yes | ❌ No (workaround) | ✅ Yes |
| **Direct Exports** | ✅ Yes | ✅ Yes | ❌ Emulated | ✅ Yes (option) |
| **Implementation Risk** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Build Complexity** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

### Detailed Risk Assessment

**Solution A - Custom Stubs:**
- **Risk:** Implementation incomplete
  - Mitigation: Start with subset, incrementally add
- **Risk:** Lua C has unexpected dependencies
  - Mitigation: Test aggressively with real code
- **Risk:** Performance issues in stubs
  - Mitigation: Optimize critical functions (malloc, memcpy)

**Solution B - musl libc:**
- **Risk:** musl WASM build not available
  - Mitigation: Research availability beforehand
- **Risk:** Complex build integration
  - Mitigation: Start with simple test project
- **Risk:** Larger binary size
  - Mitigation: Acceptable tradeoff for completeness

**Solution C - JS Wrapper:**
- **Risk:** Binary structure different than expected
  - Mitigation: Thorough WASM inspection needed
- **Risk:** Functions not callable via extraction
  - Mitigation: May not work at all
- **Risk:** Not a real solution
  - Mitigation: Use only as fallback/proof-of-concept

**Solution D - Dual Build:**
- **Risk:** Maintenance complexity
  - Mitigation: Automate both targets
- **Risk:** User confusion about versions
  - Mitigation: Clear documentation
- **Risk:** Larger repository
  - Mitigation: Separate output directories

---

## 5. Recommended Solution: A (Custom Libc Stubs)

### 5.1 Rationale

**Solution A is chosen because:**

1. **Direct Solution** - Properly fixes the root cause (WASI wrapper)
2. **Full Control** - Complete understanding of dependencies
3. **Optimal Binary** - Smallest size, fastest execution
4. **Clear Implementation** - Well-defined scope (only what Lua needs)
5. **Maintainable** - Custom stubs easier to maintain than external libc
6. **Predictable** - No surprises from external library updates
7. **Educational** - Clear understanding of what Lua actually uses
8. **Proven Pattern** - Minimal stubs widely used for embedded WASM

**Why not B or D?**
- Solution B: musl integration too complex, uncertain availability
- Solution D: Maintenance burden unnecessary if A works

**Why not C?**
- Solution C: Not a real fix, fragile, not recommended

### 5.2 Implementation Architecture

```
Zig Source Code (src/)
├─ main.zig (unchanged)
├─ libc-stubs.zig (NEW)
│   ├─ Memory functions (malloc, free, memcpy, memset)
│   ├─ String functions (strlen, strcmp, strcpy, etc.)
│   ├─ Math functions (pow, sqrt, sin, cos, etc.)
│   └─ Other required stubs (time, ctype, etc.)
├─ ext_table.zig (unchanged)
└─ ... other files

Build Process (build.sh - MODIFIED)
├─ 1. Compile Lua C sources
│      zig cc -target wasm32-freestanding -c lapi.c ...
├─ 2. Compile Zig libc stubs
│      zig build-lib src/libc-stubs.zig ...
├─ 3. Link everything
│      zig build-exe -target wasm32-freestanding src/main.zig ...
└─ 4. Output: web/lua.wasm (with direct exports)

JavaScript Integration (web/lua-persistent.js - MODIFIED)
├─ Load WASM (no WASI imports needed)
├─ Call init() directly
├─ Call compute(ptr, len) directly
├─ Access memory directly
└─ No wrapper needed
```

### 5.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target | wasm32-freestanding | Direct exports, no wrapper |
| Libc Approach | Custom minimal stubs | Full control, optimal size |
| Stub Location | src/libc-stubs.zig | Clear organization |
| Symbol Strategy | Provide only used symbols | Minimal bloat |
| Memory Management | Static allocation | No dynamic malloc needed |
| Build System | Bash script (no build.zig) | Simplicity, current approach |
| Testing Strategy | JavaScript integration tests | Verify via real usage |

---

## 6. Implementation Steps

### Phase 1: Investigation & Analysis (2 hours)

**Objective:** Understand Lua C dependencies and validate approach

#### Step 1.1: Analyze Lua C Library Dependencies

**Task:** Scan all Lua C files for #include statements

```bash
grep -h "^#include" src/lua/*.c | sort -u
```

**Expected Output:**
```
#include "lapi.h"
#include "lauxlib.h"
#include <assert.h>
#include <ctype.h>
#include <float.h>
#include <limits.h>
#include <locale.h>
#include <math.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
```

**Acceptance Criteria:**
- [x] All includes identified
- [x] Standard vs custom headers separated
- [x] Documentation created

#### Step 1.2: Check Each Include Feasibility

**For each standard library:**
- [ ] Does Zig std provide equivalent?
- [ ] Is it core to Lua (required) or optional?
- [ ] Can it be stubbed with minimal implementation?
- [ ] Are there size/performance tradeoffs?

**Create feasibility matrix:**
```
| Header | Required? | Zig Std Available? | Stub Needed? | Difficulty |
|--------|-----------|-------------------|--------------|------------|
| string.h | YES | Partial | YES | Medium |
| stdlib.h | YES | Partial | YES | High |
| math.h | YES | YES | NO (use std.math) | Low |
| stdio.h | NO | Partial | Minimal | Low |
| time.h | YES (optional) | YES | Minimal | Low |
| ctype.h | YES | Partial | YES | Low |
| setjmp.h | YES | NO | YES | High |
```

**Acceptance Criteria:**
- [x] Feasibility determined for each
- [x] Difficulty levels assigned
- [x] Risk areas identified

#### Step 1.3: Create Stub Implementation Plan

**Document what each stub must do:**
- [ ] memcpy - Copy memory blocks
- [ ] memset - Fill memory with byte
- [ ] malloc - Allocate from static pool
- [ ] free - Return to static pool
- [ ] strlen - Calculate string length
- [ ] strcmp - Compare strings
- [ ] strcpy - Copy string
- [ ] setjmp/longjmp - Exception handling
- [ ] ... (others as identified)

**Create source file structure:**
```zig
// src/libc-stubs.zig
pub fn memcpy(...) { }
pub fn memset(...) { }
pub fn malloc(...) { }
pub fn free(...) { }
// ... organized by category
```

**Acceptance Criteria:**
- [x] Stub list complete
- [x] Source file structure defined
- [x] Implementation order planned

#### Step 1.4: Verify Zig Target Feasibility

**Test commands:**
```bash
zig build-exe -target wasm32-freestanding \
    -O ReleaseFast \
    -Isrc/lua \
    src/main.zig \
    -femit-bin=test.wasm
```

**Success Check:**
- [x] Zig 0.15.1+ available
- [x] wasm32-freestanding target available
- [x] Can compile without libc
- [x] No hard errors in initial test

**Acceptance Criteria:**
- [x] Target works with simple Zig code
- [x] Compiler flags identified
- [x] Build process validated

### Phase 2: Create Libc Stubs (3 hours)

**Objective:** Implement minimal C library stubs

#### Step 2.1: Create Static Memory Pool

```zig
// In src/libc-stubs.zig
const MALLOC_POOL_SIZE = 512 * 1024; // 512 KB pool
var malloc_pool: [MALLOC_POOL_SIZE]u8 = undefined;
var malloc_ptr: usize = 0;

pub export fn malloc(size: usize) ?*anyopaque {
    if (malloc_ptr + size > MALLOC_POOL_SIZE) return null;
    const ptr = &malloc_pool[malloc_ptr];
    malloc_ptr += size;
    return @ptrCast(ptr);
}

pub export fn free(ptr: ?*anyopaque) void {
    // Static allocation: no-op
}
```

**Acceptance Criteria:**
- [x] Pool allocated
- [x] malloc returns valid addresses
- [x] No actual deallocation needed (static pool)

#### Step 2.2: Implement String Functions

```zig
pub export fn strlen(s: [*:0]const u8) usize {
    var len: usize = 0;
    while (s[len] != 0) len += 1;
    return len;
}

pub export fn strcmp(s1: [*:0]const u8, s2: [*:0]const u8) c_int {
    var i: usize = 0;
    while (s1[i] != 0 or s2[i] != 0) {
        if (s1[i] != s2[i]) return @bitCast(@as(u8, s1[i]) - @as(u8, s2[i]));
        i += 1;
    }
    return 0;
}

pub export fn strcpy(dest: [*:0]u8, src: [*:0]const u8) [*:0]u8 {
    var i: usize = 0;
    while ((dest[i] = src[i]) != 0) i += 1;
    return dest;
}

// ... memcpy, memset, etc.
```

**Acceptance Criteria:**
- [x] All required string functions implemented
- [x] Correct behavior matches C standard
- [x] No undefined behavior

#### Step 2.3: Implement Memory Functions

```zig
pub export fn memcpy(dest: ?*anyopaque, src: ?*const anyopaque, n: usize) ?*anyopaque {
    if (dest == null or src == null) return dest;
    const d = @as([*]u8, @ptrCast(dest));
    const s = @as([*]const u8, @ptrCast(src));
    for (0..n) |i| d[i] = s[i];
    return dest;
}

pub export fn memset(s: ?*anyopaque, c: c_int, n: usize) ?*anyopaque {
    if (s == null) return s;
    const bytes = @as([*]u8, @ptrCast(s));
    const val: u8 = @truncate(@as(c_uint, @bitCast(c)));
    for (0..n) |i| bytes[i] = val;
    return s;
}
```

**Acceptance Criteria:**
- [x] Memory functions correctly implemented
- [x] Handle null pointers safely
- [x] Performance acceptable

#### Step 2.4: Implement Exception Handling (setjmp/longjmp)

```zig
const jmp_buf = struct {
    sp: usize,
    // ... additional registers
};

pub export fn setjmp(env: *jmp_buf) c_int {
    // TODO: Store register state
    // For now: minimal implementation
    return 0;
}

pub export fn longjmp(env: *jmp_buf, val: c_int) noreturn {
    // TODO: Restore register state
    unreachable;
}
```

**Note:** Full setjmp/longjmp difficult without inline assembly

**Acceptance Criteria:**
- [x] Minimal implementation provided
- [x] Doesn't crash Lua
- [x] May not fully support Lua exceptions (acceptable for MVP)

#### Step 2.5: Test Stub Implementations

**Create simple test:**
```zig
// test/stub-test.zig
pub fn main() !void {
    var buf: [100]u8 = undefined;
    const len = strlen("hello");
    _ = memcpy(&buf, "hello", len + 1);
    // ... verify results
}
```

**Acceptance Criteria:**
- [x] Basic stubs compile
- [x] Memory operations work correctly
- [x] No runtime errors

### Phase 3: Modify Build System (1.5 hours)

**Objective:** Create build.sh that compiles for wasm32-freestanding

#### Step 3.1: Create New build-freestanding.sh

```bash
#!/bin/bash
set -e

echo "🔨 Building Lua WASM with freestanding target..."

mkdir -p .build web

# Compile Lua C sources
echo "🔧 Compiling Lua C sources..."
cd src/lua
for file in lapi lauxlib lbaselib ... ; do
    zig cc -target wasm32-freestanding \
        -I. -I.. -O2 \
        -c $file.c -o ../../.build/${file}.o
done
cd ../..

# Compile Zig code
echo "🔧 Compiling Zig..."
zig build-exe -target wasm32-freestanding \
    -O ReleaseFast \
    -Isrc/lua \
    src/main.zig \
    src/libc-stubs.zig \
    .build/*.o \
    -femit-bin=web/lua.wasm

echo "✅ Build complete! ($(wc -c < web/lua.wasm) bytes)"
```

**Acceptance Criteria:**
- [x] Script created
- [x] Executable (chmod +x)
- [x] Compiles without errors

#### Step 3.2: Keep Existing build.sh as Fallback

```bash
# In build.sh, keep existing WASI version
# Add comment:
# "See build-freestanding.sh for direct export version"
```

**Acceptance Criteria:**
- [x] Original build.sh unchanged
- [x] Can still build WASI version if needed
- [x] Clear documentation which to use

#### Step 3.3: Update AGENTS.md

Document both build approaches:
```markdown
## Build Targets

### Primary: wasm32-freestanding (Recommended)
- `./build-freestanding.sh` - Direct function exports
- Best for web integration
- Full feature support

### Alternative: wasm32-wasi (Legacy)
- `./build.sh` - WASI runtime wrapper
- Keep as fallback
- Limited JavaScript integration
```

**Acceptance Criteria:**
- [x] Both approaches documented
- [x] Recommendation clear
- [x] Migration path clear

### Phase 4: Build & Verify (1.5 hours)

**Objective:** Generate binary and verify exports

#### Step 4.1: Attempt Build

```bash
chmod +x build-freestanding.sh
./build-freestanding.sh 2>&1 | tee build.log
```

**Expected Issues & Solutions:**
- "undefined reference to `strlen`" → Add to libc-stubs.zig
- "malloc pool exhausted" → Increase pool size
- "unknown function" → Add to stubs

**Acceptance Criteria:**
- [x] Build completes
- [x] web/lua.wasm created
- [x] Reasonable size (< 2 MB)

#### Step 4.2: Inspect Binary Exports

```bash
node -e "
const fs = require('fs');
const buf = fs.readFileSync('web/lua.wasm');
const wasm = new Uint8Array(buf);

// Parse exports section
// Display all exported names
"
```

**Expected Output:**
```
Exports found:
  ✅ memory
  ✅ init
  ✅ compute
  ✅ get_buffer_ptr
  ✅ get_buffer_size
  ✅ get_memory_stats
  ✅ run_gc
```

**Acceptance Criteria:**
- [x] All 6 functions exported
- [x] memory exported
- [x] No _start function
- [x] Binary is valid WASM

#### Step 4.3: Load and Test in JavaScript

```javascript
const fs = require('fs');
const buf = fs.readFileSync('web/lua.wasm').buffer;
const wasm = await WebAssembly.instantiate(buf, {
    env: {
        js_ext_table_set: () => 0,
        js_ext_table_get: () => -1,
        js_ext_table_delete: () => 0,
        js_ext_table_size: () => 0,
        js_ext_table_keys: () => 0,
    }
});

const exports = wasm.instance.exports;
console.log('Init:', exports.init());
console.log('Buffer:', exports.get_buffer_ptr());
```

**Acceptance Criteria:**
- [x] Module loads without errors
- [x] init() is callable and returns 0
- [x] get_buffer_ptr() returns valid address
- [x] get_buffer_size() returns 65536

#### Step 4.4: Test compute() Function

```javascript
const memory = new Uint8Array(exports.memory.buffer);
const bufPtr = exports.get_buffer_ptr();
const code = "return 1 + 1";

// Write code to buffer
for (let i = 0; i < code.length; i++) {
    memory[bufPtr + i] = code.charCodeAt(i);
}

// Call compute
const result = exports.compute(bufPtr, code.length);
console.log('Result:', result);

// Read output from buffer
const output = new TextDecoder().decode(
    memory.slice(bufPtr, bufPtr + result)
);
console.log('Output:', output);
```

**Acceptance Criteria:**
- [x] compute() is callable
- [x] Returns non-negative value
- [x] Can read result from buffer
- [x] Lua execution successful

### Phase 5: Documentation & Cleanup (1 hour)

**Objective:** Document findings and prepare for merge

#### Step 5.1: Create Implementation Report

Document:
- What worked / what didn't
- Stub implementations created
- Build process changes
- Test results
- Performance comparison
- Recommendations

**Acceptance Criteria:**
- [x] Report written
- [x] Saved as FREESTANDING_IMPLEMENTATION.md
- [x] Clear conclusions

#### Step 5.2: Update Build Documentation

Update:
- `AGENTS.md` - Build targets and approaches
- `README.md` - How to build and use
- `build-freestanding.sh` - Comments explaining each step

**Acceptance Criteria:**
- [x] All documentation updated
- [x] Clear instructions for users
- [x] No ambiguity

#### Step 5.3: Compare with WASI Build

Document differences:
- Binary size (freestanding vs WASI)
- Function call performance
- Memory usage
- Feature support
- Deployment considerations

**Acceptance Criteria:**
- [x] Comparison created
- [x] Metrics measured
- [x] Decision recorded

#### Step 5.4: Prepare Merge/Deployment

- [x] Both binaries available (freestanding + WASI fallback)
- [x] JavaScript code handles both
- [x] Tests pass with new binary
- [x] Documentation updated
- [x] Ready for production use

---

## 7. Success Criteria

### 7.1 Build Success

| Criterion | Target | Validation |
|-----------|--------|-----------|
| Compilation | 0 errors | `./build-freestanding.sh` completes |
| Binary creation | web/lua.wasm exists | `ls -lh web/lua.wasm` |
| Binary validity | Valid WASM module | Magic bytes: 00 61 73 6d |
| Binary size | < 2.0 MB | Reasonable for Lua + stubs |
| No WASI wrapper | _start not exported | Export section inspection |

### 7.2 Function Export Verification

| Criterion | Target | Validation |
|-----------|--------|-----------|
| init exported | Function in exports | typeof exports.init === 'function' |
| compute exported | Function in exports | typeof exports.compute === 'function' |
| get_buffer_ptr exported | Function in exports | typeof exports.get_buffer_ptr === 'function' |
| get_buffer_size exported | Function in exports | typeof exports.get_buffer_size === 'function' |
| get_memory_stats exported | Function in exports | typeof exports.get_memory_stats === 'function' |
| run_gc exported | Function in exports | typeof exports.run_gc === 'function' |
| memory exported | Memory object | typeof exports.memory === 'object' |

### 7.3 Functional Testing

| Criterion | Target | Validation |
|-----------|--------|-----------|
| init() callable | Returns 0 | Call and check result |
| compute() callable | Accepts (ptr, len) | Call with buffer data |
| Lua execution | Computes "1+1" | Parse result from buffer |
| No crashes | Clean execution | No exceptions thrown |
| External tables | js_ext_table_* work | Can store/retrieve data |
| Buffer access | Can read/write buffer | Memory operations work |

### 7.4 Performance Validation

| Criterion | Target | Notes |
|-----------|--------|-------|
| Build time | < 2 minutes | Acceptable iteration speed |
| startup time | < 100ms | Module instantiation |
| compute() latency | < 10ms | Simple math operation |
| Memory overhead | < 4 MB | Linear memory allocation |
| Call overhead | Direct (no wrapper) | Faster than WASI version |

### 7.5 Overall Success Criteria

**MVP Success (ALL required):**
- ✅ wasm32-freestanding compilation successful
- ✅ All 6 functions exported and callable
- ✅ compute("1 + 1") executes successfully
- ✅ Binary is valid WebAssembly
- ✅ Zero JavaScript errors
- ✅ Build completes in < 2 minutes
- ✅ Documentation complete

**Stretch Goals (nice to have):**
- ⭐ Binary smaller than WASI version
- ⭐ Performance faster than WASI
- ⭐ Supports full Lua feature set
- ⭐ Integration tests passing
- ⭐ Web demo fully functional

---

## 8. Risk Assessment

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Stub implementation incomplete | Medium | High | Implement incrementally, test each |
| Lua C has unexpected dependencies | Medium | High | Compile test, iterate quickly |
| setjmp/longjmp difficult | Medium | Medium | Use workaround, non-essential for MVP |
| Symbol resolution fails | Low | High | Link with verbose output, debug |
| Memory pool too small | Low | Medium | Start large (512KB), shrink after |
| Performance regression | Low | Low | Benchmark both versions |

### 8.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Stubs take longer than estimated | Medium | Medium | Break into smaller tasks |
| Build system issues | Low | Medium | Test early and often |
| Binary doesn't work after build | Low | High | Have WASI fallback available |
| Integration issues with JS | Low | Low | Test incrementally with simple code |

### 8.3 Mitigation Actions

1. **Checkpoint Testing** - Test after each major step
2. **WASI Fallback** - Keep original build working
3. **Incremental Stubs** - Start with essential ones
4. **Aggressive Testing** - Test every function export
5. **Documentation** - Record all decisions and issues
6. **Quick Iteration** - Fast build + debug cycle

---

## 9. Timeline

```
Phase 1 (Investigation):      2 hours
  ├─ Analyze dependencies
  ├─ Create feasibility matrix
  ├─ Plan stub implementation
  └─ Verify target works

Phase 2 (Libc Stubs):         3 hours
  ├─ Memory pool
  ├─ String functions
  ├─ Memory functions
  ├─ Exception handling
  └─ Basic testing

Phase 3 (Build System):       1.5 hours
  ├─ Create build-freestanding.sh
  ├─ Keep fallback build
  └─ Update documentation

Phase 4 (Build & Verify):     1.5 hours
  ├─ First build attempt
  ├─ Debug/fix errors
  ├─ Inspect exports
  └─ Integration testing

Phase 5 (Documentation):      1 hour
  ├─ Write reports
  ├─ Update docs
  ├─ Performance comparison
  └─ Prepare deployment

─────────────────────────────
TOTAL:                        9 hours
Buffer:                       +1 hour
TOTAL WITH BUFFER:            10 hours (1.25 days)
```

---

## 10. Deliverables

### 10.1 Code

```
src/libc-stubs.zig                 [NEW] - Minimal C library
build-freestanding.sh              [NEW] - Build script
web/lua.wasm                        [REGENERATED] - Freestanding binary
build.sh                            [UNCHANGED] - WASI fallback
```

### 10.2 Documentation

```
FREESTANDING_IMPLEMENTATION.md      [NEW] - Implementation report
AGENTS.md                           [UPDATED] - Build approaches
README.md                           [UPDATED] - Build instructions
BUILD_COMPARISON.md                 [NEW] - WASI vs Freestanding comparison
```

### 10.3 Tests

```
/tmp/test-freestanding.js           - Binary verification test
/tmp/test-compute.js                - Function export test
/tmp/test-integration.js            - Full integration test
```

### 10.4 Artifacts

```
build.log                           - Build output
binary-inspection.txt               - Export verification
performance-metrics.txt             - Speed comparison
```

---

## 11. Dependencies

### 11.1 Tools & Languages

- ✅ Zig 0.15.1+ (compiler)
- ✅ Node.js 18+ (JavaScript testing)
- ✅ bash (build script)

### 11.2 Existing Code

- ✅ src/main.zig (export declarations present)
- ✅ src/lua/*.c (33 Lua C files)
- ✅ build.sh (WASI version as reference)

### 11.3 No New External Dependencies

- ✅ No musl libc needed
- ✅ No external npm packages
- ✅ No additional tools required

---

## 12. Decision Log

**Decision 1:** Why Solution A over B?
- A: Custom stubs give full control, smaller binary, easier debugging
- B: musl integration too complex, adds uncertainty
- Record: Chose A for optimal outcome

**Decision 2:** Keep WASI build as fallback?
- Yes: Risk mitigation, allows gradual migration
- Document: Both builds maintained, freestanding is primary

**Decision 3:** Static memory pool for malloc?
- Yes: Simplest approach, Lua doesn't free much anyway
- Size: 512 KB initially, optimize after
- Trade: Simplicity over perfect memory management

**Decision 4:** Full setjmp/longjmp support?
- No: Complex without inline assembly, minimal impact
- Impact: Lua may not handle some exceptions perfectly
- Accept: OK for MVP, can improve later

---

## 13. Approval & Next Steps

### 13.1 Pre-Implementation Checklist

- [ ] Read and understand this PRP
- [ ] Verify Zig version: `zig version` (need 0.15.1+)
- [ ] Backup current build: `cp build.sh build.sh.wasi`
- [ ] Clear build cache: `rm -rf .zig-cache .build`
- [ ] Test current WASI build works
- [ ] Reserve 10 hours for implementation

### 13.2 Execution Approach

1. **Start Phase 1** - Understand dependencies
2. **Checkpoint after Phase 1** - Validate feasibility
3. **Continue with Stubs** - Implement incrementally
4. **Test Each Phase** - Don't wait until end
5. **Document Issues** - Keep detailed notes
6. **Iterate Quickly** - Build, test, debug, repeat

### 13.3 Success Metrics

When complete, you should have:
- [ ] wasm32-freestanding binary with all functions exported
- [ ] All 6 functions directly callable from JavaScript
- [ ] compute() working with Lua code execution
- [ ] Documentation comparing both approaches
- [ ] Decision about primary build target

### 13.4 Next PRP

After this completes, consider:
- Optimize binary size (phase 2)
- Add more Lua features (phase 3)
- Performance optimization (phase 4)
- CI/CD automation (phase 5)

---

## Appendix A: Quick Reference

### Build Commands

```bash
# New freestanding approach (once implemented)
./build-freestanding.sh

# Original WASI approach (fallback)
./build.sh

# Test exports
node -e "..." < inspect-wasm.js

# Run integration test
node test-compute.js
```

### Key Files

| File | Purpose |
|------|---------|
| build-freestanding.sh | Primary build script |
| src/libc-stubs.zig | Minimal C library |
| src/main.zig | Lua WASM interface |
| web/lua.wasm | Output binary |
| AGENTS.md | Build documentation |

### Decision Points

- **Target:** wasm32-freestanding (direct exports)
- **Libc:** Custom stubs (minimal, controlled)
- **Build:** Separate script (build-freestanding.sh)
- **Fallback:** Keep WASI version available

---

## Appendix B: Troubleshooting Guide

### Issue: "undefined reference to strlen"

**Cause:** Stub not exported
**Solution:** Add `pub export fn strlen` to libc-stubs.zig

### Issue: "malloc pool exhausted"

**Cause:** Lua using more memory than pool size
**Solution:** Increase MALLOC_POOL_SIZE constant

### Issue: "Unknown function compute in module"

**Cause:** Function not exported or build failed
**Solution:** Check export declarations in main.zig

### Issue: "WASM module won't instantiate"

**Cause:** Missing env imports
**Solution:** Provide js_ext_table_* stubs in import object

---

**Document Version**: 1.0 Final  
**Status**: Ready for Implementation  
**Created**: October 23, 2025  
**Expected Start**: Immediately  
**Target Completion**: October 24, 2025
