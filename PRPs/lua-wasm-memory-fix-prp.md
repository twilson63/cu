# Project Request Protocol (PRP): Lua WASM Memory Management Fix

**Project Name**: lua-wasm-memory-fix  
**Date**: October 23, 2025  
**Priority**: Critical (Blocks MVP functionality)  
**Estimated Effort**: 2-4 hours

---

## 1. Project Overview

### Background
The Lua WASM project has successfully compiled all 33 Lua C files and generated a 1.19 MB WebAssembly binary. However, the module fails during runtime initialization due to conflicting memory management implementations between internal allocators and external imports.

### Problem Statement
When `luaL_newstate()` attempts to allocate memory (864 bytes) during Lua VM initialization, it calls an imported `realloc(0, 864)` function that returns 0 (allocation failure), causing the entire initialization to fail. This occurs because:

1. The WASM module contains internal malloc/free/realloc implementations in `libc-stubs.zig`
2. But it's also importing realloc and free from the JavaScript environment
3. The JavaScript-provided stubs return failure codes, preventing Lua from initializing

### Business Impact
- **Critical**: Lua VM cannot initialize, making the entire WebAssembly module non-functional
- **User Impact**: Web demo and all Lua execution capabilities are completely broken
- **Timeline Impact**: Blocks Phase 7-8 development until resolved

### Success Criteria
- ✅ Lua VM initializes successfully (`init()` returns 0)
- ✅ Memory allocation works correctly for all Lua operations
- ✅ No conflicting imports/exports for memory functions
- ✅ All existing tests pass
- ✅ Web demo executes Lua code successfully

---

## 2. Technical Requirements

### Current State Analysis

#### Memory Allocator Implementations
```zig
// src/libc-stubs.zig - Internal implementation
export fn malloc(size: usize) ?*anyopaque {
    if (size == 0) return null;
    if (malloc_ptr + size > MALLOC_POOL_SIZE) return null;
    const ptr = &malloc_pool[malloc_ptr];
    malloc_ptr += size;
    return @ptrCast(ptr);
}

export fn realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque {
    if (size == 0) {
        free(ptr);
        return null;
    }
    const new_ptr = malloc(size);
    if (new_ptr == null) return null;
    if (ptr != null) {
        @memcpy(@as([*]u8, @ptrCast(new_ptr))[0..size], @as([*]u8, @ptrCast(ptr))[0..size]);
    }
    return new_ptr;
}

export fn free(ptr: ?*anyopaque) void {
    _ = ptr; // No-op implementation
}
```

#### JavaScript Import Stubs
```javascript
// web/lua-api.js - External imports
const imports = {
  env: {
    // These are being called instead of internal implementations
    realloc: (ptr, size) => 0,  // Always returns NULL
    free: (ptr) => {},
  }
};
```

### Root Cause
The build system is generating conflicting memory management:
1. Zig exports malloc/realloc/free as WASM exports
2. But Lua C code expects to import them from the environment
3. The linker resolves this by using imports, which return failure

### Requirements
1. **Consistent Memory Management**: Either all internal OR all external allocators
2. **Proper Symbol Resolution**: No conflicting imports/exports
3. **Maintain Compatibility**: Lua C code must work without modification
4. **Preserve Performance**: Minimal overhead in memory operations
5. **Build System Integration**: Solution must work with existing build.sh

---

## 3. Proposed Solutions

### Solution A: Pure Internal Allocators (Remove All Imports)

**Description**: Configure the build to use only internal allocators, preventing any memory function imports.

**Implementation**:
1. Modify build flags to prevent import generation
2. Force all symbols to resolve to internal implementations
3. Update linker settings to avoid external symbol resolution

**Code Changes**:
```bash
# build.sh modification
zig build-exe -target wasm32-freestanding \
    -O ReleaseFast \
    --export-all \  # Export all symbols
    -Wl,--allow-undefined-globals=false \  # No undefined symbols
    -Wl,--export-dynamic \  # Force exports
    src/main.zig .build/*.o \
    -femit-bin=web/lua.wasm
```

