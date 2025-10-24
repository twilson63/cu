# Quick Start Guide - Lua WASM Persistent

Get started with Lua WASM in 5 minutes.

## Installation

### 1. Download the Project

```bash
git clone https://github.com/your-org/lua-wasm-demo.git
cd lua-persistent-demo
```

### 2. Build the WASM Module

```bash
./build.sh
```

**Requirements:**
- Zig 0.14+ ([Download](https://ziglang.org/download))
- Unix-like system (Linux, macOS, or WSL on Windows)

**Output:** `web/lua.wasm` (binary file)

### 3. Start Web Server

```bash
cd web
python3 -m http.server 8000
```

Or with Node.js:
```bash
npx http-server -p 8000
```

### 4. Open Browser

Navigate to `http://localhost:8000`

---

## Your First Program

### Basic Hello World

1. **Copy and paste into code editor:**
```lua
print("Hello, World!")
return "success"
```

2. **Click "Run Code"**

3. **Expected output:**
```
Output: Hello, World!
Result: "success"
```

---

## Simple Counter

### Create Persistent State

**Paste this code:**
```lua
counter = ext.table()
if counter["count"] == nil then
    counter["count"] = 0
end

counter["count"] = counter["count"] + 1
print("Count: " .. counter["count"])
return counter["count"]
```

**First run:**
- Output: `Count: 1`
- Result: `1`

**Click "Run Code" again:**
- Output: `Count: 2`
- Result: `2`

**Run a third time:**
- Output: `Count: 3`
- Result: `3`

The counter persists because `ext.table()` stores data in JavaScript!

---

## External Tables

### What are External Tables?

External tables store data that **persists across eval() calls**.

### Creating a Table

```lua
local data = ext.table()
```

Each `ext.table()` creates a new, independent table.

### Storing Values

```lua
local config = ext.table()
config["name"] = "MyApp"
config["version"] = 1.0
config["debug"] = true
```

### Retrieving Values

```lua
local config = ext.table()
config["name"] = "MyApp"

print(config["name"])          -- "MyApp"
print(config["missing"])       -- nil
print(config["missing"] or "default")  -- "default"
```

### Persistence Example

**Eval 1:**
```lua
user = ext.table()
user["id"] = 42
user["name"] = "Alice"
print("User created")
return true
```

**Eval 2:**
```lua
print("User ID: " .. user["id"])
print("Name: " .. user["name"])
return "logged in"
```

Both evals work because `user` is global and references the external table.

---

## Key Concepts

### Variables Persist (Globals)

```lua
-- Eval 1
x = 10
print("Set x to 10")

-- Eval 2
print("x is " .. x)    -- Works! x is still 10
x = x + 5

-- Eval 3
print("x is " .. x)    -- x is now 15
```

### Local Variables Don't Persist

```lua
-- Eval 1
local y = 20
print("Set local y")

-- Eval 2
print("y is " .. (y or "nil"))   -- y is nil!
```

**Use global variables for persistence:**
```lua
-- Eval 1
my_var = 20      -- Global (persists)

-- Eval 2
print(my_var)    -- Works!
```

### External Tables Store Data

```lua
-- Eval 1
data = ext.table()
data["key"] = "value"

-- Eval 2
print(data["key"])   -- "value" - external table persists!
```

---

## Common Patterns

### Counter Pattern

```lua
counter = ext.table()
counter["val"] = (counter["val"] or 0) + 1
return counter["val"]
```

### Configuration Pattern

```lua
config = ext.table()
if #config == 0 then
    config["max_items"] = 100
    config["timeout"] = 30
    config["debug"] = false
end
print("Config loaded")
```

### Data Collection Pattern

```lua
items = ext.table()
items["count"] = (items["count"] or 0) + 1
items["item_" .. items["count"]] = {
    id = items["count"],
    timestamp = os.time()
}
print("Added item " .. items["count"])
```

### Array Pattern (using integers as keys)

```lua
arr = ext.table()
arr[1] = "first"
arr[2] = "second"
arr[3] = "third"

for i = 1, #arr do
    print(arr[i])
end
```

---

## Handling Output

### Multiple Print Statements

```lua
print("Line 1")
print("Line 2")
print("Line 3")
return "done"
```

**Output:**
```
Line 1
Line 2
Line 3
```

### Formatting Output

```lua
local x = 42
local y = 3.14
print("x = " .. x .. ", y = " .. y)
print(string.format("x = %d, y = %.2f", x, y))
```

### String Operations

```lua
local text = "hello world"
print(string.upper(text))           -- "HELLO WORLD"
print(string.sub(text, 1, 5))       -- "hello"
print(string.len(text))             -- 11
print(string.rep("*", 10))          -- "**********"
```

---

## Handling Errors

### Syntax Errors

```lua
return 42 +++
```

Shows error message explaining the syntax error.

### Runtime Errors

```lua
return unknown_function()
```

Shows error: undefined function.

### Safe Error Handling

```lua
local value = some_data or 0
local result = pcall(some_function)
if result then
    return "success"
else
    return "failed"
end
```

---

## Mathematical Operations

```lua
print(2 + 3)           -- 5
print(10 - 4)          -- 6
print(3 * 7)           -- 21
print(20 / 4)          -- 5
print(10 % 3)          -- 1
print(2 ^ 3)           -- 8

local x = 5
print(x > 3)           -- true
print(x <= 5)          -- true
print(x ~= 10)         -- true (not equal)
```

---

## Loops and Conditions

### For Loop

```lua
for i = 1, 5 do
    print(i)
end
```

### While Loop

```lua
local i = 1
while i <= 5 do
    print(i)
    i = i + 1
end
```

### If Statement

```lua
local x = 10
if x > 5 then
    print("x is large")
elseif x > 0 then
    print("x is small")
else
    print("x is zero or negative")
end
```

### Table Iteration

```lua
local t = ext.table()
t["a"] = 1
t["b"] = 2
t["c"] = 3

for key, value in pairs(t) do
    print(key .. " = " .. value)
end
```

---

## Functions

### Defining Functions

```lua
function greet(name)
    return "Hello, " .. name
end

print(greet("Alice"))
return greet("Bob")
```

### Local Functions

```lua
local function add(a, b)
    return a + b
end

return add(5, 3)
```

### Recursion

```lua
function factorial(n)
    if n <= 1 then
        return 1
    else
        return n * factorial(n - 1)
    end
end

return factorial(5)  -- 120
```

---

## Tables (Local Lua Tables)

**Note:** Local Lua tables cannot be stored in external tables. Use external tables directly instead.

```lua
-- This works
local t = {}
t.x = 1
t.y = 2
return t.x + t.y

-- For persistence, use external table
local data = ext.table()
data["x"] = 1
data["y"] = 2
return data["x"] + data["y"]
```

---

## Memory Management

### Check Memory Usage

```javascript
const stats = lua.getMemoryStats();
console.log('IO Buffer:', stats.io_buffer_size);
console.log('Lua Memory:', stats.lua_memory_used);
console.log('WASM Pages:', stats.wasm_pages);
```

### Force Garbage Collection

```javascript
lua.gc();
```

### Clearing Data

```lua
-- Clear a variable
data = nil

-- Clear a table
for k, v in pairs(my_table) do
    my_table[k] = nil
end
```

---

## Limits and Constraints

| Limit | Value | Solution |
|-------|-------|----------|
| Code size | 64KB | Split into smaller scripts |
| Output | 63KB | Process output incrementally |
| Memory | 2MB | Monitor with getMemoryStats() |
| String size | 64KB | Split large strings |
| Recursion depth | ~500 | Use iterative approach |

---

## Practical Example: Todo List

```lua
todos = ext.table()

-- Add a todo
if todos["last_id"] == nil then
    todos["last_id"] = 0
end

todos["last_id"] = todos["last_id"] + 1
local id = todos["last_id"]
todos["todo_" .. id] = {
    id = id,
    text = "New task",
    done = false
}

print("Added todo " .. id)

-- List todos
print("\nTodos:")
for key, _ in pairs(todos) do
    if key ~= "last_id" then
        print("  [" .. key .. "] " .. todos[key].text)
    end
end

-- Mark as done
todos["todo_1"].done = true

return "done"
```

---

## Practical Example: Game State

```lua
game = ext.table()

if game["initialized"] == nil then
    game["initialized"] = true
    game["level"] = 1
    game["score"] = 0
    game["lives"] = 3
    print("Game initialized")
else
    print("Game already running")
end

-- Update state
game["score"] = game["score"] + 10
if game["score"] > 100 then
    game["level"] = game["level"] + 1
    game["score"] = 0
    print("Level up! Now level " .. game["level"])
end

print("Score: " .. game["score"] .. ", Lives: " .. game["lives"])
return {level=game["level"], score=game["score"]}
```

---

## Tips and Best Practices

### 1. Use Meaningful Names

```lua
-- Bad
local a = ext.table()
a["x"] = 1

-- Good
local settings = ext.table()
settings["max_items"] = 100
```

### 2. Check for Existence

```lua
-- Bad
local count = counter["count"] + 1

-- Good
local count = (counter["count"] or 0) + 1
```

### 3. Use Functions for Reusable Code

```lua
local function increment(table, key)
    table[key] = (table[key] or 0) + 1
end

stats = ext.table()
increment(stats, "visits")
```

### 4. Print for Debugging

```lua
print("DEBUG: x = " .. tostring(x))
print("DEBUG: t = " .. table.concat(t, ", "))
```

### 5. Handle Errors Gracefully

```lua
local success, result = pcall(function()
    return risky_operation()
end)

if success then
    print("Result: " .. result)
else
    print("Error: " .. result)
end
```

---

## What's Next?

- Read [README_LUA.md](README_LUA.md) for complete API reference
- Check [examples/](../examples/) for more scripts
- See [BROWSER_TESTING.md](BROWSER_TESTING.md) for test scenarios
- Review [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if you hit issues

Happy coding! 🚀
