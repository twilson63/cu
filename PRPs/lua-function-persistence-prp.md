# Project Request Protocol: Lua Function Persistence in External Storage

## Project Overview

### Title
Enable Persistent Storage of Lua Functions in External Memory Tables

### Background
The current Lua WASM implementation successfully persists primitive data types (nil, boolean, integer, float, string) in external storage via IndexedDB. However, Lua functions—a critical component for maintaining application logic and state—cannot be persisted. This limitation prevents complete state restoration for applications that dynamically create or modify functions at runtime.

### Objective
Research and implement a solution to serialize, store, and restore Lua functions through the external table Memory system, enabling full persistence of Lua application state including user-defined functions, closures, and their associated upvalues.

### Scope
- Research feasibility of function serialization in Lua 5.4.6
- Implement function serialization/deserialization in the WASM layer
- Extend the external table storage system to handle function bytecode
- Maintain security and performance characteristics of the existing system

## Technical Requirements

### Functional Requirements
1. **FR1**: Serialize Lua functions to a persistent format (bytecode)
2. **FR2**: Store serialized functions in external memory tables via IndexedDB
3. **FR3**: Deserialize and restore functions with correct behavior
4. **FR4**: Support functions with upvalues and closures
5. **FR5**: Handle edge cases (C functions, coroutines, metatables)
6. **FR6**: Maintain backward compatibility with existing persistence API

### Non-Functional Requirements
1. **NFR1**: Performance overhead < 20% for function operations
2. **NFR2**: Storage size < 10KB per typical function
3. **NFR3**: No security vulnerabilities from bytecode execution
4. **NFR4**: Transparent operation (no API changes for simple cases)
5. **NFR5**: Graceful degradation for unsupported function types

### Constraints
- **C1**: Must work within wasm32-freestanding target limitations
- **C2**: Cannot use dynamic memory allocation
- **C3**: Limited to 64KB IO buffer for serialization
- **C4**: Must maintain Lua 5.4.6 compatibility
- **C5**: Cannot modify core Lua C source files

## Proposed Solutions

### Solution 1: Lua string.dump with Binary Storage

#### Description
Utilize Lua's built-in `string.dump` function to serialize functions to bytecode, then store the binary data in external tables with base64 encoding for IndexedDB compatibility.

#### Implementation Approach
```lua
-- Serialization
function serializeFunction(fn)
    local bytecode = string.dump(fn, true)  -- strip debug info
    return {type = "function", data = base64_encode(bytecode)}
end

-- Deserialization  
function deserializeFunction(data)
    local bytecode = base64_decode(data.data)
    return load(bytecode, nil, "b")  -- binary mode
end
```

#### Pros
- ✅ Uses native Lua capabilities (string.dump/load)
- ✅ Handles closures and upvalues automatically
- ✅ Minimal changes to existing codebase
- ✅ Well-tested approach in Lua ecosystem
- ✅ Compact bytecode representation

#### Cons
- ❌ Cannot serialize C functions
- ❌ Debug info lost (unless preserved, increasing size)
- ❌ Security risk if loading untrusted bytecode
- ❌ Upvalue references to external objects need special handling
- ❌ Requires base64 encoding overhead (33% size increase)

### Solution 2: Custom AST Serialization

#### Description
Parse functions into Abstract Syntax Trees, serialize the AST structure to JSON, and reconstruct functions from the AST on deserialization.

#### Implementation Approach
```zig
// In serializer.zig
pub const SerializationType = enum(u8) {
    // ... existing types ...
    function_ast = 0x05,
};

pub fn serialize_function_ast(L: *lua.lua_State, idx: c_int) ![]u8 {
    // 1. Get function source code or parse bytecode
    // 2. Build AST representation
    // 3. Serialize AST to JSON/MessagePack
    // 4. Return serialized bytes
}
```

#### Pros
- ✅ Human-readable/debuggable format
- ✅ Can include metadata and debug info
- ✅ Platform-independent representation
- ✅ Can be validated before execution
- ✅ Supports function transformation/optimization

#### Cons
- ❌ Complex implementation required
- ❌ Larger storage size than bytecode
- ❌ Performance overhead for AST reconstruction
- ❌ May not capture all Lua semantics perfectly
- ❌ Requires significant development effort

