use mlua::prelude::*;

const IO_BUFFER_SIZE: usize = 64 * 1024;
static mut IO_BUFFER: [u8; IO_BUFFER_SIZE] = [0; IO_BUFFER_SIZE];
static mut LUA: Option<Lua> = None;
static mut EXTERNAL_TABLE_COUNTER: u32 = 1;

extern "C" {
    fn js_ext_table_set(table_id: u32, key_ptr: *const u8, key_len: usize, val_ptr: *const u8, val_len: usize) -> i32;
    fn js_ext_table_get(table_id: u32, key_ptr: *const u8, key_len: usize, val_ptr: *mut u8, max_len: usize) -> i32;
    fn js_ext_table_delete(table_id: u32, key_ptr: *const u8, key_len: usize) -> i32;
    fn js_ext_table_size(table_id: u32) -> usize;
    fn js_ext_table_keys(table_id: u32, buf_ptr: *mut u8, max_len: usize) -> i32;
}

#[no_mangle]
pub extern "C" fn init() -> i32 {
    unsafe {
        let lua = Lua::new();
        if let Err(_) = register_external_api(&lua) {
            return -1;
        }
        LUA = Some(lua);
        0
    }
}

fn register_external_api(lua: &Lua) -> LuaResult<()> {
    let globals = lua.globals();
    
    let ext_table_new = lua.create_function(|lua, _: ()| {
        unsafe {
            let table_id = EXTERNAL_TABLE_COUNTER;
            EXTERNAL_TABLE_COUNTER += 1;
            create_external_table_proxy(lua, table_id)
        }
    })?;
    
    let ext_table = lua.create_table()?;
    ext_table.set("table", ext_table_new)?;
    
    globals.set("ext", ext_table)?;
    Ok(())
}

fn create_external_table_proxy(lua: &Lua, table_id: u32) -> LuaResult<LuaTable> {
    let proxy = lua.create_table()?;
    let meta = lua.create_table()?;
    
    meta.set("__table_id", table_id)?;
    
    let index_fn = lua.create_function(|lua, (table, key): (LuaTable, LuaValue)| {
        let meta: LuaTable = table.get_metatable().ok_or(LuaError::RuntimeError("No metatable".to_string()))?;
        let table_id: u32 = meta.get("__table_id")?;
        
        let key_bytes = serialize_value(lua, &key)?;
        
        unsafe {
            let mut buffer = vec![0u8; 65536];
            let bytes_read = js_ext_table_get(
                table_id,
                key_bytes.as_ptr(),
                key_bytes.len(),
                buffer.as_mut_ptr(),
                buffer.len()
            );
            
            if bytes_read < 0 {
                return Ok(LuaValue::Nil);
            }
            
            buffer.truncate(bytes_read as usize);
            deserialize_value(lua, &buffer)
        }
    })?;
    
    let newindex_fn = lua.create_function(|lua, (table, key, value): (LuaTable, LuaValue, LuaValue)| {
        let meta: LuaTable = table.get_metatable().ok_or(LuaError::RuntimeError("No metatable".to_string()))?;
        let table_id: u32 = meta.get("__table_id")?;
        
        let key_bytes = serialize_value(lua, &key)?;
        
        if value.is_nil() {
            unsafe {
                js_ext_table_delete(table_id, key_bytes.as_ptr(), key_bytes.len());
            }
        } else {
            let value_bytes = serialize_value(lua, &value)?;
            unsafe {
                js_ext_table_set(
                    table_id,
                    key_bytes.as_ptr(),
                    key_bytes.len(),
                    value_bytes.as_ptr(),
                    value_bytes.len()
                );
            }
        }
        
        Ok(())
    })?;
    
    let len_fn = lua.create_function(|_, table: LuaTable| {
        let meta: LuaTable = table.get_metatable().ok_or(LuaError::RuntimeError("No metatable".to_string()))?;
        let table_id: u32 = meta.get("__table_id")?;
        unsafe { Ok(js_ext_table_size(table_id)) }
    })?;
    
    let pairs_fn = lua.create_function(|lua, table: LuaTable| {
        let meta: LuaTable = table.get_metatable().ok_or(LuaError::RuntimeError("No metatable".to_string()))?;
        let table_id: u32 = meta.get("__table_id")?;
        
        unsafe {
            let mut buffer = vec![0u8; 1024 * 1024];
            let bytes_read = js_ext_table_keys(table_id, buffer.as_mut_ptr(), buffer.len());
            
            if bytes_read <= 0 {
                return Ok(());
            }
            
            buffer.truncate(bytes_read as usize);
            
            let mut offset = 4;
            
            while offset < buffer.len() {
                if offset + 4 > buffer.len() { break; }
                
                let key_len = u32::from_le_bytes([
                    buffer[offset],
                    buffer[offset + 1],
                    buffer[offset + 2],
                    buffer[offset + 3]
                ]) as usize;
                offset += 4;
                
                if offset + key_len > buffer.len() { break; }
                
                let key_bytes = &buffer[offset..offset + key_len];
                let _key = deserialize_value(lua, key_bytes)?;
                
                let mut val_buffer = vec![0u8; 65536];
                let val_read = js_ext_table_get(
                    table_id,
                    key_bytes.as_ptr(),
                    key_bytes.len(),
                    val_buffer.as_mut_ptr(),
                    val_buffer.len()
                );
                
                if val_read > 0 {
                    val_buffer.truncate(val_read as usize);
                    let _value = deserialize_value(lua, &val_buffer)?;
                }
                
                offset += key_len;
            }
            
            Ok(())
        }
    })?;
    
    meta.set("__index", index_fn)?;
    meta.set("__newindex", newindex_fn)?;
    meta.set("__len", len_fn)?;
    meta.set("__pairs", pairs_fn)?;
    
    proxy.set_metatable(Some(meta));
    Ok(proxy)
}

