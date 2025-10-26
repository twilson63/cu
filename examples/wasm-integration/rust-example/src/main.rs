// Rust integration example for lua.wasm using wasmtime
// 
// This example demonstrates:
// - Loading lua.wasm with wasmtime
// - Implementing all 5 host functions
// - External table storage using Rust HashMap
// - Executing Lua code and handling results
// - Proper error handling and memory management

use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use wasmtime::*;

/// External table storage using HashMap
/// Each table ID maps to a HashMap of key-value pairs
type ExternalTables = Arc<Mutex<HashMap<u32, HashMap<String, Vec<u8>>>>>;

/// Main entry point
fn main() -> Result<()> {
    println!("Lua WASM Integration Example (Rust + wasmtime)\n");

    // Create WASM engine and module
    let engine = Engine::default();
    let module = load_module(&engine)?;

    // Create external table storage
    let tables = ExternalTables::default();

    // Create linker and add host functions
    let mut linker = Linker::new(&engine);
    add_host_functions(&mut linker, tables.clone())?;

    // Create store and instantiate
    let mut store = Store::new(&engine, ());
    let instance = linker.instantiate(&mut store, &module)?;

    // Initialize Lua VM
    println!("Initializing Lua VM...");
    let init = instance.get_typed_func::<(), i32>(&mut store, "init")?;
    let init_result = init.call(&mut store, ())?;
    
    if init_result != 0 {
        return Err(anyhow!("Lua initialization failed: {}", init_result));
    }
    println!("✓ Lua VM initialized successfully\n");

    // Get buffer info
    let get_buffer_ptr = instance.get_typed_func::<(), i32>(&mut store, "get_buffer_ptr")?;
    let get_buffer_size = instance.get_typed_func::<(), i32>(&mut store, "get_buffer_size")?;
    
    let buffer_ptr = get_buffer_ptr.call(&mut store, ())? as usize;
    let buffer_size = get_buffer_size.call(&mut store, ())? as usize;
    
    println!("Buffer info:");
    println!("  Pointer: 0x{:x}", buffer_ptr);
    println!("  Size: {} bytes\n", buffer_size);

    // Run example Lua code
    println!("=== Example 1: Basic Arithmetic ===");
    execute_lua(&mut store, &instance, "return 2 + 2", buffer_ptr, buffer_size)?;

    println!("\n=== Example 2: String Operations ===");
    execute_lua(&mut store, &instance, "return 'Hello ' .. 'from Lua!'", buffer_ptr, buffer_size)?;

    println!("\n=== Example 3: External Table Persistence ===");
    execute_lua(&mut store, &instance, 
        "_home.counter = (_home.counter or 0) + 1; return _home.counter",
        buffer_ptr, buffer_size)?;
    
    // Call again to show persistence
    execute_lua(&mut store, &instance, 
        "_home.counter = (_home.counter or 0) + 1; return _home.counter",
        buffer_ptr, buffer_size)?;

    println!("\n=== Example 4: Error Handling ===");
    execute_lua(&mut store, &instance, "return 1 / 0", buffer_ptr, buffer_size)?;

    println!("\n=== Example 5: Memory Statistics ===");
    show_memory_stats(&mut store, &instance, buffer_ptr)?;

    // Show external table contents
    println!("\n=== External Table Contents ===");
    let tables_lock = tables.lock().unwrap();
    for (table_id, table) in tables_lock.iter() {
        println!("Table ID {}: {} entries", table_id, table.len());
        for (key, value) in table.iter() {
            println!("  '{}': {} bytes", key, value.len());
        }
    }

    println!("\n✓ All examples completed successfully!");
    Ok(())
}

/// Load the lua.wasm module
fn load_module(engine: &Engine) -> Result<Module> {
    // Try multiple possible locations for lua.wasm
    let paths = [
        "../../../web/lua.wasm",
        "../../web/lua.wasm",
        "./lua.wasm",
    ];

    for path in &paths {
        if let Ok(module) = Module::from_file(engine, path) {
            println!("✓ Loaded lua.wasm from: {}\n", path);
            return Ok(module);
        }
    }

    Err(anyhow!("Could not find lua.wasm. Please copy it to the current directory."))
}

