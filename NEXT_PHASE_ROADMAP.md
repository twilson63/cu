# Next Phase Roadmap: Phase 6-8

**Document**: Development Roadmap for Completing Lua WASM Implementation  
**Date**: October 23, 2025  
**Status**: Complete Planning Document  
**Timeline**: Phase 6-8 (6-10 weeks)

---

## Overview

This document outlines the path forward after Phase 5 completion, including specific steps, timeline estimates, and success criteria for each remaining phase.

---

## Phase 6: Export Function Fix (2-3 hours)

**Objective**: Make all 6 functions directly callable from JavaScript  
**Status**: Ready to implement  
**Blocker Status**: This unblocks entire web demo

### Current Situation

```
✅ Functions compiled into WASM code section
✅ Source code has export fn declarations
✅ Binary is valid and loads
❌ Functions not visible in export table
❌ JavaScript cannot call them
```

### Solution Implementation

**Chosen Approach**: WASM Post-Processing (Recommended)

```bash
# Step 1: Use wasm-opt to force exports
wasm-opt -O0 web/lua.wasm -o web/lua-opt.wasm

# Step 2: If wasm-opt insufficient, use WABT tools
wasm-dump web/lua.wasm > web/lua.wast
# (manually edit export section)
wasm-as web/lua.wast -o web/lua-fixed.wasm

# Step 3: Verify exports
wasm-dump web/lua-fixed.wasm | grep -A5 "export"
```

### Alternative Approaches

**Option A: JavaScript Wrapper** (Fallback)
```javascript
class LuaModule {
  constructor(wasmBuffer, imports) {
    this.module = new WebAssembly.Module(wasmBuffer);
    this.instance = new WebAssembly.Instance(
      this.module, 
      { env: imports }
    );
    this.setupExports();
  }
  
  setupExports() {
    // Extract function references from internals
    // Requires advanced WASM manipulation
    // Less ideal than post-processing
  }
}
```

**Option B: Zig Build System** (Complex)
```zig
// Create build.zig with explicit export configuration
// Requires understanding Zig's build API
// Estimated effort: 4-5 hours
```

### Implementation Checklist

- [ ] Install tools (wasm-opt, wabt, binaryen)
- [ ] Create build-post-process.sh script
- [ ] Test wasm-opt approach
- [ ] Implement fallback if needed
- [ ] Update build.sh to include post-processing
- [ ] Verify all 6 exports visible
- [ ] Test JavaScript integration
- [ ] Update documentation
- [ ] Commit changes

### Testing & Validation

```bash
# Test 1: Verify exports present
node inspect-exports.js web/lua.wasm
# Expected output: ✅ All 6 functions present

# Test 2: Load in browser
cd web && python3 -m http.server 8000
# Test in console: wasmModule.instance.exports.init()

# Test 3: Full integration test
npm test  # If test suite available
```

### Success Criteria

✅ All 6 functions appear in export table  
✅ JavaScript can call each function  
✅ No errors when calling functions  
✅ Web demo loads and initializes Lua  
✅ Simple Lua code can be executed  
✅ Output captured correctly  

### Risk Assessment

**Risk Level**: 🟢 LOW
- Proven approach
- No source code changes
- Can be undone easily
- External tools are stable

### Timeline Estimate

```
Setup & Tools:        30 min
Implementation:       45 min
Testing:             30 min
Documentation:       15 min
Total:               2 hours (worst case: 3 hours)
```

---

## Phase 7: Performance Optimization (3-4 hours)

**Objective**: Reduce binary size and improve startup performance  
**Prerequisites**: Phase 6 complete  
**Status**: Ready after Phase 6

### 7.1: Binary Size Reduction

**Target**: Reduce from 1.28 MB to < 1.0 MB

#### Task 1: Strip Debug Information
```bash
# Remove unnecessary debug sections
wasm-opt web/lua.wasm --strip-debug -o web/lua-stripped.wasm

# Expected savings: ~100-150 KB
```

**Effort**: 30 min  
**Risk**: 🟡 MEDIUM (may lose debugging capability)  
**Benefit**: High (20% size reduction)

#### Task 2: Optimize with wasm-opt
```bash
# Apply multiple optimization passes
wasm-opt -O4 web/lua-stripped.wasm -o web/lua-final.wasm

# Expected savings: ~50-100 KB
```