### Solution 3: Hybrid Reference System with Code Registry

#### Description
Store function source code in a registry, persist only references in external tables, and use lazy compilation on restoration. Functions are registered with unique IDs.

#### Implementation Approach
```javascript
// In lua-persistence.js
class FunctionRegistry {
    constructor() {
        this.registry = new Map();
        this.sourceMap = new Map();
    }
    
    register(fn, source) {
        const id = crypto.randomUUID();
        this.registry.set(id, fn);
        this.sourceMap.set(id, source);
        return {type: "function_ref", id, source};
    }
    
    restore(ref) {
        if (this.sourceMap.has(ref.id)) {
            return lua.compute(`return ${ref.source}`);
        }
        // Fallback: recompile from source
        return lua.compute(`return ${ref.source}`);
    }
}
```

#### Pros
- ✅ Simple implementation
- ✅ Maintains function identity
- ✅ Supports hot-reloading and versioning
- ✅ Can track function dependencies
- ✅ Memory efficient (stores source once)

#### Cons
- ❌ Requires source code availability
- ❌ Cannot handle dynamically generated functions
- ❌ Breaking change to persistence API
- ❌ Registry needs to be persisted separately
- ❌ Doesn't work for anonymous functions without source

## Best Solution Selection

### Recommended: Solution 1 (Lua string.dump with Binary Storage)

#### Rationale
1. **Proven Technology**: `string.dump` and `load` are battle-tested Lua features
2. **Minimal Complexity**: Leverages existing Lua infrastructure
3. **Complete Support**: Handles closures, upvalues, and local variables
4. **Performance**: Native C implementation is highly optimized
5. **Compatibility**: Works with existing serialization framework

#### Risk Mitigation
- **Security**: Implement bytecode validation and sandboxing
- **C Functions**: Provide registry fallback for standard library functions
- **Size**: Enable compression for large functions
- **Debugging**: Optionally preserve debug info based on configuration

## Implementation Steps

### Phase 1: Foundation (Week 1)
1. **Step 1.1**: Extend SerializationType enum in serializer.zig
   ```zig
   pub const SerializationType = enum(u8) {
       // ... existing types ...
       function_bytecode = 0x05,
       function_ref = 0x06,  // For C functions
   };
   ```

2. **Step 1.2**: Implement Lua function detection
   ```zig
   if (lua.isfunction(L, stack_index)) {
       if (lua.iscfunction(L, stack_index)) {
           return serialize_function_ref(L, stack_index, buffer, max_len);
       } else {
           return serialize_function_bytecode(L, stack_index, buffer, max_len);
       }
   }
   ```

3. **Step 1.3**: Create string.dump wrapper in Zig
   ```zig
   fn dump_function(L: *lua.lua_State, idx: c_int, strip: bool) ![]u8 {
       lua.pushvalue(L, idx);  // Push function
       // Call string.dump via Lua
       lua.getglobal(L, "string");
       lua.getfield(L, -1, "dump");
       lua.pushvalue(L, idx);
       lua.pushboolean(L, if (strip) 1 else 0);
       if (lua.pcall(L, 2, 1, 0) != 0) {
           return error.DumpFailed;
       }
       // Get resulting bytecode string
       const bytecode = lua.tolstring(L, -1, &len);
       return bytecode[0..len];
   }
   ```

### Phase 2: Serialization (Week 2)
4. **Step 2.1**: Implement function serialization
   ```zig
   pub fn serialize_function_bytecode(L: *lua.lua_State, idx: c_int, buffer: [*]u8, max_len: usize) !usize {
       const bytecode = try dump_function(L, idx, true);
       if (max_len < 5 + bytecode.len) return SerializationError.BufferTooSmall;
       
       buffer[0] = @intFromEnum(SerializationType.function_bytecode);
       // Store length as u32
       const len_bytes = std.mem.asBytes(&@as(u32, bytecode.len));
       @memcpy(buffer[1..5], len_bytes);
       // Store bytecode
       @memcpy(buffer[5..5 + bytecode.len], bytecode);
       return 5 + bytecode.len;
   }
   ```

5. **Step 2.2**: Handle C function references
   ```zig
   const c_function_registry = [_]struct { name: []const u8, fn: lua.CFunction }{
       .{ .name = "print", .fn = lua.print },
       .{ .name = "math.sin", .fn = lua.math_sin },
       // ... standard library functions
   };
   ```