**Pros**:
- ✅ Complete control over memory management
- ✅ No external dependencies
- ✅ Predictable behavior
- ✅ Works with existing allocator implementation

**Cons**:
- ❌ May require complex linker flags
- ❌ Could increase binary size
- ❌ Might need build system expertise

---

### Solution B: Pure External Allocators (Remove Internal Implementation)

**Description**: Remove all internal allocator implementations and rely entirely on JavaScript-provided memory management.

**Implementation**:
1. Delete malloc/realloc/free from libc-stubs.zig
2. Implement proper allocators in JavaScript
3. Pass them via imports during instantiation

**Code Changes**:
```javascript
// web/lua-api.js
let heapPtr = 0;
const HEAP_SIZE = 2 * 1024 * 1024;

const imports = {
  env: {
    malloc: (size) => {
      if (heapPtr + size > HEAP_SIZE) return 0;
      const ptr = heapPtr;
      heapPtr += size;
      return ptr;
    },
    realloc: (ptr, size) => {
      const newPtr = imports.env.malloc(size);
      if (newPtr && ptr) {
        // Copy old data
        const memory = new Uint8Array(wasmInstance.exports.memory.buffer);
        memory.copyWithin(newPtr, ptr, ptr + size);
      }
      return newPtr;
    },
    free: (ptr) => {
      // No-op for simple allocator
    }
  }
};
```

**Pros**:
- ✅ JavaScript has full control
- ✅ Can implement sophisticated allocators
- ✅ Easier debugging from JavaScript
- ✅ No Zig code changes needed

**Cons**:
- ❌ Performance overhead (JS↔WASM calls)
- ❌ Complex JavaScript implementation
- ❌ Breaks self-contained module principle

---

### Solution C: Symbol Renaming (Recommended)

**Description**: Rename internal allocators to avoid conflicts, then configure Lua to use them.

**Implementation**:
1. Rename internal functions to lua_malloc/lua_realloc/lua_free
2. Configure Lua's allocator through lua_newstate
3. Remove import declarations
4. Update build to prevent import generation

**Code Changes**:
```zig
// src/libc-stubs.zig
export fn lua_malloc(size: usize) ?*anyopaque {
    // ... existing implementation
}

export fn lua_realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque {
    // ... existing implementation
}

export fn lua_free(ptr: ?*anyopaque) void {
    // ... existing implementation
}

// Keep standard names but don't export
fn malloc(size: usize) callconv(.C) ?*anyopaque {
    return lua_malloc(size);
}

fn realloc(ptr: ?*anyopaque, size: usize) callconv(.C) ?*anyopaque {
    return lua_realloc(ptr, size);
}

fn free(ptr: ?*anyopaque) callconv(.C) void {
    lua_free(ptr);
}
```

```zig
// src/main.zig
export fn init() i32 {
    // Use lua_newstate with custom allocator instead of luaL_newstate
    const L = lua.lua_newstate(lua_alloc, null);
    if (L == null) {
        return -1;
    }
    // ... rest of init
}

fn lua_alloc(ud: ?*anyopaque, ptr: ?*anyopaque, osize: usize, nsize: usize) callconv(.C) ?*anyopaque {
    _ = ud;
    _ = osize;
    
    if (nsize == 0) {
        lua_free(ptr);
        return null;
    }
    
    return lua_realloc(ptr, nsize);
}
```

**Pros**:
- ✅ Clean separation of concerns
- ✅ Lua uses custom allocator properly
- ✅ No import/export conflicts
- ✅ Maintains self-contained module
- ✅ Best performance (no JS calls)

**Cons**:
- ❌ Requires understanding Lua's allocator API
- ❌ More code changes needed

---

## 4. Recommended Solution

**Selected**: Solution C - Symbol Renaming

