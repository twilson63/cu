# Browser Testing Checklist - Cu WASM Persistent Demo

This checklist guides manual browser testing of the Cu WASM integration. Use this to verify functionality before each release.

## Pre-Test Setup

- [ ] Navigate to `http://localhost:8000` (ensure server is running: `cd web && python3 -m http.server 8000`)
- [ ] Open browser console (F12 or Cmd+Option+I)
- [ ] Clear browser cache or do a hard refresh (Ctrl+Shift+R)
- [ ] Note browser version for compatibility testing

## Test 1: Page Loads Successfully

### Steps
1. [ ] Open index.html in browser
2. [ ] Verify page displays without JavaScript errors
3. [ ] Check that "Code Editor" and "Memory Stats" sections are visible
4. [ ] Verify WASM module initializes (check console for init message)

### Expected Results
- [ ] Page loads in < 2 seconds
- [ ] No console errors or exceptions
- [ ] "WASM module initialized" message appears in console
- [ ] Code editor is interactive

### Notes
```
Date tested: ___________
Browser: ___________
Result: Pass / Fail
Issues: ___________
```

## Test 2: Counter Script Test

### Steps
1. [ ] Paste the following code into editor:
```lua
-- Counter with persistence
counter = ext.table()
if counter["count"] == nil then
    counter["count"] = 0
end

counter["count"] = counter["count"] + 1
print("Counter: " .. counter["count"])
return counter["count"]
```

2. [ ] Click "Run Code" button
3. [ ] Verify output shows "Counter: 1" and return value is 1
4. [ ] Click "Run Code" again without changing code
5. [ ] Verify output shows "Counter: 2" and return value is 2

### Expected Results
- [ ] First run: output "Counter: 1", return value 1
- [ ] Second run: output "Counter: 2", return value 2
- [ ] Third run: output "Counter: 3", return value 3
- [ ] State persists across multiple executions
- [ ] No errors in console

### Notes
```
Date tested: ___________
Browser: ___________
Result: Pass / Fail
Issues: ___________
```

## Test 3: Large Dataset (1000 Items)

### Steps
1. [ ] Paste the following code into editor:
```lua
local items = ext.table()

print("Creating 1000 items...")
for i = 1, 1000 do
    items["item_" .. i] = {
        id = i,
        name = "Item " .. i,
        value = i * 100
    }
    if i % 100 == 0 then
        print("  Created " .. i .. " items")
    end
end

print("Total items: " .. #items)
return #items
```

2. [ ] Click "Run Code"
3. [ ] Monitor performance and memory usage
4. [ ] Verify all items were created

### Expected Results
- [ ] Code completes in < 5 seconds
- [ ] Output shows progress messages (100, 200, ... 1000)
- [ ] Return value is 1000
- [ ] Memory stats show reasonable increase
- [ ] No "out of memory" errors

### Performance Targets
- [ ] Execution time: < 5 seconds
- [ ] Memory used: < 500KB additional
- [ ] No UI freezing

### Notes
```
Date tested: ___________
Browser: ___________
Execution time: ___________
Memory increase: ___________
Result: Pass / Fail
Issues: ___________
```

## Test 4: Error Handling

### Subtest 4A: Syntax Error
1. [ ] Paste invalid code: `return 42 +++`
2. [ ] Click "Run Code"
3. [ ] Verify error is displayed clearly

Expected: [ ] Error message shown, syntax error mentioned

### Subtest 4B: Runtime Error
1. [ ] Paste code with undefined function: `return undefined_func()`
2. [ ] Click "Run Code"
3. [ ] Verify error is displayed

Expected: [ ] Error message shown, mentions undefined function

### Subtest 4C: Stack Safety
1. [ ] Paste error-causing code
2. [ ] Click "Run Code" (expect error)
3. [ ] Paste valid code: `return 42`
4. [ ] Click "Run Code" again

Expected: [ ] Second eval works correctly despite previous error

### Subtest 4D: Large Error Messages
1. [ ] Create an error with detailed stack trace
2. [ ] Verify error message is readable (not truncated unexpectedly)

### Notes
```
Date tested: ___________
Browser: ___________
All error subtests passed: Yes / No
Issues: ___________
```

## Test 5: State Persistence Across Reloads

### Steps
1. [ ] Execute code to set persistent state:
```lua
data = ext.table()
data["key"] = "value"
data["number"] = 42
print("Data stored")
return true
```

2. [ ] Click "Run Code"
3. [ ] Verify output shows "Data stored"
4. [ ] Reload the page (F5)
5. [ ] After reload, execute:
```lua
print("Key: " .. (data["key"] or "empty"))
print("Number: " .. (data["number"] or "empty"))
return data["key"] == "value"
```

6. [ ] Click "Run Code"

