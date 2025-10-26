// Go integration example for lua.wasm using wazero
//
// This example demonstrates:
// - Loading lua.wasm with wazero (pure Go, no CGo)
// - Implementing all 5 host functions in Go
// - External table storage using Go maps
// - Executing Lua code and handling results
// - Idiomatic Go error handling

package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"strings"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

// ExternalTables stores all external tables
type ExternalTables struct {
	tables map[uint32]map[string][]byte
}

// NewExternalTables creates a new external table storage
func NewExternalTables() *ExternalTables {
	return &ExternalTables{
		tables: make(map[uint32]map[string][]byte),
	}
}

// GetOrCreateTable returns a table by ID, creating it if necessary
func (et *ExternalTables) GetOrCreateTable(tableID uint32) map[string][]byte {
	if table, exists := et.tables[tableID]; exists {
		return table
	}
	table := make(map[string][]byte)
	et.tables[tableID] = table
	return table
}

// GetTable returns a table by ID, or nil if not found
func (et *ExternalTables) GetTable(tableID uint32) map[string][]byte {
	return et.tables[tableID]
}

func main() {
	fmt.Println("Lua WASM Integration Example (Go + wazero)")
	fmt.Println("===========================================\n")

	ctx := context.Background()

	// Create external table storage
	tables := NewExternalTables()

	// Load and run WASM module
	if err := runLuaWasm(ctx, tables); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\n✓ All examples completed successfully!")
}

func runLuaWasm(ctx context.Context, tables *ExternalTables) error {
	// Create wazero runtime
	r := wazero.NewRuntime(ctx)
	defer r.Close(ctx)

	// Instantiate WASI (optional, but some modules may expect it)
	wasi_snapshot_preview1.Instantiate(ctx, r)

	// Create host function module
	_, err := r.NewHostModuleBuilder("env").
		NewFunctionBuilder().
		WithFunc(tables.jsExtTableSet).
		Export("js_ext_table_set").
		NewFunctionBuilder().
		WithFunc(tables.jsExtTableGet).
		Export("js_ext_table_get").
		NewFunctionBuilder().
		WithFunc(tables.jsExtTableDelete).
		Export("js_ext_table_delete").
		NewFunctionBuilder().
		WithFunc(tables.jsExtTableSize).
		Export("js_ext_table_size").
		NewFunctionBuilder().
		WithFunc(tables.jsExtTableKeys).
		Export("js_ext_table_keys").
		Instantiate(ctx)

	if err != nil {
		return fmt.Errorf("failed to instantiate host functions: %w", err)
	}

	// Load lua.wasm
	wasmBytes, err := loadWasmFile()
	if err != nil {
		return err
	}

	// Compile module
	compiledModule, err := r.CompileModule(ctx, wasmBytes)
	if err != nil {
		return fmt.Errorf("failed to compile module: %w", err)
	}
	defer compiledModule.Close(ctx)

	// Instantiate module
	mod, err := r.InstantiateModule(ctx, compiledModule, wazero.NewModuleConfig())
	if err != nil {
		return fmt.Errorf("failed to instantiate module: %w", err)
	}
	defer mod.Close(ctx)

	fmt.Println("✓ Loaded lua.wasm\n")

	// Initialize Lua VM
	fmt.Println("Initializing Lua VM...")
	initFunc := mod.ExportedFunction("init")
	if initFunc == nil {
		return fmt.Errorf("init function not found")
	}

	results, err := initFunc.Call(ctx)
	if err != nil {
		return fmt.Errorf("init failed: %w", err)
	}

	if results[0] != 0 {
		return fmt.Errorf("init returned error: %d", results[0])
	}

	fmt.Println("✓ Lua VM initialized successfully\n")

	// Get buffer info
	getBufferPtr := mod.ExportedFunction("get_buffer_ptr")
	getBufferSize := mod.ExportedFunction("get_buffer_size")

	bufferPtrResults, err := getBufferPtr.Call(ctx)
	if err != nil {
		return fmt.Errorf("get_buffer_ptr failed: %w", err)
	}
	bufferPtr := uint32(bufferPtrResults[0])

	bufferSizeResults, err := getBufferSize.Call(ctx)
	if err != nil {
		return fmt.Errorf("get_buffer_size failed: %w", err)
	}
	bufferSize := uint32(bufferSizeResults[0])

	fmt.Printf("Buffer info:\n")
	fmt.Printf("  Pointer: 0x%x\n", bufferPtr)
	fmt.Printf("  Size: %d bytes\n\n", bufferSize)

	// Run examples
	compute := mod.ExportedFunction("compute")
	memory := mod.Memory()

	examples := []struct {
		name string
		code string
	}{
		{"Basic Arithmetic", "return 2 + 2"},
		{"String Operations", "return 'Hello ' .. 'from Lua!'"},
		{"External Table Persistence (1st call)", "_home.counter = (_home.counter or 0) + 1; return _home.counter"},
		{"External Table Persistence (2nd call)", "_home.counter = (_home.counter or 0) + 1; return _home.counter"},
		{"Error Handling", "return 1 / 0"},
	}

	for i, ex := range examples {
		fmt.Printf("=== Example %d: %s ===\n", i+1, ex.name)
		if err := executeLua(ctx, compute, memory, bufferPtr, bufferSize, ex.code); err != nil {
			return err
		}
		fmt.Println()
	}

	// Show memory stats
	fmt.Println("=== Memory Statistics ===")
	if err := showMemoryStats(ctx, mod, bufferPtr); err != nil {
		return err
	}

	// Show external table contents
	fmt.Println("\n=== External Table Contents ===")
	for tableID, table := range tables.tables {
		fmt.Printf("Table ID %d: %d entries\n", tableID, len(table))
		for key, value := range table {
			fmt.Printf("  '%s': %d bytes\n", key, len(value))
		}
	}

	return nil
}