**Effort**: 45 min  
**Risk**: 🟢 LOW (non-breaking)  
**Benefit**: High (additional 8-12% reduction)

#### Task 3: Minimize Lua Modules
```zig
// In src/lua.zig, disable unused modules
// Only include: base, string, table, math, io
// Remove: coroutine, package, debug (if unused)

// Estimated savings: ~50-100 KB
```

**Effort**: 1 hour  
**Risk**: 🟡 MEDIUM (may break scripts)  
**Benefit**: Medium (additional 5-8% reduction)

#### Task 4: Code Optimization Passes
```bash
# Apply dead code elimination
wasm-opt --enable-all --optimize web/lua.wasm -o web/lua-optimized.wasm
```

**Effort**: 30 min  
**Risk**: 🟢 LOW  
**Benefit**: Low (2-3% additional)

**Cumulative Savings**:
```
Starting:                1,313 KB
After debug strip:       1,150 KB (12% saved)
After wasm-opt:          1,050 KB (20% saved)
After module removal:      950 KB (28% saved)
Target:                    950 KB ✅
```

### 7.2: Startup Performance

**Target**: Reduce startup time by 20%

#### Task 1: Profile Module Loading
```javascript
// Measure current performance
const start = performance.now();
const module = await WebAssembly.instantiate(buffer);
const end = performance.now();
console.log(`Load time: ${end - start}ms`);
// Expected: 100-150 ms
```

**Effort**: 30 min  
**Benefit**: Establishes baseline

#### Task 2: Lazy Initialization
```zig
// Move expensive initialization to first call
// Instead of in init()
// Example: Don't load all Lua libs until needed
```

**Effort**: 1.5 hours  
**Risk**: 🟡 MEDIUM (behavior change)  
**Benefit**: 5-10% startup improvement

#### Task 3: Memory Pre-allocation
```zig
// Pre-allocate Lua state in init()
// Reduce first compute() call overhead
```

**Effort**: 45 min  
**Risk**: 🟢 LOW  
**Benefit**: 2-5% improvement

### 7.3: Memory Optimization

**Target**: Minimal WASM overhead

#### Task 1: Memory Layout Analysis
```bash
# Analyze current memory usage
./analyze_memory.sh
# Report: heap usage, peak memory, fragmentation
```

**Effort**: 1 hour  
**Benefit**: Understanding only

#### Task 2: Allocator Optimization
```zig
// Analyze malloc/free patterns
// Implement memory pooling if beneficial
// Currently: simple bump allocator is sufficient
```

**Effort**: 1-2 hours  
**Risk**: 🟡 MEDIUM (allocator changes)  
**Benefit**: Medium (5-10% faster allocation)

### Phase 7 Checklist

- [ ] Profile baseline performance
- [ ] Strip debug info
- [ ] Run wasm-opt
- [ ] Minimize Lua modules
- [ ] Profile optimized version
- [ ] Benchmark against baseline
- [ ] Document changes
- [ ] Update build.sh
- [ ] Validate functionality

### Phase 7 Success Criteria

✅ Binary < 1.0 MB  
✅ Module load time < 120 ms  
✅ startup time reduced by ≥ 20%  
✅ No functional changes  
✅ All tests pass  

### Phase 7 Timeline

```
Task 1 (Debug strip):     30 min
Task 2 (wasm-opt):        45 min
Task 3 (Module removal):  1 hour
Task 4 (Profile):         45 min
Total:                    3 hours
```

---

## Phase 8: Feature Implementation (5-7 hours)

**Objective**: Add advanced features for production readiness  
**Prerequisites**: Phase 6-7 complete  
**Status**: Ready after Phase 7

### 8.1: External Table Persistence

**Objective**: Save and restore Lua table data

#### Task 1: Persistence Format Design
```lua
-- Define serialization format
-- Example: JSON-based for simplicity
{
  tables: {
    "table1": { "key1": "value1", "key2": 42 },
    "table2": { ... }
  },
  timestamp: 1234567890
}
```

**Effort**: 1 hour  
**Deliverable**: Format specification

#### Task 2: Serialization Implementation
```zig
// In src/serializer.zig, add:
pub fn serialize_table(table_id: u32) [*]u8 {
  // Convert JavaScript Map to binary format
  // Handle all Lua types (nil, bool, int, float, string, table)
}
```

**Effort**: 2 hours  
**Complexity**: Medium