fn serialize_value(_lua: &Lua, value: &LuaValue) -> LuaResult<Vec<u8>> {
    let mut bytes = Vec::new();
    
    match value {
        LuaValue::Nil => bytes.push(0),
        LuaValue::Boolean(b) => {
            bytes.push(1);
            bytes.push(if *b { 1 } else { 0 });
        }
        LuaValue::Integer(i) => {
            bytes.push(2);
            bytes.extend_from_slice(&i.to_le_bytes());
        }
        LuaValue::Number(n) => {
            bytes.push(3);
            bytes.extend_from_slice(&n.to_le_bytes());
        }
        LuaValue::String(s) => {
            bytes.push(4);
            let s_bytes = s.as_bytes();
            bytes.extend_from_slice(&(s_bytes.len() as u32).to_le_bytes());
            bytes.extend_from_slice(s_bytes);
        }
        _ => return Err(LuaError::RuntimeError("Unsupported type".to_string())),
    }
    
    Ok(bytes)
}

fn deserialize_value<'lua>(lua: &'lua Lua, bytes: &[u8]) -> LuaResult<LuaValue<'lua>> {
    if bytes.is_empty() { return Ok(LuaValue::Nil); }
    
    match bytes[0] {
        0 => Ok(LuaValue::Nil),
        1 => Ok(LuaValue::Boolean(bytes[1] != 0)),
        2 => {
            let int = i64::from_le_bytes([
                bytes[1], bytes[2], bytes[3], bytes[4],
                bytes[5], bytes[6], bytes[7], bytes[8]
            ]);
            Ok(LuaValue::Integer(int))
        }
        3 => {
            let float = f64::from_le_bytes([
                bytes[1], bytes[2], bytes[3], bytes[4],
                bytes[5], bytes[6], bytes[7], bytes[8]
            ]);
            Ok(LuaValue::Number(float))
        }
        4 => {
            let len = u32::from_le_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]) as usize;
            let string = lua.create_string(&bytes[5..5 + len])?;
            Ok(LuaValue::String(string))
        }
        _ => Err(LuaError::RuntimeError("Invalid type".to_string()))
    }
}

#[no_mangle]
pub extern "C" fn get_buffer_ptr() -> *const u8 {
    unsafe { IO_BUFFER.as_ptr() }
}

#[no_mangle]
pub extern "C" fn get_buffer_size() -> usize {
    IO_BUFFER_SIZE
}

#[no_mangle]
pub extern "C" fn eval(input_len: usize) -> i32 {
    if input_len > IO_BUFFER_SIZE { return -1; }

    unsafe {
        let lua = match LUA.as_ref() {
            Some(l) => l,
            None => return -2,
        };
        
        let input = &IO_BUFFER[..input_len];
        let code = match std::str::from_utf8(input) {
            Ok(s) => s,
            Err(_) => return -3,
        };
        
        let result = match lua.load(code).eval::<mlua::Value>() {
            Ok(val) => format!("{:?}", val),
            Err(e) => format!("Error: {}", e),
        };
        
        let output = result.as_bytes();
        let output_len = output.len().min(IO_BUFFER_SIZE);
        IO_BUFFER[..output_len].copy_from_slice(&output[..output_len]);
        
        output_len as i32
    }
}

#[repr(C)]
pub struct MemoryStats {
    pub io_buffer_size: usize,
    pub lua_memory_used: usize,
    pub wasm_pages: usize,
}

#[no_mangle]
pub extern "C" fn get_memory_stats(stats_ptr: *mut MemoryStats) {
    unsafe {
        let lua = match LUA.as_ref() {
            Some(l) => l,
            None => return,
        };

        let stats = &mut *stats_ptr;
        stats.io_buffer_size = IO_BUFFER_SIZE;
        stats.lua_memory_used = lua.used_memory();
        stats.wasm_pages = 0;
    }
}

#[no_mangle]
pub extern "C" fn run_gc() {
    unsafe {
        if let Some(lua) = LUA.as_ref() {
            let _ = lua.gc_collect();
        }
    }
}
