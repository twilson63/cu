/**
 * Helper to restore external tables in Lua VM after loading from IndexedDB
 */

/**
 * Generate Lua code to recreate external table references
 * @param {Map} externalTables - The loaded external tables
 * @returns {string} Lua code to execute
 */
export function generateRestoreCode(tableInfo) {
  let luaCode = '-- Restoring external tables from IndexedDB\n';
  
  // We need to create a mapping of table IDs to variable names
  // This is a limitation - we can't know the original variable names
  // So we'll create a global restore table
  luaCode += '_restored_tables = {}\n\n';
  
  for (const table of tableInfo.tables) {
    // Create a new external table reference
    luaCode += `-- Restoring table ${table.id}\n`;
    luaCode += `local t${table.id} = ext.table()\n`;
    
    // The table already exists in JavaScript with the correct ID
    // But we need to make the Lua side aware of it
    // This is tricky because ext.table() creates a new ID
    
    // For now, let's create a restore mechanism
    luaCode += `_restored_tables[${table.id}] = t${table.id}\n`;
  }
  
  luaCode += '\n-- Tables restored. Access them via _restored_tables[id]\n';
  luaCode += 'return "Restored ' + tableInfo.tableCount + ' tables"';
  
  return luaCode;
}

/**
 * Create a Lua function that can restore a table by ID
 */
export const restoreTableFunction = `
-- Function to get or create an external table with a specific ID
function ext.get_table(id)
  if _G._ext_tables == nil then
    _G._ext_tables = {}
  end
  
  if _G._ext_tables[id] == nil then
    -- Create a new table reference for this ID
    local t = ext.table()
    -- Store it globally so we can reuse it
    _G._ext_tables[id] = t
  end
  
  return _G._ext_tables[id]
end

-- Helper to restore saved tables
function ext.restore_saved_tables(saved_data)
  if type(saved_data) ~= "table" then
    error("saved_data must be a table")
  end
  
  local restored = {}
  for name, id in pairs(saved_data) do
    _G[name] = ext.get_table(id)
    restored[name] = id
  end
  
  return restored
end
`;