// loadWasmFile loads lua.wasm from various possible locations
func loadWasmFile() ([]byte, error) {
	paths := []string{
		"../../../web/lua.wasm",
		"../../web/lua.wasm",
		"./lua.wasm",
	}

	for _, path := range paths {
		if data, err := os.ReadFile(path); err == nil {
			fmt.Printf("✓ Loaded lua.wasm from: %s\n", path)
			return data, nil
		}
	}

	return nil, fmt.Errorf("could not find lua.wasm in any of: %v", paths)
}

// executeLua executes Lua code and displays results
func executeLua(ctx context.Context, compute api.Function, memory api.Memory, bufferPtr, bufferSize uint32, code string) error {
	fmt.Printf("Lua code: %s\n", code)

	codeBytes := []byte(code)
	if uint32(len(codeBytes)) > bufferSize {
		return fmt.Errorf("code too large for buffer")
	}

	// Write code to buffer
	if !memory.Write(bufferPtr, codeBytes) {
		return fmt.Errorf("failed to write code to buffer")
	}

	// Execute
	results, err := compute.Call(ctx, uint64(bufferPtr), uint64(len(codeBytes)))
	if err != nil {
		return fmt.Errorf("compute failed: %w", err)
	}

	resultLen := int32(results[0])

	// Handle result
	if resultLen < 0 {
		// Error
		errorLen := -resultLen - 1
		errorBytes, ok := memory.Read(bufferPtr, uint32(errorLen))
		if !ok {
			return fmt.Errorf("failed to read error message")
		}
		fmt.Printf("✗ Lua error: %s\n", string(errorBytes))
	} else if resultLen > 0 {
		// Success
		resultBytes, ok := memory.Read(bufferPtr, uint32(resultLen))
		if !ok {
			return fmt.Errorf("failed to read result")
		}

		// First 4 bytes are output length
		outputLen := binary.LittleEndian.Uint32(resultBytes[0:4])

		if outputLen > 0 {
			output := string(resultBytes[4 : 4+outputLen])
			fmt.Printf("Output: %s", strings.TrimSpace(output))
			fmt.Println()
		}

		// Parse return value (simplified)
		if uint32(len(resultBytes)) > 4+outputLen {
			returnBytes := resultBytes[4+outputLen:]
			fmt.Printf("✓ Result: %d bytes returned\n", len(returnBytes))

			// Try to parse simple types
			if len(returnBytes) >= 2 {
				typeTag := returnBytes[0]
				switch typeTag {
				case 0x03: // Number
					if len(returnBytes) >= 9 {
						bits := binary.LittleEndian.Uint64(returnBytes[1:9])
						num := math.Float64frombits(bits)
						fmt.Printf("  Number value: %v\n", num)
					}
				case 0x04: // String
					if len(returnBytes) >= 5 {
						strLen := binary.LittleEndian.Uint32(returnBytes[1:5])
						if uint32(len(returnBytes)) >= 5+strLen {
							str := string(returnBytes[5 : 5+strLen])
							fmt.Printf("  String value: '%s'\n", str)
						}
					}
				}
			}
		}
	} else {
		fmt.Println("✓ No result")
	}

	return nil
}

