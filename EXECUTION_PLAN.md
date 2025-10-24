# Lua WASM Integration - Detailed Execution Plan

**Status**: Starting Implementation  
**Timeline**: 4 days core + 1 day testing/polish  
**Solution**: Solution C - Persistent VM Architecture  

## Key Requirements Summary

### Functional Requirements (F1-F10)
- F1: Initialize Lua VM (critical)
- F2: Execute Lua Code via eval() (critical)
- F3: Handle Input/Output through 64KB buffer (critical)
- F4: External Table Access via ext.table() (high)
- F5: Error Handling with clear messages (high)
- F6: Serialization (Lua → bytes) (high)
- F7: Deserialization (bytes → Lua) (high)
- F8: Memory Stats reporting (medium)
- F9: Garbage Collection triggers (medium)
- F10: State Persistence across reloads (high)

### Technical Constraints
- WASM Memory: 2 MB fixed
- Build Target: wasm32-freestanding
- Max Code Size: ~500 KB
- Execution Model: Synchronous only
- External Storage: Unlimited via JS Maps

## Architecture Overview

```
WASM Module (Zig)
├─ Global Lua State (persistent)
│  ├─ Lua VM (5.4)
│  ├─ Heap + Stack
│  └─ Libraries
├─ IO Buffer (64 KB)
│  ├─ Input: Lua code
│  └─ Output: Results + errors
├─ FFI Bridge
│  ├─ ext_table_* functions (exports)
│  └─ js_ext_table_* callbacks (imports)
└─ Serialization Engine
   ├─ Type-tagged byte format
   └─ Lua ↔ JavaScript Maps
```

## Implementation Roadmap

### Phase 1: Lua C Integration (Day 1-2)
**Goal**: Get Lua 5.4 compiling and executing basic code

#### Task 1.1: Lua C Headers Setup (4 hours)
- Verify `src/lua/` has Lua 5.4 C source
- Create `src/lua.zig` with @cImport declarations
- Include: lua.h, lauxlib.h, lualib.h, lstate.h
- Build and test compilation

#### Task 1.2: Lua State Lifecycle (3 hours)
- Create global lua_State variable
- Implement init(): luaL_newstate() + luaL_openlibs()
- Implement cleanup paths
- Test state creation/destruction

#### Task 1.3: Basic eval() (4 hours)
- Read Lua code from IO buffer
- Call luaL_dostring()
- Capture output/errors
- Write results to buffer

**Checkpoint**: Basic code execution works (print("hello"))

### Phase 2: External Table Binding (Day 2-3)
**Goal**: Connect Lua to JavaScript external storage

#### Task 2.1: Serialization Format (3 hours)
- Implement type-tagged byte format:
  - 0x00: nil
  - 0x01 [b]: boolean
  - 0x02 [i64]: integer
  - 0x03 [f64]: float
  - 0x04 [len:u32][bytes]: string
- Create serialize_value() function
- Create deserialize_value() function

#### Task 2.2: Lua Binding Library (4 hours)
- Create ext Lua table
- Implement metamethods (__index, __newindex, __len)
- Map operations to FFI calls
- Implement ext.table() constructor

#### Task 2.3: Serialization Testing (3 hours)
- Create external table
- Store 10+ items with mixed types
- Verify in JavaScript Map
- Test retrieval and iteration

**Checkpoint**: External tables persist to JavaScript

### Phase 3: Error Handling & Output (Day 3-4)
**Goal**: Robust execution with proper error reporting

#### Task 3.1: Error Capture (3 hours)
- Wrap luaL_dostring() with error handling
- Capture Lua errors from stack
- Return status codes (0=success, <0=error)
- Ensure error messages fit in buffer

#### Task 3.2: Output Redirection (3 hours)
- Replace print() with custom writer
- Capture all output
- Support multiple print() calls
- Prevent buffer overflow

#### Task 3.3: Result Encoding (2 hours)
- Serialize last expression as return value
- Format: [output][return_value]
- Support all Lua types in results

**Checkpoint**: Full error handling and output capture working

### Phase 4: Testing & Validation (Day 4)
**Goal**: Verify all functionality works correctly

#### Task 4.1: Zig Unit Tests (3 hours)
- Serialization round-trip tests
- External table operation tests
- Error handling scenarios
- Memory stats tests

#### Task 4.2: JavaScript Integration Tests (3 hours)
- eval() with various Lua code
- Error reporting
- External table persistence
- State retention across evals

#### Task 4.3: Browser Testing (2 hours)
- Counter script test
- Large dataset (1000 items)
- Error handling
- State persistence across reloads
- Memory stats display

**Checkpoint**: All functionality verified

### Phase 5: Documentation & Polish (Day 5 - Optional)
**Goal**: Complete documentation and examples

#### Task 5.1: API Documentation
- Update README with Lua API
- Add Zig FFI documentation
- Document external table API

#### Task 5.2: Examples
- Counter with persistence
- Todo list
- Large dataset handling
- State machine

#### Task 5.3: Troubleshooting & Benchmarks
- Common issues guide
- Performance benchmarks
- Known limitations

## Critical Path Items

