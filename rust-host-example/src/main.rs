use anyhow::Result;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use wasmtime::*;

// External table storage - exactly like JavaScript Map
type ExternalTable = HashMap<Vec<u8>, Vec<u8>>;
type TableStorage = Arc<Mutex<HashMap<u32, ExternalTable>>>;

struct LuaWasmHost {
    engine: Engine,
    module: Module,
    store: Store<HostState>,
    instance: Instance,
    memory: Memory,
    // Persistent storage (like IndexedDB)
    db: sled::Db,
}

struct HostState {
    tables: TableStorage,
    next_table_id: u32,
}

impl LuaWasmHost {
    fn new(wasm_path: &str) -> Result<Self> {
        let engine = Engine::default();
        let module = Module::from_file(&engine, wasm_path)?;
        
        // Create external table storage
        let tables = Arc::new(Mutex::new(HashMap::new()));
        
        let host_state = HostState {
            tables: tables.clone(),
            next_table_id: 1,
        };
        
        let mut store = Store::new(&engine, host_state);
        
        // Create imports - EXACT SAME as JavaScript!
        let imports = [
            // js_time_now() -> i64
            {
                let func = Func::wrap(&mut store, || -> i64 {
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as i64
                });
                Extern::Func(func)
            },
            
            // js_ext_table_set(table_id: i32, key_ptr: i32, key_len: i32, val_ptr: i32, val_len: i32) -> i32
            {
                let tables_clone = tables.clone();
                let func = Func::wrap(&mut store, 
                    move |mut caller: Caller<'_, HostState>, 
                          table_id: i32, 
                          key_ptr: i32, 
                          key_len: i32, 
                          val_ptr: i32, 
                          val_len: i32| -> i32 {
                    
                    let memory = caller.get_export("memory")
                        .and_then(|m| m.into_memory())
                        .unwrap();
                    
                    let mem_data = memory.data(&caller);
                    
                    // Read key and value from WASM memory
                    let key = mem_data[key_ptr as usize..(key_ptr + key_len) as usize].to_vec();
                    let value = mem_data[val_ptr as usize..(val_ptr + val_len) as usize].to_vec();
                    
                    // Store in external table - EXACTLY like JavaScript!
                    let mut tables = tables_clone.lock().unwrap();
                    let table = tables.entry(table_id as u32)
                        .or_insert_with(HashMap::new);
                    
                    // Check if it's function bytecode (type 0x05) or function ref (0x06)
                    if !value.is_empty() {
                        match value[0] {
                            0x05 => println!("Storing Lua function bytecode, {} bytes", value.len()),
                            0x06 => println!("Storing C function reference"),
                            _ => {}
                        }
                    }
                    
                    table.insert(key, value);
                    0 // Success
                });
                Extern::Func(func)
            },
            
            // js_ext_table_get(table_id: i32, key_ptr: i32, key_len: i32, val_ptr: i32, max_len: i32) -> i32
            {
                let tables_clone = tables.clone();
                let func = Func::wrap(&mut store,
                    move |mut caller: Caller<'_, HostState>,
                          table_id: i32,
                          key_ptr: i32,
                          key_len: i32,
                          val_ptr: i32,
                          max_len: i32| -> i32 {
                    
                    let memory = caller.get_export("memory")
                        .and_then(|m| m.into_memory())
                        .unwrap();
                    
                    let mem_data = memory.data(&caller);
                    let key = mem_data[key_ptr as usize..(key_ptr + key_len) as usize].to_vec();
                    
                    let tables = tables_clone.lock().unwrap();
                    if let Some(table) = tables.get(&(table_id as u32)) {
                        if let Some(value) = table.get(&key) {
                            if value.len() > max_len as usize {
                                return -1;
                            }
                            
                            // Write value back to WASM memory
                            let mem_data_mut = memory.data_mut(&mut caller);
                            mem_data_mut[val_ptr as usize..(val_ptr as usize + value.len())]
                                .copy_from_slice(value);
                            
                            return value.len() as i32;
                        }
                    }
                    -1 // Not found
                });
                Extern::Func(func)
            },
            
            // js_ext_table_delete, js_ext_table_size, js_ext_table_keys
            // ... (similar implementations)
        ];
        
        let instance = Instance::new(&mut store, &module, &imports)?;
        
        let memory = instance
            .get_memory(&mut store, "memory")
            .ok_or_else(|| anyhow::anyhow!("Failed to find memory export"))?;
        
        // Open persistent database (like IndexedDB)
        let db = sled::open("lua_persistent_db")?;
        
        let mut host = LuaWasmHost {
            engine,
            module,
            store,
            instance,
            memory,
            db,
        };
        
        // Initialize Lua
        host.init()?;
        
        Ok(host)
    }
    
