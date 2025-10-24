# Project Request Protocol (PRP)
## Embedding Lua into WebAssembly Memory

**Document Version**: 1.0  
**Project Status**: Design Phase  
**Priority**: High  
**Complexity**: High  

---

## 1. Project Overview

### 1.1 Executive Summary

This project aims to integrate the Lua 5.4 runtime directly into WebAssembly (WASM) compiled from Zig, creating a fully functional Lua interpreter that executes within a fixed 2MB WASM linear memory while supporting unlimited external data storage through JavaScript Maps.

### 1.2 Problem Statement

Currently, the Lua persistent WASM module has:
- ✅ Basic WASM infrastructure (Zig foundation, 36KB binary)
- ✅ External table API (FFI bridge for JavaScript storage)
- ❌ **No actual Lua runtime** - only stub functions
- ❌ No Lua C library integration
- ❌ No eval/execution functionality

Users cannot run Lua code or access Lua functionality; the system only provides a framework.

### 1.3 Goals

**Primary Goals:**
1. Integrate Lua 5.4 C source into Zig compilation
2. Implement `eval()` function to execute arbitrary Lua code
3. Create Lua bindings for external table operations (`ext.table()`)
4. Maintain fixed WASM memory footprint (~2MB)
5. Enable Lua code to persist data transparently across page reloads

**Secondary Goals:**
1. Ensure execution performance acceptable for interactive use
2. Provide proper error handling and reporting
3. Support full Lua feature set (tables, functions, metatables, etc.)
4. Enable safe execution of untrusted Lua code

### 1.4 Scope

**Included:**
- Lua C runtime compilation to WASM
- FFI bridge between Lua and JavaScript Maps
- Serialization of Lua values to external storage
- Basic error handling and result reporting
- Working eval() execution with code input/output
- Unit tests and integration tests

**Excluded:**
- Async/await support
- Worker threads
- Advanced optimization beyond `-O2`
- Sandbox security hardening
- Standard library extensions (beyond Lua 5.4 stdlib)

### 1.5 Key Constraints

| Constraint | Value | Reason |
|-----------|-------|--------|
| WASM Memory | 2 MB | Fixed allocation, no growth |
| Build Target | wasm32-freestanding | No OS dependencies |
| Max Code Size | ~500 KB | IO buffer and overhead excluded |
| Execution Model | Synchronous | No async primitives |
| External Storage | Unlimited | JavaScript Maps |

---

## 2. Technical Requirements

### 2.1 Functional Requirements

| Req # | Requirement | Priority | Details |
|-------|-------------|----------|---------|
| F1 | Initialize Lua VM | Critical | `init()` creates Lua state on WASM startup |
| F2 | Execute Lua Code | Critical | `eval()` parses and runs arbitrary Lua scripts |
| F3 | Handle Input/Output | Critical | Code input via 64KB buffer, output via same buffer |
| F4 | External Table Access | High | Lua can create/read/write external tables via `ext` API |
| F5 | Error Handling | High | Compilation/runtime errors reported to JavaScript |
| F6 | Serialization | High | Lua values → bytes for external storage |
| F7 | Deserialization | High | Bytes → Lua values from external storage |
| F8 | Memory Stats | Medium | Report memory usage to JavaScript |
| F9 | Garbage Collection | Medium | Trigger and report GC activity |
| F10 | State Persistence | High | Save/restore Lua heap state |

### 2.2 Non-Functional Requirements

| Requirement | Target | Notes |
|------------|--------|-------|
| Binary Size | < 500 KB | Lua + Zig overhead |
| Startup Time | < 100ms | WASM instantiation + Lua init |
| Code Execution | < 1s per 10K ops | Synchronous, no timeout |
| Memory Usage | 2 MB fixed | No linear memory growth |
| Error Reporting | < 200 bytes | Error messages in buffer |
| Browser Support | Chrome 74+, Firefox 79+ | WASM support required |

### 2.3 Integration Points

```
JavaScript Runtime
    ↓ (WebAssembly.instantiate)
WASM Module (Zig)
    ├─ Lua VM (C library)
    │   ├─ Lua State
    │   ├─ Heap
    │   └─ Stack
    └─ FFI Bridge
        ├─ ext_table_* (exports to JS)
        └─ js_ext_table_* (imports from JS)
    ↓
JavaScript Maps (External Storage)
    └─ Persistent Tables
```

### 2.4 Data Flow