```
Phase 1.1 (Lua headers)
    ↓
Phase 1.2 (State lifecycle)
    ↓
Phase 1.3 (eval execution) ← Day 1 checkpoint
    ↓
Phase 2.1 (Serialization)
    ↓
Phase 2.2 (Lua bindings)
    ↓
Phase 2.3 (Testing) ← Day 2 checkpoint
    ↓
Phase 3.1-3.3 (Error handling) ← Day 3 checkpoint
    ↓
Phase 4.1-4.3 (Testing) ← Day 4 checkpoint
    ↓
Phase 5 (Documentation) ← Optional Day 5
```

## Success Criteria (Minimum Viable Product)

### MVP Acceptance
- ✅ eval() executes arbitrary Lua code
- ✅ Variables persist across eval() calls
- ✅ External tables store 100+ items
- ✅ State persists across page reloads
- ✅ All unit and integration tests pass
- ✅ Binary size < 400 KB
- ✅ No memory leaks

### Test Coverage Requirements
- ✅ Each phase has acceptance criteria
- ✅ Unit tests > 80% coverage
- ✅ Integration tests for all major flows
- ✅ Manual browser testing checklist

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Lua C integration failures | Medium | High | Early phase completion verification |
| WASM memory overflow | Medium | High | Heap monitoring, bounds checking |
| FFI callback issues | Low | Critical | Thorough testing before phase 3 |
| Serialization bugs | Medium | High | Property-based testing |
| Performance issues | Low | Medium | Profile after each phase |
| Binary size explosion | Low | Medium | Monitor after each phase |

## Code Structure

```
src/
├─ main.zig              # Entry points: init(), eval()
├─ lua.zig               # Lua C bindings
├─ ffi.zig               # External table FFI bridge
├─ serializer.zig        # Type-tagged serialization
├─ output.zig            # Output/print capturing
└─ error.zig             # Error handling

web/
├─ lua.wasm              # Generated binary
├─ lua-persistent.js     # JS wrapper + external tables
├─ wasm-loader.js        # WASM instantiation
└─ index.html            # Demo UI

tests/
├─ unit.zig              # Zig unit tests
└─ integration.test.js   # JavaScript integration tests

docs/
├─ README_LUA.md         # Lua API documentation
├─ ARCHITECTURE.md       # Architecture decisions
├─ IMPLEMENTATION.md     # Implementation details
└─ TROUBLESHOOTING.md    # Common issues

examples/
├─ counter.lua
├─ todo-list.lua
├─ data-processing.lua
└─ state-machine.lua
```

## Daily Standup Checklist

### Day 1 Checklist
- [ ] Lua C headers compiling
- [ ] Lua state creation works
- [ ] Simple eval() executing
- [ ] Binary builds successfully
- [ ] No undefined symbols

### Day 2 Checklist
- [ ] Serialization round-trips working
- [ ] External tables created and stored
- [ ] ext.table() constructor works
- [ ] 10+ items persist to JS
- [ ] Type information preserved

### Day 3 Checklist
- [ ] Errors captured with messages
- [ ] Output captured correctly
- [ ] Error recovery working
- [ ] No state corruption on errors
- [ ] Return values encoded properly

### Day 4 Checklist
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Browser tests passing
- [ ] All 5 test scenarios verified
- [ ] Performance acceptable

### Day 5 Checklist (Optional)
- [ ] README updated
- [ ] Examples working
- [ ] Troubleshooting guide complete
- [ ] Benchmarks documented
- [ ] No outstanding issues

## Implementation Notes

### Assumptions Made
1. Lua 5.4 C source compiles with Zig @cImport
2. No WASM-specific Lua patches needed
3. JavaScript Maps available in all browsers
4. Single Lua state sufficient for MVP
5. No multi-threaded access needed

### Known Limitations (To Document)
1. Single global Lua state (not per-eval)
2. State pollution if Lua code errors
3. No timeout enforcement on eval
4. No sandbox isolation of untrusted code
5. localStorage limit ~5-10 MB (use IndexedDB for more)

### Performance Targets
- Startup: < 100ms
- eval() for simple code: < 10ms
- eval() for 10K ops: < 1s
- Memory overhead: < 100 KB per eval
- Binary size: < 400 KB

## Questions & Dependencies

### External Dependencies
- Lua 5.4 C source: ✅ Already in src/lua/
- Zig compiler 0.15.1+: ✅ Available
- Node.js 18+: ✅ Available
- Python 3: ✅ Available

### Zig-Specific Notes
- Use callconv(.C) for C interop
- Use @cImport for C headers
- Handle memory alignment for C structs
- Use extern fn for imported C functions

## Backup Plans

### If Phase 1 fails
- Fallback: Use Solution A (per-eval states)
- Timeline: +2 days
- Trade-off: Slower execution, no state persistence

### If serialization is slow
- Profile hot paths
- Consider caching serialized values
- Optimize for common types first

### If WASM size exceeds limits
- Strip debug symbols
- Use -O ReleaseSmall
- Consider linking subset of Lua libraries

---

**Plan Status**: Ready to Start Phase 1  
**Next Action**: Begin Task 1.1 - Lua C Headers Setup
