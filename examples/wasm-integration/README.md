# WASM Integration Examples

This directory contains complete, working examples of integrating `lua.wasm` with different programming languages and runtimes.

## Examples

Each example demonstrates:
- Loading the lua.wasm module
- Implementing the 5 required host functions
- Initializing the Lua VM
- Executing Lua code via compute()
- Proper error handling
- Memory management

### 1. Rust + wasmtime

**Path:** `rust-example/`

Uses the `wasmtime` runtime to load lua.wasm from Rust. Shows:
- Type-safe host function implementations
- Proper memory handling with Wasmtime's Memory API
- Error propagation
- External table storage using HashMap

**Build:** `cd rust-example && cargo build --release`
**Run:** `cargo run`

### 2. C + WAMR

**Path:** `c-example/`

Uses WebAssembly Micro Runtime (WAMR) to embed lua.wasm in C applications. Shows:
- Native C implementations of host functions
- Manual memory management
- Integration with C codebases
- Minimal overhead embedding

**Build:** `cd c-example && make`
**Run:** `./lua-wasm-demo`

### 3. Go + wazero

**Path:** `go-example/`

Uses the pure-Go `wazero` runtime (no CGo required). Shows:
- Idiomatic Go host function bridges
- Go-style error handling
- External table storage using Go maps
- Cross-platform deployment

**Build:** `cd go-example && go build`
**Run:** `./go-example`

### 4. Node.js Bare WASM

**Path:** `nodejs-example/`

Uses Node.js built-in WebAssembly API directly (no frameworks). Shows:
- Difference from high-level lua-api.js wrapper
- Direct WASM memory access
- Buffer management
- Minimal dependencies

**Run:** `cd nodejs-example && node index.js`

## Host Functions Required

All examples must implement these 5 host functions in the `env` import namespace:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `js_ext_table_set` | `(u32, ptr, len, ptr, len) -> i32` | Store key-value pair in external table |
| `js_ext_table_get` | `(u32, ptr, len, ptr, len) -> i32` | Retrieve value from external table |
| `js_ext_table_delete` | `(u32, ptr, len) -> i32` | Delete key from external table |
| `js_ext_table_size` | `(u32) -> i32` | Get number of entries in table |
| `js_ext_table_keys` | `(u32, ptr, len) -> i32` | Get all keys from table |

See [docs/HOST_FUNCTION_IMPORTS.md](../../docs/HOST_FUNCTION_IMPORTS.md) for detailed specifications.

## Common Patterns

### Initialization Sequence

```
1. Load lua.wasm module
2. Provide host function implementations
3. Instantiate WASM with imports
4. Call init() export (returns 0 on success)
5. Get buffer pointer and size
6. Ready to execute Lua code
```

### Executing Lua Code

```
1. Encode Lua code as UTF-8 bytes
2. Write bytes to WASM buffer (at buffer_ptr)
3. Call compute(buffer_ptr, code_length)
4. Check return value:
   - Negative: Error (read error message from buffer)
   - Positive: Success (parse result from buffer)
   - Zero: No result
```

## WASM File Location

All examples expect `lua.wasm` to be available. You can:

1. Copy from build output: `cp ../../web/lua.wasm ./`
2. Symlink: `ln -s ../../web/lua.wasm ./`
3. Provide custom path in code

## Memory Layout

- Total WASM memory: 2 MB (32 pages × 64 KB)
- I/O buffer size: 64 KB
- Buffer location: Available via `get_buffer_ptr()` export

## External Table Storage

The external table system allows Lua tables to be stored outside WASM memory:

- Tables are identified by numeric IDs (u32)
- Keys are serialized as UTF-8 strings
- Values are serialized in custom binary format
- Host language stores the actual data structures

This enables:
- State persistence across WASM restarts
- Larger data structures than WASM memory allows
- Integration with host-side storage systems

## Testing

Each example includes test cases demonstrating:
- Basic arithmetic
- String operations
- External table persistence
- Error handling
- Memory statistics

## Resources

- [WASM Exports Reference](../../docs/WASM_EXPORTS_REFERENCE.md)
- [Host Function Imports](../../docs/HOST_FUNCTION_IMPORTS.md)
- [API Reference](../../docs/API_REFERENCE.md)
- [Memory Protocol](../../docs/MEMORY_PROTOCOL.md)

## Contributing

To add a new language example:

1. Create a new directory: `language-example/`
2. Implement all 5 host functions
3. Create a complete README.md with build/run instructions
4. Include example Lua code execution
5. Test on multiple platforms if possible
6. Update this README.md with the new example

## License

All examples are provided under the same license as the main project (see LICENSE).
