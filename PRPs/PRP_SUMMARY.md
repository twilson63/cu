# Project Request Protocol (PRP) Summary

**Date**: October 23, 2025  
**Project**: Lua WASM Freestanding Exports Investigation  
**Document**: `lua-wasm-freestanding-exports-prp.md`

---

## Overview

A comprehensive PRP has been created to investigate and implement the solution for enabling direct WASM function exports using `wasm32-freestanding` target instead of the current `wasm32-wasi` approach.

## Document Structure

### 1. Project Overview (Section 1)
- **Executive Summary**: The WASI runtime wraps all code, hiding the 6 exported functions from JavaScript
- **Problem Statement**: Functions have `export fn` declarations but aren't accessible due to WASI wrapper
- **Proof**: Binary inspection shows only `memory` and `_start` are exported
- **Impact**: Complete blocker for web demo functionality
- **Goals**: Investigate freestanding approach, enable direct exports, verify all 6 functions work

### 2. Technical Requirements (Section 2)
- **10 Functional Requirements** - From compilation to export verification
- **Non-Functional Requirements** - Build success, binary size, performance
- **Technical Architecture** - Diagram showing module structure
- **Data Flow** - How code execution flows through the system
- **Dependency Analysis** - What Lua C actually needs from libc

### 3. Solution Proposals (Section 3)

#### Solution A: Custom Libc Stubs (RECOMMENDED ⭐)
- Create minimal C library implementations in Zig
- Direct function exports (no WASI wrapper)
- Full control over dependencies
- Optimal binary size and performance
- **Effort**: 6-8 hours | **Risk**: Medium | **Pros**: 7 | **Cons**: 3

#### Solution B: musl libc Minimal Build
- Use complete, tested C standard library
- Complex build integration required
- Larger binary but fully compatible
- **Effort**: 4-6 hours | **Risk**: Medium-High | **Pros**: 5 | **Cons**: 5

#### Solution C: JavaScript Wrapper (Not Recommended)
- Keep WASI binary, extract functions via JS
- Fragile workaround, not a real fix
- Extremely risky and difficult
- **Effort**: 2-3 hours | **Risk**: High | **Pros**: 2 | **Cons**: 7

#### Solution D: Dual Build Targets
- Maintain both WASI and freestanding binaries
- Maximum flexibility but maintenance burden
- Good for testing, not recommended long-term
- **Effort**: 5-7 hours | **Risk**: Low-Medium | **Pros**: 5 | **Cons**: 6

### 4. Pro/Con Analysis (Section 4)
- Detailed comparison matrix of all solutions
- Risk assessment for each approach
- Mitigation strategies
- **Winner**: Solution A (Custom Stubs)
  - Fastest to solution
  - Best code correctness
  - Smallest binary
  - Easiest maintenance
  - True fix (not workaround)

### 5. Implementation Steps (Section 6)

#### Phase 1: Investigation & Analysis (2 hours)
- Analyze Lua C library dependencies
- Check feasibility for each include
- Create stub implementation plan
- Verify Zig target feasibility

#### Phase 2: Create Libc Stubs (3 hours)
- Static memory pool for malloc/free
- String functions (strlen, strcmp, strcpy, etc.)
- Memory functions (memcpy, memset, etc.)
- Exception handling (setjmp/longjmp)

#### Phase 3: Modify Build System (1.5 hours)
- Create build-freestanding.sh
- Keep build.sh as fallback
- Update AGENTS.md documentation

#### Phase 4: Build & Verify (1.5 hours)
- Attempt compilation
- Inspect binary exports (should show all 6 functions)
- Load in JavaScript and test each function
- Verify compute() works with Lua code

#### Phase 5: Documentation & Cleanup (1 hour)
- Create implementation report
- Update build documentation
- Compare WASI vs freestanding performance
- Prepare for deployment

**Total Timeline**: 9 hours + 1 hour buffer = 10 hours (1.25 days)

### 7. Success Criteria (Section 7)

**Build Success**
- ✅ Compilation with 0 errors
- ✅ Binary < 2.0 MB
- ✅ Valid WASM (magic bytes present)
- ✅ No _start in exports

**Function Export Verification**
- ✅ All 6 functions exported
- ✅ Memory object present
- ✅ No WASI wrapper

**Functional Testing**
- ✅ init() returns 0
- ✅ compute() accepts (ptr, len)
- ✅ Lua executes "1+1"
- ✅ No crashes

**MVP Success Criteria** (ALL required)
```
✅ wasm32-freestanding compilation successful
✅ All 6 functions exported and callable
✅ compute("1 + 1") executes successfully
✅ Binary is valid WebAssembly
✅ Zero JavaScript errors
✅ Build completes in < 2 minutes
✅ Documentation complete
```

### 8. Risk Assessment (Section 8)

