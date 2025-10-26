# Rust + wasmtime Integration Example

Complete example of integrating `lua.wasm` with Rust using the [wasmtime](https://wasmtime.dev/) runtime.

## Features

- Type-safe WASM integration using wasmtime
- Full implementation of all 5 host functions
- External table storage using Rust `HashMap`
- Proper error handling with `anyhow`
- Memory-safe WASM memory access
- Comprehensive examples

## Prerequisites

- Rust 1.70+ (install from https://rustup.rs/)
- lua.wasm file (built from the main project)

## Building

```bash
cd examples/wasm-integration/rust-example
cargo build --release
```

## Running

```bash
cargo run
```

Or run the compiled binary directly:

```bash
./target/release/lua-wasm-demo
```

## Project Structure

```
rust-example/
├── Cargo.toml          # Dependencies and project metadata
├── src/
│   └── main.rs         # Main implementation
├── README.md           # This file
└── lua.wasm           # Copy or symlink from ../../web/lua.wasm
```

## How It Works

### 1. Loading the Module

```rust
let engine = Engine::default();
let module = Module::from_file(&engine, "./lua.wasm")?;
```

### 2. Implementing Host Functions

Each of the 5 required host functions is implemented using `linker.func_wrap`:

```rust
linker.func_wrap(
    "env",                    // Import namespace
    "js_ext_table_set",       // Function name
    move |caller, table_id, key_ptr, key_len, val_ptr, val_len| -> i32 {
        // Implementation
        0 // Return value
    },
)?;
```

### 3. External Table Storage

Tables are stored in a `HashMap<u32, HashMap<String, Vec<u8>>>`:

- Outer map: table ID → table data
- Inner map: string key → serialized value bytes

Thread-safe access using `Arc<Mutex<...>>`.

### 4. Memory Access

Reading from WASM memory:

```rust
let memory = caller.get_export("memory")
    .and_then(|e| e.into_memory())
    .expect("memory export");

let bytes = memory.data(&caller)
    .get(ptr as usize..(ptr + len) as usize)
    .expect("read");
```

Writing to WASM memory:

```rust
memory.data_mut(&mut caller)
    .get_mut(ptr as usize..(ptr + len as usize))
    .expect("write")
    .copy_from_slice(&bytes);
```

### 5. Executing Lua Code

```rust
// Write code to buffer
let code_bytes = code.as_bytes();
memory.data_mut(store)[buffer_ptr..buffer_ptr + code_bytes.len()]
    .copy_from_slice(code_bytes);

// Execute
let compute = instance.get_typed_func::<(i32, i32), i32>(store, "compute")?;
let result_len = compute.call(store, (buffer_ptr as i32, code_bytes.len() as i32))?;

// Handle result
if result_len < 0 {
    // Error case
} else if result_len > 0 {
    // Success - parse result
}
```

## Host Functions Implementation

### js_ext_table_set

Stores a key-value pair in the external table:

1. Read key from WASM memory (UTF-8 string)
2. Read value from WASM memory (serialized bytes)
3. Store in HashMap
4. Return 0 on success

### js_ext_table_get

Retrieves a value by key:

1. Read key from WASM memory
2. Lookup in HashMap
3. Write value to WASM memory if found
4. Return bytes written, or -1 if not found

### js_ext_table_delete

Deletes a key from the table:

1. Read key from WASM memory
2. Remove from HashMap
3. Return 0 on success

### js_ext_table_size

Returns the number of entries in a table:

1. Lookup table by ID
2. Return entry count

### js_ext_table_keys

Returns all keys (serialized):

1. Lookup table by ID
2. Serialize keys (newline-separated)
3. Write to WASM memory
4. Return bytes written, or -1 on error

## Examples Demonstrated

The program runs several examples:

1. **Basic Arithmetic** - Simple calculation
2. **String Operations** - String concatenation
3. **External Table Persistence** - Counter that persists across calls
4. **Error Handling** - Division by zero
5. **Memory Statistics** - Display WASM memory info

## Expected Output

```
Lua WASM Integration Example (Rust + wasmtime)

✓ Loaded lua.wasm from: ../../../web/lua.wasm

Initializing Lua VM...
✓ Lua VM initialized successfully

Buffer info:
  Pointer: 0x...
  Size: 65536 bytes

=== Example 1: Basic Arithmetic ===
Lua code: return 2 + 2
✓ Result: 9 bytes returned
  Number value: 4

=== Example 2: String Operations ===
Lua code: return 'Hello ' .. 'from Lua!'
✓ Result: 20 bytes returned
  String value: 'Hello from Lua!'

=== Example 3: External Table Persistence ===
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 1
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 2

=== Example 4: Error Handling ===
Lua code: return 1 / 0
✓ Result: 9 bytes returned
  Number value: inf

=== Example 5: Memory Statistics ===
Memory Statistics:
  I/O Buffer Size: 65536 bytes (64 KB)
  Lua Memory Used: 0 bytes
  WASM Pages: 32 (2 MB)
  Total WASM Memory: 2097152 bytes (2 MB)

=== External Table Contents ===
Table ID 1: 1 entries
  'counter': 9 bytes

✓ All examples completed successfully!
```

## Dependencies

From `Cargo.toml`:

- **wasmtime** (26.0.0) - WASM runtime
- **anyhow** (1.0) - Error handling

## Error Handling

The example uses `Result<()>` and the `?` operator for propagating errors:

- File loading errors
- WASM instantiation errors
- Runtime execution errors
- Memory access errors

All errors are wrapped in `anyhow::Error` for easy reporting.

## Performance Notes

- wasmtime provides near-native execution speed
- Minimal overhead for host function calls
- Efficient memory access through direct buffer slicing
- No garbage collection pauses (except Lua's internal GC)

## Integration with Existing Rust Code

To integrate into your Rust application:

1. Add dependencies to your `Cargo.toml`
2. Copy the host function implementations
3. Adapt the external table storage to your needs (e.g., use a database)
4. Call Lua code from your application logic

## Troubleshooting

**Error: "Could not find lua.wasm"**

Solution: Copy or symlink the WASM file:

```bash
ln -s ../../../web/lua.wasm ./lua.wasm
# or
cp ../../../web/lua.wasm ./lua.wasm
```

**Error: "memory export not found"**

Solution: Ensure you're using the correct lua.wasm build. The memory must be exported from the WASM module.

**Compilation errors**

Solution: Update Rust to the latest stable version:

```bash
rustup update stable
```

## Further Reading

- [Wasmtime Documentation](https://docs.wasmtime.dev/)
- [Wasmtime Rust API](https://docs.rs/wasmtime/)
- [WASM Exports Reference](../../../docs/WASM_EXPORTS_REFERENCE.md)
- [Host Function Imports](../../../docs/HOST_FUNCTION_IMPORTS.md)

## License

Same as the main project (see LICENSE).
