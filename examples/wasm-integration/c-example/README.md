# C + WAMR Integration Example

Example of integrating `lua.wasm` with C using WAMR (WebAssembly Micro Runtime).

## Features

- Native C implementation of all 5 host functions
- Manual memory management (no garbage collection)
- Minimal dependencies
- Fixed-size data structures for predictable performance
- Suitable for embedded systems and low-level integration

## Prerequisites

- GCC or Clang compiler
- Make
- WAMR (WebAssembly Micro Runtime)

## Installing WAMR

WAMR is required for full WASM integration:

```bash
# Clone WAMR repository
git clone https://github.com/bytecodealliance/wasm-micro-runtime.git
cd wasm-micro-runtime

# Build for Linux
cd product-mini/platforms/linux
mkdir build && cd build
cmake ..
make

# Note the installation path (e.g., /path/to/wasm-micro-runtime)
```

Then update the `WAMR_DIR` variable in the Makefile to point to your installation.

## Building

### Without WAMR (Host Functions Only)

You can compile and test the host functions without WAMR:

```bash
make compile-check
```

### With WAMR (Full Integration)

Once WAMR is installed:

```bash
# Set WAMR_DIR in Makefile, then:
make
```

Or specify the path directly:

```bash
make WAMR_DIR=/path/to/wasm-micro-runtime
```

## Running

```bash
./lua-wasm-demo
```

## Current State

This example currently demonstrates:

1. **Complete host function implementations** - All 5 required functions fully implemented
2. **External table storage** - Using fixed-size arrays and simple hash tables
3. **Standalone testing** - Host functions can be tested without WASM
4. **C code structure** - Shows how to organize a C integration

The WAMR integration code (loading WASM, calling exports) is not yet implemented but follows a standard pattern (see WAMR documentation).

## Project Structure

```
c-example/
├── Makefile           # Build configuration
├── main.c             # Complete implementation
├── README.md          # This file
└── lua.wasm          # Copy from ../../web/lua.wasm
```

## Host Functions Implementation

All 5 host functions are fully implemented in `main.c`:

### 1. js_ext_table_set

```c
static int32_t host_ext_table_set(
    uint32_t table_id,
    const uint8_t* key_ptr,
    uint32_t key_len,
    const uint8_t* val_ptr,
    uint32_t val_len
);
```

Stores a key-value pair using:
- Fixed-size table entries (MAX_TABLE_ENTRIES = 256)
- Linear search for key lookup
- In-place updates for existing keys

### 2. js_ext_table_get

```c
static int32_t host_ext_table_get(
    uint32_t table_id,
    const uint8_t* key_ptr,
    uint32_t key_len,
    uint8_t* val_ptr,
    uint32_t max_len
);
```

Retrieves a value by key:
- Returns bytes written on success
- Returns -1 if not found
- Validates buffer size before copying

### 3. js_ext_table_delete

```c
static int32_t host_ext_table_delete(
    uint32_t table_id,
    const uint8_t* key_ptr,
    uint32_t key_len
);
```

Deletes an entry:
- Marks entry as unused
- Decrements table count
- Returns 0 on success

### 4. js_ext_table_size

```c
static int32_t host_ext_table_size(uint32_t table_id);
```

Returns the number of entries in a table.

### 5. js_ext_table_keys

```c
static int32_t host_ext_table_keys(
    uint32_t table_id,
    uint8_t* buf_ptr,
    uint32_t max_len
);
```

Serializes all keys as newline-separated strings.

## Data Structures

### External Table Entry

```c
typedef struct {
    char key[MAX_KEY_LEN];        // Key as C string
    uint8_t value[MAX_VAL_LEN];   // Serialized value
    uint32_t value_len;           // Value length
    bool used;                     // Entry in use?
} TableEntry;
```

### External Table

```c
typedef struct {
    uint32_t id;                              // Table ID
    TableEntry entries[MAX_TABLE_ENTRIES];    // Fixed array
    uint32_t count;                           // Number of entries
    bool used;                                 // Table allocated?
} ExternalTable;
```

### Configuration