### Expected Results
- [ ] Before reload: State stored successfully
- [ ] After reload: External table data is cleared (new instance)
- [ ] Return value is false (state doesn't survive page reload)

**Note:** External table state is per-session. For persistence across page reloads, use browser storage (localStorage/IndexedDB) to save/load data.

### Alternative Test: Session Persistence
1. [ ] Execute code that stores data
2. [ ] Execute more code that retrieves and modifies data
3. [ ] Verify data persists within same session

Expected: [ ] Data persists across multiple evals in same session

### Notes
```
Date tested: ___________
Browser: ___________
Session persistence: Pass / Fail
Reload persistence: N/A (by design)
Issues: ___________
```

## Test 6: Memory Stats Display

### Steps
1. [ ] Observe "Memory Stats" section in UI
2. [ ] Note initial values:
   - [ ] IO Buffer Size
   - [ ] Lua Memory Used
   - [ ] WASM Pages

3. [ ] Execute code that uses memory:
```lua
local t = ext.table()
for i = 1, 100 do
    t["data_" .. i] = string.rep("x", 1000)
end
return "done"
```

4. [ ] Check Memory Stats again
5. [ ] Verify values updated

### Expected Results
- [ ] Memory stats displayed correctly
- [ ] Values update after memory-intensive operations
- [ ] Values are reasonable numbers (not 0 or negative)
- [ ] IO Buffer Size remains constant (~64KB)
- [ ] Lua Memory Used increases with data storage

### Notes
```
Date tested: ___________
Browser: ___________
Stats displaying: Yes / No
Stats updating: Yes / No
Result: Pass / Fail
Issues: ___________
```

## Test 7: Output Capture and Display

### Steps
1. [ ] Test simple print:
```lua
print("Hello, World!")
return 42
```
Expected: Output shows "Hello, World!" ✓

2. [ ] Test multiple prints:
```lua
for i = 1, 5 do print(i) end
return "done"
```
Expected: Output shows 1, 2, 3, 4, 5 ✓

3. [ ] Test mixed types:
```lua
print("String:", 42, true, nil)
return 1
```
Expected: Output correctly formatted ✓

4. [ ] Test large output:
```lua
for i = 1, 100 do print("Line " .. i) end
return "done"
```
Expected: All output visible or scrollable ✓

### Notes
```
Date tested: ___________
Browser: ___________
All output tests: Pass / Fail
Issues: ___________
```

## Test 8: Code Editor Features

### Steps
1. [ ] Verify syntax highlighting works (Lua keywords colored)
2. [ ] Test code comments: `-- this is a comment`
3. [ ] Test multiline code:
```lua
local x = 10
local y = 20
return x + y
```
4. [ ] Test undo/redo (if available)
5. [ ] Test clear button clears editor

### Notes
```
Date tested: ___________
Browser: ___________
Syntax highlighting: Working / Not working
Comments: Handled correctly / Issues
Multiline: Working / Not working
Result: Pass / Fail
Issues: ___________
```

## Test 9: Cross-Browser Compatibility

Test on each of these browsers:

### Chrome/Chromium
- [ ] Page loads
- [ ] Code executes
- [ ] Output displays
- [ ] Memory stats show
- [ ] No console errors

### Firefox
- [ ] Page loads
- [ ] Code executes
- [ ] Output displays
- [ ] Memory stats show
- [ ] No console errors

### Safari
- [ ] Page loads
- [ ] Code executes
- [ ] Output displays
- [ ] Memory stats show
- [ ] No console errors

### Edge
- [ ] Page loads
- [ ] Code executes
- [ ] Output displays
- [ ] Memory stats show
- [ ] No console errors

### Notes
```
Chrome version: ___________  Status: Pass / Fail
Firefox version: ___________  Status: Pass / Fail
Safari version: ___________  Status: Pass / Fail
Edge version: ___________  Status: Pass / Fail
Overall compatibility: ✓ Good / ⚠ Issues / ✗ Major problems
Issues: ___________
```

## Test 10: Performance and Stability

### CPU Performance Test
1. [ ] Execute performance test:
```lua
local sum = 0
for i = 1, 10000 do
    sum = sum + i
end
print("Sum: " .. sum)
return sum
```
2. [ ] Measure execution time (use browser dev tools)
3. [ ] Expected: < 1 second

### Memory Stability Test
1. [ ] Note starting memory stats
2. [ ] Execute 20 iterations of code from Test 3
3. [ ] Check memory stats after
4. [ ] Expected: No exponential growth

### Long-Running Test
1. [ ] Execute loop 100 times
2. [ ] Monitor for:
   - [ ] No memory leaks
   - [ ] Consistent performance
   - [ ] No UI freezing

### Notes
```
Date tested: ___________
Browser: ___________
CPU performance: ___________
Memory stability: Stable / Growing / Issues
Long-run stability: Stable / Issues
Result: Pass / Fail
Issues: ___________
```

## Summary Checklist

- [ ] Test 1: Page Loads - Pass
- [ ] Test 2: Counter Script - Pass
- [ ] Test 3: Large Dataset - Pass
- [ ] Test 4: Error Handling - Pass
- [ ] Test 5: State Persistence - Pass
- [ ] Test 6: Memory Stats - Pass
- [ ] Test 7: Output Capture - Pass
- [ ] Test 8: Code Editor - Pass
- [ ] Test 9: Cross-Browser - Pass
- [ ] Test 10: Performance - Pass

## Final Release Sign-Off

- [ ] All tests passed
- [ ] No critical issues
- [ ] No memory leaks detected
- [ ] Performance meets targets
- [ ] Browser compatibility verified

**Tested by:** ___________
**Date:** ___________
**Version:** ___________
**Status:** ✓ Ready for Release / ⚠ Known Issues / ✗ Not Ready

---

## Troubleshooting Tips

If tests fail:

1. **Page doesn't load**: Check browser console for errors, verify WASM file exists
2. **Code doesn't execute**: Check browser console for WASM initialization errors
3. **Memory stats wrong**: Try clearing browser cache and reloading
4. **Slow performance**: Check browser resources (Task Manager), close other tabs
5. **Error messages unclear**: Try smaller examples to isolate issue

For detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
