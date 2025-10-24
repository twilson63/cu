-- State Machine Example - Stateful Execution Pattern
--
-- This example demonstrates implementing a state machine that persists
-- state across multiple eval() calls.

-- State definitions
local STATES = {
    IDLE = "idle",
    LOADING = "loading",
    RUNNING = "running",
    PAUSED = "paused",
    STOPPED = "stopped",
    ERROR = "error"
}

-- Initialize state machine
if state_machine == nil then
    state_machine = ext.table()
    state_machine["current_state"] = STATES.IDLE
    state_machine["previous_state"] = STATES.IDLE
    state_machine["start_time"] = 0
    state_machine["elapsed_time"] = 0
    state_machine["operation_count"] = 0
    state_machine["error_count"] = 0
end

-- Helper function to transition state
local function transition(new_state)
    state_machine["previous_state"] = state_machine["current_state"]
    state_machine["current_state"] = new_state
    print("State: " .. state_machine["previous_state"] .. " → " .. new_state)
end

-- Helper function to get current state
local function get_state()
    return state_machine["current_state"]
end

-- Helper function to handle operation
local function handle_operation()
    if get_state() ~= STATES.RUNNING then
        print("⚠️  Cannot operate in " .. get_state() .. " state")
        state_machine["error_count"] = state_machine["error_count"] + 1
        return false
    end
    
    state_machine["operation_count"] = state_machine["operation_count"] + 1
    state_machine["elapsed_time"] = state_machine["elapsed_time"] + 1
    return true
end

print("=== State Machine Demo ===\n")

-- Determine next action based on current state
local current = get_state()

if current == STATES.IDLE then
    print("Starting system...")
    transition(STATES.LOADING)
    
elseif current == STATES.LOADING then
    print("Initialization complete")
    transition(STATES.RUNNING)
    
elseif current == STATES.RUNNING then
    print("System running...")
    if not handle_operation() then
        transition(STATES.ERROR)
    end
    
    if state_machine["operation_count"] >= 3 then
        print("Pausing system...")
        transition(STATES.PAUSED)
    end
    
elseif current == STATES.PAUSED then
    print("System paused, resuming...")
    transition(STATES.RUNNING)
    
elseif current == STATES.ERROR then
    print("Recovering from error...")
    state_machine["error_count"] = 0
    transition(STATES.STOPPED)
    
elseif current == STATES.STOPPED then
    print("System stopped")
    transition(STATES.IDLE)
end

-- Display state info
print("\n=== State Machine Status ===")
print("Current: " .. state_machine["current_state"])
print("Operations: " .. state_machine["operation_count"])
print("Errors: " .. state_machine["error_count"])
print("Elapsed time: " .. state_machine["elapsed_time"])

-- Return current status
return {
    state = state_machine["current_state"],
    operations = state_machine["operation_count"],
    errors = state_machine["error_count"],
    elapsed = state_machine["elapsed_time"]
}
