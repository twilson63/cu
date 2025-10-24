-- Hello World example for Lua Persistent Demo

print("Hello from Lua WebAssembly!")
print("Running Lua " .. _VERSION)

-- Basic calculations
local a = 10
local b = 32
print(string.format("%d + %d = %d", a, b, a + b))

-- String manipulation
local name = "WebAssembly"
print("Hello, " .. name .. "!")

-- Table operations
local fruits = {"apple", "banana", "orange"}
print("\nFruits:")
for i, fruit in ipairs(fruits) do
    print(i .. ": " .. fruit)
end

-- Function example
function factorial(n)
    if n <= 1 then return 1 end
    return n * factorial(n - 1)
end

print("\nFactorial of 5 = " .. factorial(5))

-- Return a value
return "Hello World example completed!"