**Code Execution Path:**
1. JavaScript writes Lua code to IO buffer (offset 0)
2. JS calls `eval(code_length)`
3. Zig/Lua:
   - Reads code from buffer
   - Parses to bytecode
   - Executes in Lua VM
   - Captures output
4. Zig writes results to buffer
5. JavaScript reads output from buffer

**Data Storage Path:**
1. Lua code: `data["key"] = value`
2. Zig serializes value to bytes
3. Zig calls `js_ext_table_set()` (JS import)
4. JavaScript stores in Map
5. Lua continues with local reference

---

## 3. Solution Proposals

### Solution A: Direct C Integration (Recommended)

**Description:**
Compile Lua 5.4 C source directly into WASM using Zig's C interop layer (`@cImport`). Bind Lua API functions directly to Zig, implementing a minimal Lua execution wrapper.

**Implementation Outline:**
```zig
const lua = @cImport({
    @cInclude("lua.h");
    @cInclude("lauxlib.h");
    @cInclude("lualib.h");
});

pub fn eval(input_len: usize) c_int {
    const code = io_buffer[0..input_len];
    var L = lua.luaL_newstate();
    
    const result = lua.luaL_dostring(L, code);
    // ... capture and return output
    
    lua.lua_close(L);
    return output_len;
}
```

**Pros:**
- ✅ Full Lua 5.4 feature support immediately
- ✅ Minimal code required (mostly bindings)
- ✅ Leverages tested C implementation
- ✅ Standard Lua API, all libraries work
- ✅ Small incremental code size (~50-100KB for Zig bindings)

**Cons:**
- ❌ Requires Lua C headers in project
- ❌ Each `eval()` creates new Lua state (expensive)
- ❌ No state persistence between evals
- ❌ Memory overhead per state instance
- ❌ Potential undefined behavior from C code

**Estimated Size:** 250-300 KB WASM binary  
**Estimated Timeline:** 2-3 days  
**Risk Level:** Medium (C integration complexity)

---

### Solution B: Rewrite Core in Zig

**Description:**
Reimplement essential Lua features (tables, functions, basic operators) in pure Zig, avoiding C entirely. Focus on a minimal but functional subset supporting persistent tables.

**Implementation Outline:**
```zig
const LuaVM = struct {
    state: LuaState,
    tables: std.StringHashMap(LuaValue),
    
    pub fn eval(code: []const u8) ![]const u8 {
        var lexer = Lexer.init(code);
        var ast = try Parser.parse(lexer);
        return try Interpreter.eval(&self, ast);
    }
};
```

**Pros:**
- ✅ Pure Zig, full type safety
- ✅ Complete control over memory layout
- ✅ Smallest possible binary (~100-150 KB)
- ✅ Better integration with WASM
- ✅ Subset optimized for persistence

**Cons:**
- ❌ Huge implementation effort (Lua is complex)
- ❌ Incomplete feature coverage
- ❌ Would need custom parser, lexer, interpreter
- ❌ Lua standard library must be reimplemented
- ❌ Bug compatibility issues with standard Lua
- ❌ Long timeline (weeks to months)

**Estimated Size:** 100-150 KB WASM binary  
**Estimated Timeline:** 4-6 weeks  
**Risk Level:** High (implementation burden)

---

### Solution C: Hybrid Approach - Persistent VM

**Description:**
Integrate Lua C source but keep a single global Lua state for the entire WASM instance lifetime. Implement state serialization to preserve tables and variables between eval() calls.

**Implementation Outline:**
```zig
var global_lua_state: ?*lua.lua_State = null;

pub fn init() c_int {
    global_lua_state = lua.luaL_newstate();
    lua.luaL_openlibs(global_lua_state);
    setup_ext_api();
    return 0;
}

pub fn eval(input_len: usize) c_int {
    const code = io_buffer[0..input_len];
    const result = lua.luaL_dostring(global_lua_state, code);
    // ... capture output, state persists
    return output_len;
}

pub fn serialize_state() []const u8 {
    // Export tables and globals to buffer
}

pub fn restore_state(data: []const u8) void {
    // Restore tables and globals from buffer
}
```

**Pros:**
- ✅ Fast execution (state already initialized)
- ✅ Persistent state across eval calls
- ✅ Full Lua 5.4 feature support
- ✅ Variables survive multiple eval() calls
- ✅ Moderate timeline and complexity
- ✅ Best balance of features and simplicity