#### Task 3: Deserialization Implementation
```zig
pub fn deserialize_table(data: [*]u8, len: usize) i32 {
  // Restore table from binary format
  // Return table_id on success
}
```

**Effort**: 2 hours  
**Complexity**: Medium

#### Task 4: Storage Integration
```javascript
// Add localStorage support
function saveState(tableId) {
  const data = wasmModule.serialize(tableId);
  localStorage.setItem('lua_state', data);
}

function restoreState() {
  const data = localStorage.getItem('lua_state');
  return wasmModule.deserialize(data);
}
```

**Effort**: 1 hour  
**Complexity**: Low

#### Task 5: Testing
```bash
# Test persistence workflow
./test-persistence.sh
# Verify: save → load → compare → success
```

**Effort**: 1 hour  
**Complexity**: Low

**8.1 Total Effort**: 6-7 hours  
**Risk**: 🟡 MEDIUM (new feature)  
**Value**: High (core feature)

### 8.2: Error Handling Improvements

**Objective**: Better error messages and debugging

#### Task 1: Stack Trace Capture
```zig
// Implement lua_traceback in error.zig
pub fn capture_stack_trace(L: *lua.lua_State) [*]u8 {
  // Return formatted stack trace
}
```

**Effort**: 1.5 hours  
**Complexity**: Medium

#### Task 2: Line Number Tracking
```zig
// Track source location in Lua code
// Improve error messages with context
```

**Effort**: 1 hour  
**Complexity**: Medium

#### Task 3: Source Map Support
```bash
# Generate source maps for debugging
# Allow mapping WASM code back to Lua source
```

**Effort**: 2 hours  
**Complexity**: High (optional)

**8.2 Total Effort**: 3-4 hours  
**Risk**: 🟢 LOW (non-breaking)  
**Value**: Medium (better debugging)

### 8.3: Advanced Lua Features

**Objective**: Enable more Lua capabilities

#### Task 1: Metatables (Partial)
```zig
// Support basic metatable operations
// May require additional C bindings
// Estimated effort: 2 hours
```

**Effort**: 2 hours  
**Complexity**: Medium

#### Task 2: Coroutines (Partial)
```zig
// Support Lua coroutines
// May need specialized WASM handling
// Estimated effort: 2 hours
```

**Effort**: 2 hours  
**Complexity**: High

#### Task 3: Bit Operations
```zig
// Implement bit.* library
// Standard Lua 5.4 module
// Estimated effort: 1 hour
```

**Effort**: 1 hour  
**Complexity**: Low

**8.3 Total Effort**: 5 hours  
**Risk**: 🟡 MEDIUM (added complexity)  
**Value**: Medium (nice to have)

### Phase 8 Checklist

**8.1 Persistence**:
- [ ] Format specification
- [ ] Serializer implementation
- [ ] Deserializer implementation
- [ ] JavaScript bridge
- [ ] localStorage integration
- [ ] Test workflow
- [ ] Documentation

**8.2 Error Handling**:
- [ ] Stack trace capture
- [ ] Line number tracking
- [ ] Source maps (optional)
- [ ] Test error scenarios
- [ ] Documentation

**8.3 Advanced Features**:
- [ ] Metatables (if time permits)
- [ ] Coroutines (if time permits)
- [ ] Bit operations (if time permits)
- [ ] Testing
- [ ] Documentation

### Phase 8 Success Criteria

✅ External table persistence working  
✅ Save/restore workflow tested  
✅ Better error messages  
✅ Stack traces captured  
✅ Advanced features (if implemented) working  
✅ All tests passing  
✅ Documentation complete  

### Phase 8 Timeline

```
8.1 Persistence:      6-7 hours
8.2 Error Handling:   3-4 hours
8.3 Advanced:         5 hours (optional)
Total:                9-16 hours
Realistic (core):     9-11 hours
```

---

## Consolidated Roadmap

### Critical Path (MVP)

```
Phase 6: Export Fix          2-3 hours     ████
Phase 7: Optimization        3-4 hours     ████
─────────────────────────────────────────────
MVP Complete:                5-7 hours     ████████

Additional (Production):
Phase 8: Features            6-7 hours     ███████
─────────────────────────────────────────────
Production Ready:           11-14 hours    ██████████████
```

### Timeline Estimate

