/**
 * Helper code for saving and restoring external table references
 * 
 * This is a workaround for the current limitation where we can't
 * directly restore Lua references to existing external tables.
 */

export const luaRestoreHelpers = `
-- Helper functions for saving and restoring external tables

-- Save the current global external tables with their IDs
function save_table_mappings()
  local mappings = {}
  
  -- Scan global variables for external tables
  for name, value in pairs(_G) do
    if type(value) == "table" and value.__ext_table_id then
      mappings[name] = {
        id = value.__ext_table_id,
        -- We could also save a sample of the data for verification
        sample_key = next(value)
      }
    end
  end
  
  return mappings
end

-- Get a string representation of the mappings for storage
function serialize_mappings()
  local mappings = save_table_mappings()
  local parts = {}
  
  for name, info in pairs(mappings) do
    table.insert(parts, string.format("%s=%d", name, info.id))
  end
  
  return table.concat(parts, ",")
end

-- After loading from IndexedDB, recreate the table references
-- This is a workaround - ideally we'd have ext.get_table(id)
function restore_table_mappings(mapping_string)
  if not mapping_string or mapping_string == "" then
    print("No mappings to restore")
    return
  end
  
  -- Parse the mapping string
  local mappings = {}
  for pair in string.gmatch(mapping_string, "[^,]+") do
    local name, id = string.match(pair, "(.+)=(%d+)")
    if name and id then
      mappings[name] = tonumber(id)
    end
  end
  
  -- Create new external tables (they'll get new IDs)
  local new_tables = {}
  for name, old_id in pairs(mappings) do
    new_tables[name] = ext.table()
    print(string.format("Created %s (was ID %d, now ID %d)", 
          name, old_id, new_tables[name].__ext_table_id))
  end
  
  -- Assign to globals
  for name, tbl in pairs(new_tables) do
    _G[name] = tbl
  end
  
  return new_tables
end

-- Save mappings to a special table that persists
function save_mappings_to_storage()
  _mappings_storage = ext.table()
  _mappings_storage.data = serialize_mappings()
  _mappings_storage.timestamp = os.date()
  print("Saved mappings: " .. _mappings_storage.data)
  return _mappings_storage.data
end

print("Restore helpers loaded. Use:")
print("  save_mappings_to_storage() - before saving to IndexedDB")
print("  restore_table_mappings(data) - after loading from IndexedDB")
`;

/**
 * Generate code to properly save state including mappings
 */
export function generateSaveStateCode() {
  return `
-- Save current table mappings
local mappings = save_mappings_to_storage()
print("Ready to save to IndexedDB")
print("Mappings: " .. mappings)
return mappings
`;
}

/**
 * Generate code to restore state with proper mappings
 * @param {string} mappings - The mapping string from before
 */
export function generateRestoreStateCode(mappings) {
  return `
-- Restore table mappings
local restored = restore_table_mappings("${mappings}")
print("Restored " .. tostring(table_count(restored)) .. " tables")

-- Helper to count table entries
function table_count(t)
  local count = 0
  for _ in pairs(t or {}) do count = count + 1 end
  return count
end

return "Tables restored"
`;
}