**Cons:**
- ❌ Global state harder to manage
- ❌ Need robust serialization code
- ❌ Harder to handle errors without clearing state
- ❌ Memory grows with persistent variables
- ❌ Requires careful cleanup on errors

**Estimated Size:** 280-320 KB WASM binary  
**Estimated Timeline:** 3-4 days  
**Risk Level:** Low-Medium (integration + serialization)

---

## 4. Pro/Con Analysis

### Comparison Matrix

| Aspect | A (Direct C) | B (Zig Rewrite) | C (Persistent VM) |
|--------|-------------|-----------------|-------------------|
| **Feature Completeness** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Development Speed** | ⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| **Code Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Binary Size** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Runtime Performance** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Memory Efficiency** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Maintainability** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **Testing Effort** | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ |

### Risk Assessment

**Solution A Risks:**
- C integration compatibility issues → Mitigate: Use stable Lua 5.4, test extensively
- Multiple state overhead → Mitigate: Document limitation, provide pooling if needed

**Solution B Risks:**
- Incomplete Lua compatibility → Mitigate: Focus on core features first
- Implementation bugs → Mitigate: Use property-based testing
- Long development time → Mitigate: Phase features incrementally

**Solution C Risks:**
- State pollution between calls → Mitigate: Careful error handling, optional reset
- Serialization bugs → Mitigate: Comprehensive test coverage
- Memory growth issues → Mitigate: Monitor heap size, provide GC control

---

## 5. Recommended Solution: C (Persistent VM)

### 5.1 Rationale

**Solution C is chosen because:**

1. **Optimal Timeline-to-Feature Ratio**: 3-4 days for full Lua 5.4 support vs weeks for B
2. **Persistence Philosophy**: Aligns with project goals (persistent external storage)
3. **Performance**: Single initialization + reuse vs Solution A's per-call overhead
4. **Reliability**: Standard Lua C implementation, not reimplementation
5. **Flexibility**: Easy to debug and enhance within existing Lua ecosystem
6. **Scalability**: Minimal code, works with all Lua libraries
7. **Risk Profile**: Medium risk is manageable with proper testing

### 5.2 Architecture Decision

```
Zig WASM Module
├─ Global Lua State (created once at init)
│   ├─ Lua VM (parser, interpreter, stack)
│   ├─ Heap (tables, functions, strings)
│   └─ Libraries (table, string, math, etc.)
│
├─ External Table Bridge
│   ├─ Serializer (Lua value → bytes)
│   └─ Deserializer (bytes → Lua value)
│
├─ eval() Function
│   ├─ Parse code from buffer
│   ├─ Execute in persistent state
│   └─ Capture output to buffer
│
└─ State Serialization
    ├─ Table dump → external storage
    └─ Table restore ← external storage
```

### 5.3 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Management | Global, persistent | Faster execution, enables state persistence |
| Error Handling | Try-catch with rollback | Prevent state corruption on failure |
| Memory Management | Fixed 2MB WASM + unlimited external | No linear memory growth |
| Serialization | Type-tagged binary format | Efficient, supports all Lua types |
| External API | FFI callbacks to JavaScript | Zero-copy, direct Map access |

---

## 6. Implementation Steps

### Phase 1: Lua C Integration (Days 1-2)

**Objective:** Get Lua 5.4 compiling and executing basic code

**Tasks:**

1.1 **Set up Lua C headers**
   - Verify Lua 5.4 C source in `src/lua/` directory
   - Create `src/lua.zig` wrapper with Zig @cImport declarations
   - Map Lua headers: `lua.h`, `lauxlib.h`, `lualib.h`, `lstate.h`
   - Define Zig types for Lua API structures

**Acceptance Criteria:**
- `zig build` compiles without errors
- Lua C functions callable from Zig
- No undefined symbols at link time

---

1.2 **Implement Lua state lifecycle**
   - Create global `lua_State` instance
   - Implement `init()`: `luaL_newstate()` + `luaL_openlibs()`
   - Implement `deinit()`: `lua_close()` cleanup
   - Add memory tracking via `lua_getallocf()`

**Acceptance Criteria:**
- `init()` returns 0 on success
- No memory leaks detected in `deinit()`
- All standard libraries loaded

---

1.3 **Implement basic eval() execution**
   - Read Lua code from IO buffer
   - Call `luaL_dostring()` with code
   - Capture return value (success/error)
   - Write result to output buffer