**Rationale**:
1. **Performance**: Keeps memory operations in WASM (fastest)
2. **Compatibility**: Works with Lua's design patterns
3. **Maintainability**: Clear separation between internal/external symbols
4. **Reliability**: No JavaScript dependency for core operations
5. **Debugging**: Easier to trace memory issues

---

## 5. Implementation Steps

### Phase 1: Update Memory Allocators (1 hour)
1. [ ] Rename export functions in libc-stubs.zig
2. [ ] Add non-exported wrapper functions
3. [ ] Test compilation with new symbols
4. [ ] Verify no import generation in WASM

### Phase 2: Configure Lua Allocator (1 hour)
1. [ ] Implement lua_alloc function in main.zig
2. [ ] Update init() to use lua_newstate
3. [ ] Pass custom allocator to Lua
4. [ ] Add error handling for allocation failures

### Phase 3: Update Build System (30 minutes)
1. [ ] Add flags to prevent import generation
2. [ ] Ensure proper symbol visibility
3. [ ] Test incremental builds
4. [ ] Document build changes

### Phase 4: Testing & Validation (1 hour)
1. [ ] Verify init() returns 0
2. [ ] Test basic Lua code execution
3. [ ] Check memory allocation under load
4. [ ] Run full test suite
5. [ ] Validate web demo functionality

### Phase 5: Documentation (30 minutes)
1. [ ] Update technical documentation
2. [ ] Add memory management notes to AGENTS.md
3. [ ] Document the fix in implementation report
4. [ ] Create troubleshooting guide

---

## 6. Success Metrics

### Technical Metrics
| Metric | Target | Method |
|--------|--------|--------|
| Init Success | 100% | `init()` returns 0 |
| Memory Allocation | 100% | No allocation failures |
| Test Suite | 100% pass | All 8 tests pass |
| Performance | <5ms init | Measure init time |
| Binary Size | <1.5 MB | Check file size |

### Functional Metrics
| Feature | Validation |
|---------|------------|
| Lua VM Start | Creates state successfully |
| Code Execution | `return 1+1` returns "2" |
| Memory Stats | Shows correct usage |
| Print Output | Captures correctly |
| Error Handling | Reports errors properly |

---

## 7. Risk Assessment

### Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Build breaks | Low | High | Test each step incrementally |
| Performance regression | Low | Medium | Benchmark before/after |
| New conflicts | Medium | High | Use unique symbol names |
| Lua compatibility | Low | High | Test standard libraries |

### Implementation Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Time overrun | Low | Low | Solution is well-defined |
| Hidden dependencies | Medium | Medium | Check all C files for malloc |
| Test failures | Low | Medium | Fix incrementally |

---

## 8. Timeline

**Total Estimated**: 3-4 hours

```
Hour 1: Memory allocator updates
Hour 2: Lua configuration and build
Hour 3: Testing and validation  
Hour 4: Documentation and cleanup
```

**Critical Path**:
1. Fix allocators → Test compilation → Update Lua init → Validate

---

## 9. Deliverables

### Code Deliverables
1. ✅ Updated libc-stubs.zig with renamed symbols
2. ✅ Modified main.zig with custom allocator
3. ✅ Updated build.sh with proper flags
4. ✅ Working web/lua.wasm binary

### Documentation Deliverables
1. ✅ Updated AGENTS.md with memory fix
2. ✅ Phase 6.1 implementation report
3. ✅ Memory management guide
4. ✅ Updated test results

### Test Deliverables
1. ✅ All automated tests passing
2. ✅ Web demo functional
3. ✅ Memory leak tests
4. ✅ Performance benchmarks

---

## 10. Next Steps

### Immediate Actions (Do First)
1. Create backup of current working directory
2. Branch the code for safe experimentation
3. Implement Solution C step by step
4. Test after each change

### Post-Implementation
1. Run full regression test suite
2. Update all documentation
3. Create memory management guide
4. Plan Phase 7 optimizations

---

**Document Status**: Ready for Implementation  
**Approval**: Pending  
**Start Date**: Upon Approval  
**Target Completion**: 4 hours from start