### Phase 3: Deserialization (Week 2)
6. **Step 3.1**: Implement function loading
   ```zig
   pub fn deserialize_function_bytecode(L: *lua.lua_State, buffer: [*]const u8, len: usize) !void {
       if (len < 5) return SerializationError.InvalidFormat;
       
       const bytecode_len = // read u32 from buffer[1..5]
       if (len < 5 + bytecode_len) return SerializationError.InvalidFormat;
       
       // Load bytecode using Lua's load function
       if (lua.luaL_loadbuffer(L, buffer + 5, bytecode_len, "=persisted") != 0) {
           return error.LoadFailed;
       }
   }
   ```

### Phase 4: JavaScript Integration (Week 3)
7. **Step 4.1**: Extend lua-persistence.js for function handling
   ```javascript
   // Detect and handle function persistence
   async saveTables(externalTables, metadata = {}) {
       // ... existing code ...
       // Add function type support in serialization
   }
   ```

8. **Step 4.2**: Add examples and documentation
   ```lua
   -- Example: Persisting functions
   Memory.calculate = function(x, y)
       return x * y + 100
   end
   
   Memory.factory = function(name)
       return function() 
           return "Hello, " .. name 
       end
   end
   ```

### Phase 5: Testing & Validation (Week 3-4)
9. **Step 5.1**: Create comprehensive test suite
   - Basic function persistence
   - Functions with upvalues
   - Nested functions and closures
   - Error handling for C functions
   - Performance benchmarks

10. **Step 5.2**: Security audit
    - Bytecode validation
    - Sandboxing implementation
    - Input sanitization

## Success Criteria

### Functional Success Metrics
- ✅ **SC1**: Successfully serialize and restore 95% of user-defined Lua functions
- ✅ **SC2**: Preserve function behavior including upvalues and closures
- ✅ **SC3**: Gracefully handle C functions with clear error messages
- ✅ **SC4**: Pass all existing tests plus 20 new function-specific tests
- ✅ **SC5**: Support functions up to 50KB bytecode size

### Performance Metrics
- ✅ **SC6**: Function serialization < 10ms for typical functions
- ✅ **SC7**: Function deserialization < 5ms for typical functions
- ✅ **SC8**: Storage overhead < 2x source code size
- ✅ **SC9**: No measurable impact on non-function operations

### Quality Metrics
- ✅ **SC10**: Zero security vulnerabilities in bytecode handling
- ✅ **SC11**: 100% backward compatibility with existing persistence API
- ✅ **SC12**: Comprehensive documentation with 10+ examples
- ✅ **SC13**: Error recovery for all failure modes

## Risk Assessment

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Bytecode format changes between Lua versions | Low | High | Version detection and compatibility layer |
| Security vulnerabilities from bytecode execution | Medium | High | Bytecode validation and sandboxing |
| Performance degradation for large functions | Medium | Medium | Lazy loading and caching strategies |
| Upvalue reference corruption | Medium | High | Reference tracking and validation |

### Project Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Complexity exceeds estimates | Medium | Medium | Phased implementation with MVPs |
| Breaking changes required | Low | High | Feature flags for gradual rollout |
| Limited browser storage quota | Low | Medium | Compression and cleanup strategies |

## Conclusion

The implementation of Lua function persistence through `string.dump` and binary storage represents a natural evolution of the external memory table system. This solution leverages Lua's native capabilities while maintaining the security and performance characteristics required for production use.

The phased approach ensures that each component can be thoroughly tested before integration, minimizing risk to the existing system. With proper bytecode validation and C function handling, this implementation will enable complete Lua application state persistence—a significant advancement for browser-based Lua applications.

### Next Steps
1. Review and approve this PRP
2. Set up development branch `feature/function-persistence`
3. Begin Phase 1 implementation
4. Schedule weekly progress reviews

### Resources Required
- 1 senior developer (4 weeks)
- Access to Lua 5.4.6 documentation
- Browser testing environment (Chrome, Firefox, Safari)
- Security review from the security team (Week 3)

---

*Document Version: 1.0*  
*Date: 2024*  
*Author: Project Architecture Team*  
*Status: PENDING REVIEW*