**Technical Risks** (3 identified)
- Stub implementation incomplete → Mitigate: Incremental implementation
- Lua C unexpected dependencies → Mitigate: Aggressive testing
- setjmp/longjmp difficult → Mitigate: Use workaround (non-essential)

**Schedule Risks** (3 identified)
- Implementation takes longer → Mitigate: Break into smaller tasks
- Build system issues → Mitigate: Test early and often
- Binary doesn't work → Mitigate: Have WASI fallback

**Mitigation Actions**
- Checkpoint testing after each phase
- Keep WASI build working as fallback
- Implement stubs incrementally
- Test every function export
- Document all decisions
- Quick build + debug cycle

### 9. Deliverables (Section 10)

**Code**
```
src/libc-stubs.zig                 [NEW]
build-freestanding.sh              [NEW]
web/lua.wasm                        [REGENERATED]
build.sh                            [UNCHANGED]
```

**Documentation**
```
FREESTANDING_IMPLEMENTATION.md      [NEW]
AGENTS.md                           [UPDATED]
README.md                           [UPDATED]
BUILD_COMPARISON.md                 [NEW]
```

**Tests & Artifacts**
```
test-freestanding.js                [NEW]
test-compute.js                     [NEW]
test-integration.js                 [NEW]
build.log, binary-inspection.txt, performance-metrics.txt
```

### 10. Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Solution** | A (Custom Stubs) | Best balance of simplicity, control, and outcome |
| **Target** | wasm32-freestanding | Direct exports, no wrapper overhead |
| **Libc** | Custom minimal stubs | Full control, optimal size |
| **Build** | Separate script | Flexibility, no interference with WASI |
| **Fallback** | Keep WASI build | Risk mitigation, gradual migration |
| **Memory** | Static pool | Simplicity (Lua doesn't free much) |
| **setjmp** | Minimal impl | Not critical for MVP |

---

## How to Use This PRP

### For Management/Stakeholders
1. Read this summary (you are here)
2. Understand the 4 solution options and why A was chosen
3. Note the 9-hour timeline and 1-day total duration
4. Review success criteria to understand what "done" means

### For Developers
1. Read the full PRP document: `PRPs/lua-wasm-freestanding-exports-prp.md`
2. Review Section 6 (Implementation Steps) in detail
3. Start with Phase 1 (Investigation & Analysis)
4. Follow each phase sequentially, testing after each
5. Document any issues and iterate

### For QA/Testers
1. Review Section 7 (Success Criteria)
2. Once implementation is done, verify against all criteria
3. Test each of the 6 exported functions
4. Verify compute() works with various Lua code samples
5. Document any failures

### For Architects
1. Review Section 2 (Technical Requirements)
2. Review Section 3-4 (Solutions & Analysis)
3. Understand the architecture diagrams
4. Review Section 8 (Risk Assessment)
5. Approve choice of Solution A

---

## Key Facts

**What's the Problem?**
Current WASM binary has `export fn` declarations but they're hidden by WASI runtime wrapper. Only `memory` and `_start` are visible to JavaScript.

**Why This Matters?**
Without direct function exports, the web demo cannot:
- Call `compute()` to execute Lua code
- Call `init()` to initialize the VM
- Access buffer functions
- Use external table persistence

**What's the Solution?**
Rebuild with `wasm32-freestanding` target and provide minimal C library stubs. This removes the WASI wrapper and exposes functions directly.

**How Long?**
- Investigation: 2 hours
- Implementation: 7 hours
- Testing & docs: 1 hour
- **Total: 10 hours (1.25 days)**

**What Could Go Wrong?**
- Stub implementation incomplete (mitigate: incremental)
- Lua C has unexpected dependencies (mitigate: test aggressively)
- Integration issues (mitigate: quick iteration)

**How Do We Know It Works?**
- Binary inspection shows all 6 functions exported
- JavaScript can instantiate module
- Each function callable without errors
- compute() executes Lua code successfully

---

## Next Steps

1. **Review** - Read the full PRP document
2. **Decide** - Approve Solution A (Custom Stubs)
3. **Plan** - Schedule 10 hours for implementation
4. **Execute** - Follow Phases 1-5 in Section 6
5. **Verify** - Check all success criteria in Section 7
6. **Document** - Record findings and decisions
7. **Deploy** - Use new freestanding binary

---

## Quick Links

- **Full PRP**: `PRPs/lua-wasm-freestanding-exports-prp.md`
- **Previous PRP**: `PRPs/lua-wasm-compute-export-prp.md` (original export fix attempt)
- **Status Docs**: `EXPORT_FIX_NEEDED.md` (current blocker analysis)
- **Build Notes**: `AGENTS.md` (build constraints and approaches)

---

**Document Prepared**: October 23, 2025  
**Status**: Ready for Execution  
**Recommendation**: Proceed with Solution A implementation
