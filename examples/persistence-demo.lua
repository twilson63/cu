-- Persistence Demo for Lua Persistent Demo
-- Shows how to prepare data for IndexedDB persistence

print("=== Persistence Demo ===\n")

-- Create application state using external tables
-- This data can be saved to IndexedDB

-- User profile
profile = ext.table()
profile.username = "developer"
profile.joined = os.date()
profile.preferences = "dark-mode,notifications"

-- Game state
gameState = ext.table()
gameState.level = 5
gameState.score = 12500
gameState.achievements = "first-win,speed-runner"
gameState.lastPlayed = os.date()

-- Application data
appData = ext.table()
appData.version = "1.0.0"
appData.lastSync = os.date()
appData.dataCount = 42

print("Created persistent data structures:")
print("\nProfile:")
print("  Username: " .. profile.username)
print("  Joined: " .. profile.joined)

print("\nGame State:")
print("  Level: " .. gameState.level)
print("  Score: " .. gameState.score)
print("  Achievements: " .. gameState.achievements)

print("\nApp Data:")
print("  Version: " .. appData.version)
print("  Data Count: " .. appData.dataCount)

print("\n" .. string.rep("=", 40))
print("INSTRUCTIONS:")
print("1. Click 'Save State' button to save to IndexedDB")
print("2. Refresh the page")
print("3. Click 'Load State' button")
print("4. Run this code to verify data persistence:")
print("")
print("-- Verification code:")
print("print('Profile:', profile.username)")
print("print('Level:', gameState.level)")
print("print('Score:', gameState.score)")
print(string.rep("=", 40))

-- Function to display all saved data
function showSavedData()
    print("\n=== Saved Data ===")
    if profile and profile.username then
        print("Profile found: " .. profile.username)
    end
    if gameState and gameState.level then
        print("Game level: " .. gameState.level)
    end
    if appData and appData.version then
        print("App version: " .. appData.version)
    end
end

-- You can call this function after loading:
-- showSavedData()

return "Data prepared for persistence!"