**Acceptance Criteria:**
- Simple scripts execute: `print("hello")`
- Error messages written to buffer on failure
- Buffer overflow prevented for large output

---

### Phase 2: External Table Binding (Days 2-3)

**Objective:** Connect Lua to JavaScript external storage

**Tasks:**

2.1 **Implement serialization format**
   - Define type-tagged byte format:
     - `0x00`: nil
     - `0x01 [b]`: boolean (b=0/1)
     - `0x02 [i64]`: integer
     - `0x03 [f64]`: float
     - `0x04 [len:u32][bytes]`: string
   - Create `serialize_value()` function
   - Create `deserialize_value()` function

**Acceptance Criteria:**
- All Lua types serialize correctly
- Round-trip: value → bytes → value preserves equality
- No buffer overflow on edge cases

---

2.2 **Create Lua binding library**
   - Implement `ext` Lua table as userdata
   - Add metamethods: `__index`, `__newindex`, `__len`
   - Map Lua table operations to FFI calls:
     - `t[key] = value` → `js_ext_table_set()`
     - `val = t[key]` → `js_ext_table_get()`
     - `t[key] = nil` → `js_ext_table_delete()`
   - Provide `ext.table()` constructor

**Acceptance Criteria:**
- `local t = ext.table()` creates external table
- `t["key"] = "value"` persists to JavaScript
- `print(t["key"])` retrieves from JavaScript
- Iteration works: `for k, v in pairs(t) do ... end`

---

2.3 **Test serialization with actual storage**
   - Run test: create external table
   - Add 10 items with mixed types
   - Verify items appear in JavaScript Map
   - Verify retrieval from JavaScript works
   - Test `pairs()` iteration

**Acceptance Criteria:**
- All 10 items correctly stored and retrieved
- Type information preserved
- No data corruption

---

### Phase 3: Error Handling & Output (Days 3-4)

**Objective:** Robust execution with proper error reporting

**Tasks:**

3.1 **Implement error capture**
   - Wrap `lua_dostring()` with error handling
   - Capture Lua errors: `lua_tostring()` from stack
   - Capture Zig errors: FFI call failures
   - Return status codes: 0=success, <0=error

**Acceptance Criteria:**
- Syntax errors reported with line numbers
- Runtime errors include error message
- Stack not corrupted after error
- Error message fits in buffer

---

3.2 **Implement output redirection**
   - Replace `print()` with custom writer
   - Capture all output to internal buffer
   - Write to IO buffer on completion
   - Support multiple `print()` calls

**Acceptance Criteria:**
- `print("hello"); print("world")` outputs "helloworld"
- Output doesn't interfere with result value
- Large output handled gracefully

---

3.3 **Add result encoding**
   - Last expression becomes return value
   - Serialize return value to buffer
   - Format: `[output][return_value]`
   - JavaScript parses both parts

**Acceptance Criteria:**
- `return 42` encodes as integer 42
- `return "hello"` encodes as string
- `return {x=1}` serializes table
- Nested structures work

---

### Phase 4: Testing & Validation (Day 4)

**Objective:** Verify all functionality works correctly

**Tasks:**

4.1 **Unit tests (Zig)**
   - Test serialization round-trip for each type
   - Test external table operations
   - Test error handling scenarios
   - Test memory stats reporting
   - Build: `zig test src/main.zig`

**Acceptance Criteria:**
- All unit tests pass
- No memory leaks
- Coverage > 80%

---

4.2 **Integration tests (JavaScript)**
   - Test `eval()` with various Lua code
   - Test error reporting
   - Test external table persistence
   - Test cross-eval state retention
   - Run: `npm test`

**Acceptance Criteria:**
- All integration tests pass
- No JavaScript errors in console
- Performance acceptable (<1s per eval)

---

4.3 **Manual browser testing**
   - Run demo interface at `http://localhost:8000`
   - Test: Simple counter script
   - Test: Large dataset (1000 items)
   - Test: Error handling
   - Test: State persistence across reloads
   - Test: Memory stats display

**Acceptance Criteria:**
- Counter increments and persists
- 1000 items load and save
- Errors display clearly
- Stats show correct memory usage
- Page reload preserves state

---

### Phase 5: Documentation & Polish (Optional, Day 5)

**Tasks:**

5.1 Update README with Lua API documentation  
5.2 Add example Lua scripts  
5.3 Document limitations and known issues  
5.4 Create troubleshooting guide  
5.5 Performance benchmarks  