    fn init(&mut self) -> Result<()> {
        let init_func = self.instance
            .get_typed_func::<(), i32>(&mut self.store, "init")?;
        
        let result = init_func.call(&mut self.store, ())?;
        if result != 0 {
            anyhow::bail!("Lua init failed with code: {}", result);
        }
        
        Ok(())
    }
    
    fn compute(&mut self, code: &str) -> Result<String> {
        // Get buffer pointer
        let get_buffer_ptr = self.instance
            .get_typed_func::<(), i32>(&mut self.store, "get_buffer_ptr")?;
        let buffer_ptr = get_buffer_ptr.call(&mut self.store, ())?;
        
        // Write code to buffer
        let code_bytes = code.as_bytes();
        self.memory.data_mut(&mut self.store)[buffer_ptr as usize..buffer_ptr as usize + code_bytes.len()]
            .copy_from_slice(code_bytes);
        
        // Execute
        let compute_func = self.instance
            .get_typed_func::<(i32, i32), i32>(&mut self.store, "compute")?;
        let result = compute_func.call(&mut self.store, (buffer_ptr, code_bytes.len() as i32))?;
        
        // Read output
        if result > 0 {
            let output = &self.memory.data(&self.store)[buffer_ptr as usize..(buffer_ptr + result) as usize];
            Ok(String::from_utf8_lossy(output).to_string())
        } else if result < 0 {
            let error = &self.memory.data(&self.store)[buffer_ptr as usize..(buffer_ptr - result) as usize];
            Err(anyhow::anyhow!("Lua error: {}", String::from_utf8_lossy(error)))
        } else {
            Ok(String::new())
        }
    }
    
    fn save_state(&mut self) -> Result<()> {
        // Save external tables to persistent storage (like IndexedDB)
        let tables = self.store.data().tables.lock().unwrap();
        
        for (table_id, table) in tables.iter() {
            for (key, value) in table.iter() {
                // Create composite key: table_id + key
                let mut db_key = table_id.to_le_bytes().to_vec();
                db_key.extend_from_slice(key);
                
                self.db.insert(db_key, value.clone())?;
            }
        }
        
        self.db.flush()?;
        println!("✅ State saved to disk (like IndexedDB)");
        Ok(())
    }
    
    fn load_state(&mut self) -> Result<()> {
        // Load from persistent storage back into external tables
        let mut tables = self.store.data().tables.lock().unwrap();
        tables.clear();
        
        for item in self.db.iter() {
            let (db_key, value) = item?;
            
            if db_key.len() >= 4 {
                let table_id = u32::from_le_bytes([db_key[0], db_key[1], db_key[2], db_key[3]]);
                let key = db_key[4..].to_vec();
                
                let table = tables.entry(table_id).or_insert_with(HashMap::new);
                table.insert(key, value.to_vec());
            }
        }
        
        println!("✅ State restored from disk");
        Ok(())
    }
}

fn main() -> Result<()> {
    println!("🦀 Rust Host for Lua WASM with Function Persistence\n");
    
    // Create the host with the same WASM file
    let mut host = LuaWasmHost::new("../web/lua.wasm")?;
    
    // Example 1: Create and store a function
    println!("Creating a Lua function with unique ID...");
    let code = r#"
        local id = math.random(1000, 9999)
        Memory.greet = function(name)
            return "Hello " .. name .. " from Rust! ID: " .. id
        end
        Memory.test_data = "Rust host data"
        return "Created function with ID: " .. id
    "#;
    
    let result = host.compute(code)?;
    println!("Result: {}\n", result);
    
    // Test the function
    println!("Testing the function...");
    let result = host.compute("return Memory.greet('World')")?;
    println!("Function output: {}\n", result);
    
    // Save state to disk
    println!("Saving state to persistent storage...");
    host.save_state()?;
    
    // Simulate restart - create new host
    println!("\n🔄 Simulating restart - creating new host instance...\n");
    drop(host);
    
    let mut host = LuaWasmHost::new("../web/lua.wasm")?;
    
    // Load saved state
    println!("Loading saved state...");
    host.load_state()?;
    
    // Attach the loaded tables to Lua
    // (You'd need to implement attach_memory_table export)
    
    // Test if function survived
    println!("\nTesting restored function...");
    let result = host.compute("return Memory.greet and Memory.greet('Restored') or 'Function not found'")?;
    println!("Restored function output: {}", result);
    
    let result = host.compute("return Memory.test_data or 'Data not found'")?;
    println!("Restored data: {}", result);
    
    Ok(())
}