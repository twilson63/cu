-- Data Processing Example - Large Dataset Handling
--
-- This example demonstrates storing and processing large datasets
-- using external tables for persistence.

-- Initialize data storage
if data_store == nil then
    data_store = ext.table()
    data_store["items_processed"] = 0
end

-- Helper function to generate sample data
local function generate_item(id)
    return {
        id = id,
        name = "Item_" .. id,
        value = id * 100,
        category = (id % 3 == 0 and "A") or (id % 3 == 1 and "B") or "C",
        active = (id % 2 == 0)
    }
end

-- Helper function to process item
local function process_item(item)
    return {
        id = item.id,
        name = item.name,
        doubled_value = item.value * 2,
        category = item.category,
        is_active = item.active
    }
end

print("=== Data Processing Demo ===\n")

-- Generate and process data
local batch_size = 50
local start_id = data_store["items_processed"] + 1
local end_id = start_id + batch_size - 1

print("Processing items " .. start_id .. " to " .. end_id .. "...\n")

local category_counts = {}
category_counts["A"] = 0
category_counts["B"] = 0
category_counts["C"] = 0

local total_value = 0

for i = start_id, end_id do
    -- Generate item
    local item = generate_item(i)
    
    -- Process item
    local processed = process_item(item)
    
    -- Store processed item
    data_store["item_" .. i] = processed
    
    -- Accumulate statistics
    category_counts[item.category] = category_counts[item.category] + 1
    if item.active then
        total_value = total_value + item.value
    end
    
    -- Progress indicator
    if (i - start_id + 1) % 10 == 0 then
        print("  ✓ Processed " .. (i - start_id + 1) .. " items")
    end
end

data_store["items_processed"] = end_id

print("\n=== Processing Results ===\n")
print("Items processed in this batch: " .. batch_size)
print("Total items in storage: " .. data_store["items_processed"])
print("Total value (active): " .. total_value)

print("\nCategory breakdown:")
print("  Category A: " .. category_counts["A"] .. " items")
print("  Category B: " .. category_counts["B"] .. " items")
print("  Category C: " .. category_counts["C"] .. " items")

-- Calculate statistics
local avg_per_category = data_store["items_processed"] / 3
print("\nAverage items per category: " .. string.format("%.1f", avg_per_category))

-- Return summary
return {
    batch_processed = batch_size,
    total_processed = data_store["items_processed"],
    total_value = total_value,
    categories = category_counts
}