```c
#define MAX_TABLES 16              // Maximum number of tables
#define MAX_TABLE_ENTRIES 256      // Entries per table
#define MAX_KEY_LEN 256            // Maximum key length
#define MAX_VAL_LEN 4096           // Maximum value length
```

Adjust these constants based on your requirements.

## Memory Management

This implementation uses:

- **Static allocation** - All tables pre-allocated in global array
- **No malloc/free** - Suitable for embedded systems
- **Fixed limits** - Predictable memory usage
- **No fragmentation** - Constant memory footprint

Total memory usage: approximately 1.3 MB for external tables.

## Integration Pattern

When WAMR is installed, the integration follows this pattern:

```c
/* 1. Initialize WAMR runtime */
wasm_runtime_init();

/* 2. Load WASM module */
wasm_module_t module = wasm_runtime_load(wasm_buffer, wasm_size, error, sizeof(error));

/* 3. Register host functions */
NativeSymbol natives[] = {
    {"js_ext_table_set", host_ext_table_set, "(iiiii)i", NULL},
    {"js_ext_table_get", host_ext_table_get, "(iiiii)i", NULL},
    // ... etc
};
wasm_runtime_register_natives("env", natives, sizeof(natives)/sizeof(NativeSymbol));

/* 4. Instantiate module */
wasm_module_inst_t instance = wasm_runtime_instantiate(module, stack_size, heap_size, error, sizeof(error));

/* 5. Call exports */
wasm_function_inst_t init_func = wasm_runtime_lookup_function(instance, "init", NULL);
wasm_runtime_call_wasm(exec_env, init_func, 0, NULL);
```

See WAMR documentation for complete details.

## Expected Output (Standalone Mode)

```
Lua WASM Integration Example (C + WAMR)
========================================

NOTE: This is a standalone demonstration of the host functions.
For full WASM integration, install WAMR and rebuild.
See README.md for instructions.

=== Testing Host Functions ===

Test 1: Set and Get
  Set 'counter' = <9 bytes>: ✓
  Get 'counter': ✓ (9 bytes)

Test 2: Table Size
  Table 1 size: 1 entries ✓

Test 3: Multiple Entries
  Set 'name' = 'Lua WASM': ✓
  Table size after insert: 2 entries ✓

Test 4: List Keys
  Keys (14 bytes):
    - 'counter'
    - 'name'

Test 5: Delete Entry
  Delete 'counter': ✓
  Table size after delete: 1 entries ✓

Test 6: Multiple Tables
  Set key in table 2: ✓
  Table 1 size: 1 entries
  Table 2 size: 1 entries

✓ All host function tests passed!
```

## Advantages of C Integration

- **Performance** - Minimal overhead, near-native speed
- **Control** - Fine-grained memory and resource management
- **Portability** - Compiles to many platforms
- **Embedded** - Suitable for resource-constrained systems
- **Legacy** - Easy to integrate with existing C codebases

## Disadvantages

- **Manual management** - No automatic memory management
- **Fixed limits** - Must define maximum sizes at compile time
- **Complexity** - More verbose than high-level languages
- **Safety** - Requires careful bounds checking

## Optimization Opportunities

For production use, consider:

1. **Hash table** - Replace linear search with proper hash table
2. **Dynamic allocation** - Use malloc/free for variable-size tables
3. **String interning** - Reduce key storage duplication
4. **LRU cache** - For frequently accessed values
5. **Memory pools** - Pre-allocate common sizes

## Further Integration

To complete the WAMR integration:

1. Link against WAMR library (`libvmlib.a`)
2. Add WAMR initialization code
3. Register native symbols for host functions
4. Load and instantiate lua.wasm
5. Call init() and compute() exports
6. Handle results and errors

See the Rust example for a complete working implementation pattern.

## Resources

- [WAMR GitHub](https://github.com/bytecodealliance/wasm-micro-runtime)
- [WAMR Documentation](https://github.com/bytecodealliance/wasm-micro-runtime/blob/main/doc/README.md)
- [WASM Exports Reference](../../../docs/WASM_EXPORTS_REFERENCE.md)
- [Host Function Imports](../../../docs/HOST_FUNCTION_IMPORTS.md)

## License

Same as the main project (see LICENSE).