---

## 7. Success Criteria

### 7.1 Functional Success

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **Code Execution** | All Lua 5.4 features work | Run Lua test suite |
| **Persistent State** | Variables survive eval calls | Run counter test, reload page |
| **External Storage** | Unlimited data via JS Maps | Create 10K items, verify persistence |
| **Error Handling** | Clear error messages | Syntax/runtime errors reported |
| **Performance** | < 100ms for typical scripts | Benchmark various script sizes |
| **Memory** | 2MB WASM, unlimited external | Monitor memory stats during use |

### 7.2 Technical Success

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **Binary Size** | < 400 KB | `ls -lh web/lua.wasm` |
| **Startup Time** | < 100ms | Measure `init()` execution |
| **Build Time** | < 30 seconds | Time `./build.sh` |
| **Test Coverage** | > 80% | `zig test` output |
| **Zero Leaks** | No memory leaks | Valgrind/ASAN on native build |
| **Cross-Browser** | Chrome, Firefox, Safari | Test on each |

### 7.3 Integration Success

| Criterion | Target | Validation |
|-----------|--------|-----------|
| **JavaScript Bridge** | All FFI calls work | Call each export function |
| **Serialization** | Lossless round-trip | Test all Lua types |
| **localStorage** | Persist across reloads | Save state, reload, load state |
| **Error Recovery** | Continue after errors | Run bad code, then good code |
| **Documentation** | Complete and accurate | Follow README to replicate results |

### 7.4 Success Metrics

```
✅ MVP Success:
- eval() executes arbitrary Lua code
- External tables work with 100+ items
- State persists across page reloads
- All tests pass
- Binary size < 400 KB

⭐ Stretch Goals:
- Performance < 10ms per simple eval
- Support 1M+ external items
- Full Lua compatibility (all stdlib)
- Zero errors in production browser use
```

---

## 8. Risk Mitigation

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Lua C integration failures | Medium | High | Start with minimal bindings, test early |
| WASM memory overflow | Medium | High | Monitor heap, implement bounds checking |
| FFI callback crashes | Low | Critical | Test each callback thoroughly |
| Serialization bugs | Medium | High | Property-based testing, fuzzing |
| Performance issues | Low | Medium | Profile hot paths, optimize later |
| Binary size explosion | Low | Medium | Monitor size after each phase |

### 8.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Lua C headers missing | Low | High | Verify in Phase 1.1 immediately |
| Compilation issues | Medium | Medium | Test on multiple Zig versions |
| Unexpected C compatibility | Medium | Medium | Have fallback solution ready |
| Integration complexity | Medium | Medium | Budget extra day per phase |

### 8.3 Mitigation Actions

1. **Early Testing**: Complete Phase 1 before committing to full approach
2. **Backup Plans**: Have Solution A ready if Solution C stalls
3. **Incremental Delivery**: Get working MVP by end of Day 2
4. **Code Review**: Review Lua bindings with C expert
5. **Monitoring**: Track WASM binary size at each step

---

## 9. Timeline Summary

```
Day 1:
├─ Phase 1.1: Lua C integration (4 hours)
├─ Phase 1.2: Lua state lifecycle (3 hours)
└─ CHECKPOINT: Basic compilation works

Day 2:
├─ Phase 1.3: eval() implementation (4 hours)
├─ Phase 2.1: Serialization format (3 hours)
└─ CHECKPOINT: Basic code execution works

Day 3:
├─ Phase 2.2: Lua binding library (4 hours)
├─ Phase 2.3: Serialization testing (3 hours)
└─ CHECKPOINT: External tables work

Day 4:
├─ Phase 3.1-3.3: Error handling (4 hours)
├─ Phase 4: Testing (3 hours)
└─ CHECKPOINT: Full functionality verified

Day 5 (Optional):
├─ Phase 5: Documentation
└─ Buffer for issues/polish
```

**Total Effort**: 4 days core development + 1 day testing/polish

---

## 10. Deliverables

### 10.1 Code Deliverables

```
web/
├─ lua.wasm              ← Updated WASM binary (with Lua)
├─ lua-persistent.js     ← Updated JavaScript wrapper
└─ index.html            ← Updated demo interface

src/
├─ main.zig              ← Updated Zig implementation
├─ lua.zig               ← New Lua C bindings
├─ eval.zig              ← New eval() implementation
└─ serialization.zig     ← New serialization code

tests/
├─ unit.zig              ← Zig unit tests
└─ integration.test.js   ← JavaScript integration tests
```