/// Add all required host functions to the linker
fn add_host_functions(linker: &mut Linker<()>, tables: ExternalTables) -> Result<()> {
    // js_ext_table_set: Store a key-value pair
    let tables_set = tables.clone();
    linker.func_wrap(
        "env",
        "js_ext_table_set",
        move |mut caller: Caller<'_, ()>,
              table_id: u32,
              key_ptr: i32,
              key_len: i32,
              val_ptr: i32,
              val_len: i32|
              -> i32 {
            let memory = caller.get_export("memory")
                .and_then(|e| e.into_memory())
                .expect("memory export");

            // Read key from WASM memory
            let key_bytes = memory.data(&caller)
                .get(key_ptr as usize..(key_ptr + key_len) as usize)
                .expect("key read");
            let key = String::from_utf8_lossy(key_bytes).to_string();

            // Read value from WASM memory
            let val_bytes = memory.data(&caller)
                .get(val_ptr as usize..(val_ptr + val_len) as usize)
                .expect("value read")
                .to_vec();

            // Store in external table
            let mut tables_lock = tables_set.lock().unwrap();
            let table = tables_lock.entry(table_id).or_insert_with(HashMap::new);
            table.insert(key, val_bytes);

            0 // Success
        },
    )?;

    // js_ext_table_get: Retrieve a value by key
    let tables_get = tables.clone();
    linker.func_wrap(
        "env",
        "js_ext_table_get",
        move |mut caller: Caller<'_, ()>,
              table_id: u32,
              key_ptr: i32,
              key_len: i32,
              val_ptr: i32,
              max_len: i32|
              -> i32 {
            let memory = caller.get_export("memory")
                .and_then(|e| e.into_memory())
                .expect("memory export");

            // Read key from WASM memory
            let key_bytes = memory.data(&caller)
                .get(key_ptr as usize..(key_ptr + key_len) as usize)
                .expect("key read");
            let key = String::from_utf8_lossy(key_bytes).to_string();

            // Lookup in external table
            let tables_lock = tables_get.lock().unwrap();
            let table = match tables_lock.get(&table_id) {
                Some(t) => t,
                None => return -1, // Table not found
            };

            let value = match table.get(&key) {
                Some(v) => v,
                None => return -1, // Key not found
            };

            // Check buffer size
            if value.len() > max_len as usize {
                return -1; // Buffer too small
            }

            // Write value to WASM memory
            memory.data_mut(&mut caller)
                .get_mut(val_ptr as usize..(val_ptr as usize + value.len()))
                .expect("value write")
                .copy_from_slice(value);

            value.len() as i32
        },
    )?;

    // js_ext_table_delete: Delete a key
    let tables_delete = tables.clone();
    linker.func_wrap(
        "env",
        "js_ext_table_delete",
        move |mut caller: Caller<'_, ()>,
              table_id: u32,
              key_ptr: i32,
              key_len: i32|
              -> i32 {
            let memory = caller.get_export("memory")
                .and_then(|e| e.into_memory())
                .expect("memory export");

            // Read key from WASM memory
            let key_bytes = memory.data(&caller)
                .get(key_ptr as usize..(key_ptr + key_len) as usize)
                .expect("key read");
            let key = String::from_utf8_lossy(key_bytes).to_string();

            // Delete from external table
            let mut tables_lock = tables_delete.lock().unwrap();
            if let Some(table) = tables_lock.get_mut(&table_id) {
                table.remove(&key);
            }

            0 // Success
        },
    )?;

    // js_ext_table_size: Get number of entries
    let tables_size = tables.clone();
    linker.func_wrap(
        "env",
        "js_ext_table_size",
        move |_caller: Caller<'_, ()>, table_id: u32| -> i32 {
            let tables_lock = tables_size.lock().unwrap();
            let size = tables_lock
                .get(&table_id)
                .map(|t| t.len())
                .unwrap_or(0);
            size as i32
        },
    )?;

    // js_ext_table_keys: Get all keys (serialized)
    let tables_keys = tables.clone();
    linker.func_wrap(
        "env",
        "js_ext_table_keys",
        move |mut caller: Caller<'_, ()>,
              table_id: u32,
              buf_ptr: i32,
              max_len: i32|
              -> i32 {
            let tables_lock = tables_keys.lock().unwrap();
            let table = match tables_lock.get(&table_id) {
                Some(t) => t,
                None => return -1,
            };

            // Serialize keys (simple newline-separated format)
            let keys: Vec<&str> = table.keys().map(|s| s.as_str()).collect();
            let serialized = keys.join("\n");

            if serialized.len() > max_len as usize {
                return -1; // Buffer too small
            }

            let memory = caller.get_export("memory")
                .and_then(|e| e.into_memory())
                .expect("memory export");

            // Write to WASM memory
            memory.data_mut(&mut caller)
                .get_mut(buf_ptr as usize..(buf_ptr as usize + serialized.len()))
                .expect("keys write")
                .copy_from_slice(serialized.as_bytes());

            serialized.len() as i32
        },
    )?;

    Ok(())
}

