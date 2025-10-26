# Go + wazero Integration Example

Complete example of integrating `lua.wasm` with Go using [wazero](https://wazero.io/) - a zero-dependency WebAssembly runtime for Go.

## Features

- Pure Go implementation (no CGo required)
- Cross-platform support (Linux, macOS, Windows)
- Type-safe host function implementations
- External table storage using Go maps
- Idiomatic Go error handling
- Minimal dependencies

## Prerequisites

- Go 1.21 or later
- lua.wasm file (built from the main project)

## Installing

```bash
cd examples/wasm-integration/go-example

# Download dependencies
go mod download

# Build
go build
```

## Running

```bash
go run main.go
```

Or run the compiled binary:

```bash
./go-example   # Linux/macOS
go-example.exe # Windows
```

## Project Structure

```
go-example/
├── go.mod            # Go module definition
├── main.go           # Complete implementation
├── README.md         # This file
└── lua.wasm         # Copy or symlink from ../../web/lua.wasm
```

## How It Works

### 1. Creating the Runtime

```go
r := wazero.NewRuntime(ctx)
defer r.Close(ctx)
```

### 2. Registering Host Functions

wazero uses a builder pattern to register host functions:

```go
_, err := r.NewHostModuleBuilder("env").
    NewFunctionBuilder().
    WithFunc(tables.jsExtTableSet).
    Export("js_ext_table_set").
    // ... more functions
    Instantiate(ctx)
```

### 3. Loading and Instantiating WASM

```go
wasmBytes, _ := os.ReadFile("lua.wasm")
compiledModule, _ := r.CompileModule(ctx, wasmBytes)
mod, _ := r.InstantiateModule(ctx, compiledModule, wazero.NewModuleConfig())
```

### 4. Calling Exports

```go
initFunc := mod.ExportedFunction("init")
results, err := initFunc.Call(ctx)
```

### 5. Memory Access

Reading from WASM memory:

```go
memory := mod.Memory()
bytes, ok := memory.Read(ptr, length)
```

Writing to WASM memory:

```go
ok := memory.Write(ptr, bytes)
```

## External Table Storage

Tables are stored in a Go struct with nested maps:

```go
type ExternalTables struct {
    tables map[uint32]map[string][]byte
}
```

- Outer map: table ID → table data
- Inner map: string key → serialized value bytes

## Host Functions Implementation

All 5 required host functions are implemented as methods on `ExternalTables`:

### js_ext_table_set

```go
func (et *ExternalTables) jsExtTableSet(
    ctx context.Context,
    m api.Module,
    tableID, keyPtr, keyLen, valPtr, valLen uint32,
) uint32
```

Stores a key-value pair:
1. Read key from WASM memory
2. Read value from WASM memory
3. Copy value bytes (important!)
4. Store in map
5. Return 0 on success

### js_ext_table_get

```go
func (et *ExternalTables) jsExtTableGet(
    ctx context.Context,
    m api.Module,
    tableID, keyPtr, keyLen, valPtr, maxLen uint32,
) uint32
```

Retrieves a value:
1. Read key from WASM memory
2. Lookup in map
3. Check buffer size
4. Write value to WASM memory
5. Return bytes written, or 0xFFFFFFFF (-1) if not found

### js_ext_table_delete

```go
func (et *ExternalTables) jsExtTableDelete(
    ctx context.Context,
    m api.Module,
    tableID, keyPtr, keyLen uint32,
) uint32
```

Deletes a key using Go's built-in `delete()`.

### js_ext_table_size

```go
func (et *ExternalTables) jsExtTableSize(
    ctx context.Context,
    m api.Module,
    tableID uint32,
) uint32
```

Returns `len(table)`.

### js_ext_table_keys

```go
func (et *ExternalTables) jsExtTableKeys(
    ctx context.Context,
    m api.Module,
    tableID, bufPtr, maxLen uint32,
) uint32
```

Serializes keys as newline-separated strings using `strings.Join()`.

## Error Handling

The example uses idiomatic Go error handling:

```go
if err := runLuaWasm(ctx, tables); err != nil {
    fmt.Fprintf(os.Stderr, "Error: %v\n", err)
    os.Exit(1)
}
```

Errors are wrapped with context using `fmt.Errorf()` and `%w`.

## Expected Output

```
Lua WASM Integration Example (Go + wazero)
===========================================

✓ Loaded lua.wasm from: ../../../web/lua.wasm
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

=== Example 3: External Table Persistence (1st call) ===
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 1

=== Example 4: External Table Persistence (2nd call) ===
Lua code: _home.counter = (_home.counter or 0) + 1; return _home.counter
✓ Result: 9 bytes returned
  Number value: 2

=== Example 5: Error Handling ===
Lua code: return 1 / 0
✓ Result: 9 bytes returned
  Number value: +Inf

=== Memory Statistics ===
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

## Advantages of Go + wazero

- **No CGo** - Pure Go means easy cross-compilation
- **No dependencies** - wazero has no external dependencies
- **Type safety** - Go's strong typing catches errors at compile time
- **Performance** - wazero uses JIT compilation on supported platforms
- **Simplicity** - Clean, idiomatic Go code
- **Cross-platform** - Works on Linux, macOS, Windows, and more

## Dependencies

From `go.mod`:

```go
require github.com/tetratelabs/wazero v1.8.0
```

That's it - just one dependency!

## Performance Notes

wazero provides excellent performance:
- JIT compilation on amd64 and arm64
- Interpreter fallback for other architectures
- Minimal overhead for host function calls
- Efficient memory access

## Integration with Go Applications

To integrate into your Go application:

1. Add wazero dependency: `go get github.com/tetratelabs/wazero`
2. Copy the host function implementations
3. Adapt external table storage (e.g., use Redis, database)
4. Embed lua.wasm using `go:embed`
5. Call from your application logic

### Example: Embedding WASM

```go
import _ "embed"

//go:embed lua.wasm
var luaWasmBytes []byte

func loadWasmFile() ([]byte, error) {
    return luaWasmBytes, nil
}
```

## Concurrency Considerations

The current implementation is not thread-safe. For concurrent use:

1. Wrap `ExternalTables` with a mutex:

```go
type ExternalTables struct {
    mu     sync.RWMutex
    tables map[uint32]map[string][]byte
}

func (et *ExternalTables) jsExtTableSet(...) uint32 {
    et.mu.Lock()
    defer et.mu.Unlock()
    // ... implementation
}
```

2. Or use a separate WASM instance per goroutine

3. Or use `sync.Map` for lock-free access

## Troubleshooting

**Error: "could not find lua.wasm"**

Solution: Copy or symlink the WASM file:

```bash
ln -s ../../../web/lua.wasm ./lua.wasm
# or
cp ../../../web/lua.wasm ./lua.wasm
```

**Error: "failed to instantiate module"**

Solution: Ensure all 5 host functions are registered before instantiation.

**Module download issues**

Solution: Use a Go proxy or download manually:

```bash
GOPROXY=https://proxy.golang.org go mod download
```

## Further Reading

- [wazero Documentation](https://wazero.io/)
- [wazero Examples](https://github.com/tetratelabs/wazero/tree/main/examples)
- [WASM Exports Reference](../../../docs/WASM_EXPORTS_REFERENCE.md)
- [Host Function Imports](../../../docs/HOST_FUNCTION_IMPORTS.md)

## License

Same as the main project (see LICENSE).
