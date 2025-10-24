-- External Tables example for Lua Persistent Demo
-- Demonstrates creating and using persistent external tables

print("=== External Tables Demo ===\n")

-- Create an external table
-- This table is stored in JavaScript memory, not Lua's heap
local user = ext.table()

-- Add data to the table
user.name = "Alice Johnson"
user.email = "alice@example.com"
user.age = "28"
user.role = "Developer"

print("Created user table:")
print("Name: " .. user.name)
print("Email: " .. user.email)
print("Age: " .. user.age)
print("Role: " .. user.role)

-- Create another table for settings
local settings = ext.table()
settings.theme = "dark"
settings.language = "en"
settings.notifications = "enabled"

print("\nSettings:")
print("Theme: " .. settings.theme)
print("Language: " .. settings.language)
print("Notifications: " .. settings.notifications)

-- Create a table with numeric indices
local todo = ext.table()
todo[1] = "Learn Lua WebAssembly"
todo[2] = "Build persistent applications"
todo[3] = "Share with the community"

print("\nTodo List:")
for i = 1, 3 do
    print(i .. ". " .. todo[i])
end

-- Update values
user.age = "29"
settings.theme = "light"

print("\nAfter updates:")
print("User age: " .. user.age)
print("Settings theme: " .. settings.theme)

-- These tables will persist across multiple code executions
-- Try clearing the code and accessing them again!
print("\nTables created! Clear code and try:")
print('print(user.name)')
print('print(settings.theme)')

return "External tables demo completed!"