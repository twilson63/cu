# Examples

This directory contains various examples demonstrating the capabilities of Lua Persistent Demo.

## Basic Examples

### 1. Hello World (`hello-world.lua`)
Simple Lua execution in the browser.

### 2. External Tables (`external-tables.lua`)
Creating and using external tables that persist in JavaScript memory.

### 3. Persistence (`persistence-demo.lua`)
Saving and loading data using IndexedDB.

## Interactive Demos

### Test Pages
- `test-quick.html` - Quick functionality test
- `test-ext-table.html` - External table testing
- `test-deserialize.html` - Deserialization testing
- `test-indexeddb.html` - IndexedDB persistence testing
- `test-persistence.html` - Full persistence workflow
- `test-restore-fix.html` - Table restoration after reload
- `persistence-workaround.html` - Complete persistence example with workaround

## Running the Examples

### Lua Scripts
Load these scripts in the main demo and execute them:
```bash
# Start the demo server
cd ../demo
python3 -m http.server 8000
# Open http://localhost:8000 in your browser
```

### HTML Test Pages
Open these directly in your browser after starting the server:
```
http://localhost:8000/examples/test-quick.html
http://localhost:8000/examples/test-persistence.html
# etc...
```

## Example Code Snippets

### Creating an External Table
```lua
-- Create a persistent table
local data = ext.table()
data.name = "My Data"
data.count = 0

-- Use it like a regular table
data.count = data.count + 1
print("Count:", data.count)
```

### Saving State
```lua
-- Create some data
gameState = ext.table()
gameState.level = 1
gameState.score = 0
gameState.player = "Alice"

-- Data is automatically available to save via JavaScript
-- Click "Save State" in the demo
```

### After Page Refresh
```lua
-- After clicking "Load State"
-- Your data is back!
print(gameState.level)  -- 1
print(gameState.player) -- "Alice"
```

## Advanced Usage

### Nested Data
```lua
local app = ext.table()
app.users = ext.table()
app.settings = ext.table()

app.users["alice"] = "admin"
app.users["bob"] = "user"
app.settings.theme = "dark"
```

### Iteration
```lua
local data = ext.table()
data[1] = "first"
data[2] = "second"
data[3] = "third"

for i, v in ipairs(data) do
    print(i, v)
end
```

## Notes

- External tables only support string keys and values
- Maximum I/O buffer size is 64KB
- Tables persist in JavaScript memory until page reload
- Use IndexedDB persistence to survive page refreshes