/// Execute Lua code and display results
fn execute_lua(
    store: &mut Store<()>,
    instance: &Instance,
    code: &str,
    buffer_ptr: usize,
    buffer_size: usize,
) -> Result<()> {
    println!("Lua code: {}", code);

    // Get memory and compute function
    let memory = instance.get_memory(store, "memory")
        .ok_or_else(|| anyhow!("memory export not found"))?;
    let compute = instance.get_typed_func::<(i32, i32), i32>(store, "compute")?;

    // Write code to buffer
    let code_bytes = code.as_bytes();
    if code_bytes.len() > buffer_size {
        return Err(anyhow!("Code too large for buffer"));
    }

    memory.data_mut(store)[buffer_ptr..buffer_ptr + code_bytes.len()]
        .copy_from_slice(code_bytes);

    // Execute
    let result_len = compute.call(store, (buffer_ptr as i32, code_bytes.len() as i32))?;

    // Handle result
    if result_len < 0 {
        // Error
        let error_len = (-result_len - 1) as usize;
        let error_bytes = &memory.data(store)[buffer_ptr..buffer_ptr + error_len];
        let error_msg = String::from_utf8_lossy(error_bytes);
        println!("✗ Lua error: {}", error_msg);
    } else if result_len > 0 {
        // Success - read result
        let result_bytes = &memory.data(store)[buffer_ptr..buffer_ptr + result_len as usize];
        
        // First 4 bytes are output length
        let output_len = u32::from_le_bytes([
            result_bytes[0],
            result_bytes[1],
            result_bytes[2],
            result_bytes[3],
        ]) as usize;

        if output_len > 0 {
            let output = String::from_utf8_lossy(&result_bytes[4..4 + output_len]);
            println!("Output: {}", output.trim());
        }

        // Parse return value (simplified - just show bytes)
        if result_bytes.len() > 4 + output_len {
            let return_bytes = &result_bytes[4 + output_len..];
            println!("✓ Result: {} bytes returned", return_bytes.len());
            
            // Try to parse simple number results
            if return_bytes.len() >= 2 && return_bytes[0] == 0x03 {
                // Type tag 0x03 = number
                if return_bytes.len() >= 9 {
                    let num_bytes = &return_bytes[1..9];
                    let num = f64::from_le_bytes([
                        num_bytes[0], num_bytes[1], num_bytes[2], num_bytes[3],
                        num_bytes[4], num_bytes[5], num_bytes[6], num_bytes[7],
                    ]);
                    println!("  Number value: {}", num);
                }
            } else if return_bytes.len() >= 2 && return_bytes[0] == 0x04 {
                // Type tag 0x04 = string
                let str_len = u32::from_le_bytes([
                    return_bytes[1],
                    return_bytes[2],
                    return_bytes[3],
                    return_bytes[4],
                ]) as usize;
                if return_bytes.len() >= 5 + str_len {
                    let s = String::from_utf8_lossy(&return_bytes[5..5 + str_len]);
                    println!("  String value: '{}'", s);
                }
            }
        }
    } else {
        println!("✓ No result");
    }

    Ok(())
}

/// Display memory statistics
fn show_memory_stats(
    store: &mut Store<()>,
    instance: &Instance,
    buffer_ptr: usize,
) -> Result<()> {
    let memory = instance.get_memory(store, "memory")
        .ok_or_else(|| anyhow!("memory export not found"))?;
    let get_memory_stats = instance.get_typed_func::<i32, ()>(store, "get_memory_stats")?;

    // Call get_memory_stats
    get_memory_stats.call(store, buffer_ptr as i32)?;

    // Read stats structure (12 bytes: 3 × u32)
    let stats_bytes = &memory.data(store)[buffer_ptr..buffer_ptr + 12];
    
    let io_buffer_size = u32::from_le_bytes([
        stats_bytes[0], stats_bytes[1], stats_bytes[2], stats_bytes[3]
    ]);
    let lua_memory_used = u32::from_le_bytes([
        stats_bytes[4], stats_bytes[5], stats_bytes[6], stats_bytes[7]
    ]);
    let wasm_pages = u32::from_le_bytes([
        stats_bytes[8], stats_bytes[9], stats_bytes[10], stats_bytes[11]
    ]);

    println!("Memory Statistics:");
    println!("  I/O Buffer Size: {} bytes ({} KB)", io_buffer_size, io_buffer_size / 1024);
    println!("  Lua Memory Used: {} bytes", lua_memory_used);
    println!("  WASM Pages: {} ({}  MB)", wasm_pages, wasm_pages * 64 / 1024);
    println!("  Total WASM Memory: {} bytes ({} MB)", 
             wasm_pages * 65536, wasm_pages * 64 / 1024);

    Ok(())
}
