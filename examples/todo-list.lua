-- Todo List Example - CRUD Operations
--
-- This example demonstrates Create, Read, Update, Delete operations
-- on a persistent todo list stored in an external table.

-- Initialize todo storage
if todos == nil then
    todos = ext.table()
    todos["next_id"] = 1
end

-- Helper function to add a todo
local function add_todo(text)
    local id = todos["next_id"]
    todos["next_id"] = id + 1
    todos["todo_" .. id] = text
    return id
end

-- Helper function to get a todo
local function get_todo(id)
    return todos["todo_" .. id]
end

-- Helper function to update a todo
local function update_todo(id, text)
    todos["todo_" .. id] = text
end

-- Helper function to delete a todo
local function delete_todo(id)
    todos["todo_" .. id] = nil
end

-- Helper function to list all todos
local function list_todos()
    print("All todos:")
    local count = 0
    for key, value in pairs(todos) do
        if key ~= "next_id" then
            print("  [" .. key .. "] " .. value)
            count = count + 1
        end
    end
    print("Total: " .. count .. " todos")
    return count
end

-- Helper function to count todos
local function count_todos()
    local count = 0
    for key, value in pairs(todos) do
        if key ~= "next_id" then
            count = count + 1
        end
    end
    return count
end

-- DEMO: Add some todos
print("=== Todo List Demo ===\n")

print("Adding todos...")
local id1 = add_todo("Buy milk")
local id2 = add_todo("Walk the dog")
local id3 = add_todo("Fix the bug")
print("Added 3 todos\n")

-- Read: List all todos
list_todos()
print()

-- Update: Modify a todo
print("Updating todo " .. id2 .. "...")
update_todo(id2, "Walk the dog (with treats!)")
local updated = get_todo(id2)
print("Updated: " .. updated)
print()

-- Delete: Remove a todo
print("Deleting todo " .. id1 .. "...")
delete_todo(id1)
print("Deleted 'Buy milk'\n")

-- Final list
print("Final todo list:")
local final_count = list_todos()

-- Return summary
return {
    total = final_count,
    next_id = todos["next_id"]
}