```
Current Date:              October 23, 2025
Phase 6 Completion:        October 24, 2025 (2-3 hours)
Phase 7 Completion:        October 26-27, 2025 (3-4 hours)
Phase 8 Completion:        October 30-31, 2025 (6-7 hours)

Realistic MVP:             October 27, 2025 (4-5 days)
Full Production:           October 31, 2025 (8-9 days)
```

### Resource Requirements

| Phase | Developers | Hours | Total |
|-------|-----------|-------|-------|
| **6** | 1 | 2-3 | 2-3 h |
| **7** | 1 | 3-4 | 3-4 h |
| **8** | 1-2 | 6-7 | 6-7 h |
| **Total** | 1-2 | 11-14 | 11-14 h |

### Risk Matrix

| Phase | Risk | Mitigation |
|-------|------|-----------|
| **6** | LOW | Alternative approaches documented |
| **7** | LOW-MED | Test before/after carefully |
| **8** | MED-HIGH | Break into smaller features |

---

## Decision Points

### After Phase 6 (Export Fix)

**Decision**: Proceed with Phase 7?

**Criteria**:
- ✅ All 6 functions exported and callable
- ✅ Web demo loads without errors
- ✅ Basic Lua execution works
- ✅ No blocker issues found

**If YES**: Continue to Phase 7 (optimization)  
**If NO**: Debug and fix issues, re-run Phase 6

### After Phase 7 (Optimization)

**Decision**: Proceed with Phase 8?

**Criteria**:
- ✅ Binary < 1.0 MB
- ✅ Startup time acceptable
- ✅ No performance regressions
- ✅ All tests still passing

**If YES**: Continue to Phase 8 (features)  
**If NO**: Investigate performance issues

### After Phase 8 (Features)

**Decision**: Production ready?

**Criteria**:
- ✅ Core features working (persistence, error handling)
- ✅ Advanced features optional
- ✅ Documentation complete
- ✅ All tests passing
- ✅ No critical bugs

**If YES**: Ready for release  
**If NO**: Create bug fix roadmap

---

## Success Metrics

### Phase 6 Success
- [ ] 6/6 functions exported (100%)
- [ ] 0 JavaScript errors
- [ ] init() succeeds
- [ ] compute() executes Lua code
- [ ] 0 export issues

### Phase 7 Success
- [ ] Binary size < 1.0 MB (target achieved)
- [ ] Startup time < 120 ms
- [ ] 20% performance improvement
- [ ] All features still work
- [ ] No regressions

### Phase 8 Success
- [ ] Save/restore working (100%)
- [ ] Stack traces in errors
- [ ] 0 persistence bugs
- [ ] Advanced features stable
- [ ] Documentation complete

### Overall Success
- [ ] MVP ready for beta testing
- [ ] 0 critical blockers
- [ ] Team trained on codebase
- [ ] Documentation complete
- [ ] Ready for handoff to maintenance team

---

## Continuation Plan Beyond Phase 8

### Phase 9 (Optional): Advanced Optimization
- [ ] WebAssembly module streaming
- [ ] Lazy compilation
- [ ] Caching strategies
- [ ] Performance profiling
- **Estimated**: 2-3 weeks

### Phase 10 (Optional): Mobile Support
- [ ] React Native WASM integration
- [ ] Flutter WASM (if available)
- [ ] iOS/Android wasm runtime
- **Estimated**: 4-6 weeks

### Phase 11 (Optional): Ecosystem
- [ ] Package manager (luarocks alternative)
- [ ] Community library support
- [ ] Documentation website
- [ ] Tutorial collection
- **Estimated**: 6-8 weeks

---

## Conclusion

The roadmap clearly defines the path from current status (Phase 5 complete, MVP blocked by export issue) to production readiness (Phase 8 complete).

### Key Milestones

1. **Phase 6**: Unblock web demo (2-3 hours)
2. **Phase 7**: Optimize for production (3-4 hours)
3. **Phase 8**: Add core features (6-7 hours)

### Total Effort to MVP
- **Realistic**: 5-7 hours of work
- **Timeline**: 4-5 calendar days
- **Resource**: 1 developer
- **Risk**: Low (proven approaches)

### Ready to Proceed?
✅ **YES** - All tasks identified, estimated, and documented.

---

**Document Status**: Complete  
**Last Updated**: October 23, 2025  
**Status**: Ready for implementation  
**Next Action**: Begin Phase 6