// showMemoryStats displays memory statistics
func showMemoryStats(ctx context.Context, mod api.Module, bufferPtr uint32) error {
	getMemoryStats := mod.ExportedFunction("get_memory_stats")
	memory := mod.Memory()

	// Call get_memory_stats
	_, err := getMemoryStats.Call(ctx, uint64(bufferPtr))
	if err != nil {
		return fmt.Errorf("get_memory_stats failed: %w", err)
	}

	// Read stats (12 bytes: 3 × u32)
	statsBytes, ok := memory.Read(bufferPtr, 12)
	if !ok {
		return fmt.Errorf("failed to read memory stats")
	}

	ioBufferSize := binary.LittleEndian.Uint32(statsBytes[0:4])
	luaMemoryUsed := binary.LittleEndian.Uint32(statsBytes[4:8])
	wasmPages := binary.LittleEndian.Uint32(statsBytes[8:12])

	fmt.Printf("Memory Statistics:\n")
	fmt.Printf("  I/O Buffer Size: %d bytes (%d KB)\n", ioBufferSize, ioBufferSize/1024)
	fmt.Printf("  Lua Memory Used: %d bytes\n", luaMemoryUsed)
	fmt.Printf("  WASM Pages: %d (%d MB)\n", wasmPages, wasmPages*64/1024)
	fmt.Printf("  Total WASM Memory: %d bytes (%d MB)\n", wasmPages*65536, wasmPages*64/1024)

	return nil
}

// Host function implementations

// jsExtTableSet stores a key-value pair
func (et *ExternalTables) jsExtTableSet(ctx context.Context, m api.Module, tableID, keyPtr, keyLen, valPtr, valLen uint32) uint32 {
	memory := m.Memory()

	// Read key
	keyBytes, ok := memory.Read(keyPtr, keyLen)
	if !ok {
		return 1 // Error
	}
	key := string(keyBytes)

	// Read value
	valBytes, ok := memory.Read(valPtr, valLen)
	if !ok {
		return 1 // Error
	}

	// Make a copy of the value bytes
	valueCopy := make([]byte, len(valBytes))
	copy(valueCopy, valBytes)

	// Store in table
	table := et.GetOrCreateTable(tableID)
	table[key] = valueCopy

	return 0 // Success
}

// jsExtTableGet retrieves a value by key
func (et *ExternalTables) jsExtTableGet(ctx context.Context, m api.Module, tableID, keyPtr, keyLen, valPtr, maxLen uint32) uint32 {
	memory := m.Memory()

	// Read key
	keyBytes, ok := memory.Read(keyPtr, keyLen)
	if !ok {
		return 0xFFFFFFFF // -1 as uint32
	}
	key := string(keyBytes)

	// Get table
	table := et.GetTable(tableID)
	if table == nil {
		return 0xFFFFFFFF // Not found
	}

	// Get value
	value, exists := table[key]
	if !exists {
		return 0xFFFFFFFF // Not found
	}

	// Check buffer size
	if uint32(len(value)) > maxLen {
		return 0xFFFFFFFF // Buffer too small
	}

	// Write value
	if !memory.Write(valPtr, value) {
		return 0xFFFFFFFF // Write failed
	}

	return uint32(len(value))
}

// jsExtTableDelete deletes a key from a table
func (et *ExternalTables) jsExtTableDelete(ctx context.Context, m api.Module, tableID, keyPtr, keyLen uint32) uint32 {
	memory := m.Memory()

	// Read key
	keyBytes, ok := memory.Read(keyPtr, keyLen)
	if !ok {
		return 1 // Error
	}
	key := string(keyBytes)

	// Get table
	table := et.GetTable(tableID)
	if table == nil {
		return 1 // Table not found
	}

	// Delete key
	delete(table, key)

	return 0 // Success
}

// jsExtTableSize returns the number of entries in a table
func (et *ExternalTables) jsExtTableSize(ctx context.Context, m api.Module, tableID uint32) uint32 {
	table := et.GetTable(tableID)
	if table == nil {
		return 0
	}
	return uint32(len(table))
}

// jsExtTableKeys returns all keys (newline-separated)
func (et *ExternalTables) jsExtTableKeys(ctx context.Context, m api.Module, tableID, bufPtr, maxLen uint32) uint32 {
	memory := m.Memory()

	// Get table
	table := et.GetTable(tableID)
	if table == nil {
		return 0xFFFFFFFF // -1 as uint32
	}

	// Serialize keys
	var keys []string
	for key := range table {
		keys = append(keys, key)
	}
	serialized := strings.Join(keys, "\n")

	if uint32(len(serialized)) > maxLen {
		return 0xFFFFFFFF // Buffer too small
	}

	// Write to memory
	if !memory.Write(bufPtr, []byte(serialized)) {
		return 0xFFFFFFFF // Write failed
	}

	return uint32(len(serialized))
}
