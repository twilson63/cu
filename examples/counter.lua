-- Counter Example - Simple Persistence
--
-- This example demonstrates how to create a simple counter that
-- persists across multiple eval() calls using ext.table().
--
-- Try clicking "Run Code" multiple times to see the counter increment.

-- Create or get the counter table
-- ext.table() persists data in JavaScript Maps
if counter == nil then
    counter = ext.table()
    counter["value"] = 0
    print("Counter initialized")
end

-- Increment the counter
counter["value"] = counter["value"] + 1

-- Display the current count
local current = counter["value"]
print("Counter: " .. current)

-- Show progress every 5 increments
if current % 5 == 0 then
    print("🎉 Reached " .. current .. "!")
end

-- Return the current count
return current
