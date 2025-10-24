# Lua WASM Memory Management Guide

## Overview

This guide explains the custom memory management system implemented for the Lua WebAssembly module.

## Architecture

### Memory Layout

```
WebAssembly Linear Memory (2MB)
├── Code Segment
├── Data Segment  
├── Static Malloc Pool (512KB)
│   ├── Lua State
│   ├── Lua Objects
│   └── String Pool
└── I/O Buffer (64KB)
```

### Allocator Design

The project uses a simple bump allocator with the following characteristics:

- **Type**: Sequential allocation (bump pointer)
- **Size**: 512KB static pool
- **Deallocation**: No-op (memory not reclaimed)
- **Thread Safety**: Not required (single-threaded WASM)

## Implementation Details

### Core Functions

```zig
// Primary allocators (exported)
export fn lua_malloc(size: usize) ?*anyopaque
export fn lua_realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque  
export fn lua_free(ptr: ?*anyopaque) void

// C compatibility wrappers (exported)
export fn malloc(size: usize) ?*anyopaque
export fn realloc(ptr: ?*anyopaque, size: usize) ?*anyopaque
export fn free(ptr: ?*anyopaque) void
```

### Lua Integration

```zig
// Custom allocator for Lua
export fn lua_alloc(ud: ?*anyopaque, ptr: ?*anyopaque, 
                   osize: usize, nsize: usize) ?*anyopaque {
    if (nsize == 0) {
        lua_free(ptr);
        return null;
    }
    return lua_realloc(ptr, nsize);
}

// Initialize Lua with custom allocator
const L = lua.c.lua_newstate(lua_alloc, null);
```

## Why This Approach?

### Problem
- Lua C code expected to import malloc/free from environment
- WASM module also exported malloc/free
- Linker used imports, which failed

### Solution  
- Rename internal allocators (lua_malloc, etc.)
- Export both renamed and standard versions
- Configure Lua to use custom allocator
- No import/export conflicts

## Usage Guidelines

### For Zig Code
```zig
// Use lua_malloc directly
const buffer = lua_malloc(1024);

// Or use through Lua's allocator
const ptr = lua_alloc(null, null, 0, size);
```

### For C Code
```c
// Standard functions work normally
void* ptr = malloc(size);
free(ptr);
```

### Memory Limits
- Total pool: 512KB
- Largest single allocation: ~500KB
- No memory reclamation
- Plan for one-shot execution

## Debugging

### Check Memory Usage
```zig
pub fn malloc_stats() usize {
    return malloc_ptr;  // Bytes allocated
}

pub fn malloc_remaining() usize {
    return MALLOC_POOL_SIZE -| malloc_ptr;
}
```

### Common Issues

1. **Out of Memory**
   - Symptom: malloc returns null
   - Cause: Exceeded 512KB limit
   - Fix: Increase MALLOC_POOL_SIZE

2. **Memory Leaks**
   - Symptom: Memory usage grows
   - Cause: free() is no-op
   - Fix: Design for stateless execution

3. **Allocation Failures**
   - Check remaining memory
   - Verify allocation size
   - Consider memory fragmentation

## Future Improvements

1. **Proper Free List** - Track freed blocks
2. **Memory Compaction** - Reduce fragmentation  
3. **Dynamic Growth** - Use memory.grow
4. **Statistics** - Track peak usage

## Related Documentation

- `MEMORY_FIX_IMPLEMENTATION_REPORT.md` - Full implementation details
- `src/libc-stubs.zig` - Source code
- `PRPs/lua-wasm-memory-fix-prp.md` - Original design