### 10.2 Documentation Deliverables

```
├─ README_LUA.md         ← Lua API documentation
├─ IMPLEMENTATION.md     ← Implementation details
├─ TROUBLESHOOTING.md    ← Common issues
└─ BENCHMARKS.md         ← Performance measurements
```

### 10.3 Examples

```
examples/
├─ counter.lua           ← Simple counter with persistence
├─ todo-list.lua         ← Todo app example
├─ data-processing.lua   ← Large dataset handling
└─ state-machine.lua     ← Stateful execution example
```

---

## 11. Dependencies

### 11.1 Tools & Languages

- Zig 0.15.1+ (compiler)
- Lua 5.4 C source (already in `src/lua/`)
- Node.js 18+ (testing)
- Python 3 (web server)

### 11.2 Zig Packages

- `std` (Zig standard library) - already available

### 11.3 Assumptions

- Lua 5.4 C source compiles with Zig C interop
- No WASM-specific Lua patches needed
- JavaScript Maps available in all target browsers

---

## 12. Approval & Next Steps

### 12.1 Sign-off

- **Technical Lead**: Approve architecture decision
- **Product Owner**: Confirm timeline and deliverables
- **QA Lead**: Review test plan

### 12.2 Next Actions

1. **Approval**: Review this PRP and provide feedback
2. **Kickoff**: Schedule Phase 1 start date
3. **Setup**: Prepare development environment
4. **Phase 1**: Begin Lua C integration (Day 1)

### 12.3 Communication Plan

- **Daily standup**: 15-minute sync
- **Checkpoint reviews**: End of each phase
- **Issue tracking**: GitHub issues for blockers
- **Documentation**: Updated README after each phase

---

## Appendix A: Lua API Reference

### Essential Functions for Integration

```c
lua_State *luaL_newstate(void);
void lua_close(lua_State *L);
void luaL_openlibs(lua_State *L);
int luaL_dostring(lua_State *L, const char *str);
const char *lua_tostring(lua_State *L, int index);
void lua_settop(lua_State *L, int index);
int lua_type(lua_State *L, int index);
```

### Key Concepts

- **Lua State**: Virtual machine instance (`lua_State`)
- **Stack**: Function arguments and results
- **Tables**: Lua's primary data structure
- **Metatables**: Tables that customize behavior
- **Userdata**: Custom C types in Lua

---

## Appendix B: External Table FFI Interface

### JavaScript Side

```javascript
const extTables = new Map(); // tableId -> Map
const imports = {
  env: {
    js_ext_table_set(tableId, keyPtr, keyLen, valPtr, valLen) {
      const key = Buffer.from(memory.buffer, keyPtr, keyLen);
      const val = Buffer.from(memory.buffer, valPtr, valLen);
      if (!extTables.has(tableId)) {
        extTables.set(tableId, new Map());
      }
      extTables.get(tableId).set(key, val);
      return 0;
    },
    // ... similar for get, delete, size, keys
  }
};
```

### Zig Side

```zig
pub fn ext_table_set(table_id: u32, key_ptr: [*]const u8, key_len: usize, 
                     val_ptr: [*]const u8, val_len: usize) callconv(.C) c_int {
    return js_ext_table_set(table_id, key_ptr, key_len, val_ptr, val_len);
}
```

---

## Appendix C: Test Scenarios

### T1: Basic Code Execution
```lua
local x = 5 + 3
print("Result: " .. x)
```
Expected: Output "Result: 8", return 8

### T2: External Table Creation
```lua
local data = ext.table()
data["name"] = "Alice"
data["age"] = 30
return data["name"]
```
Expected: Return "Alice", verify in JavaScript Map

### T3: State Persistence
```lua
-- eval 1
local counter = (counter or 0) + 1
print("Count: " .. counter)
```
Run twice → outputs "Count: 1", then "Count: 2"

### T4: Error Handling
```lua
invalid syntax here
```
Expected: Error message with line number

### T5: Large Dataset
```lua
local t = ext.table()
for i = 1, 1000 do
  t["item_" .. i] = "value_" .. i
end
return "Stored 1000 items"
```
Expected: 1000 items in JavaScript Map, returns message

---

**Document End**

Version 1.0 | Generated 2025-10-23 | Status: Ready for Review
