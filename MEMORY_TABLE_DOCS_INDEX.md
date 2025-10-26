# Memory Table Analysis - Documentation Index

This directory contains comprehensive analysis of the Memory table persistence system and migration guide for renaming it to `_home`.

## Generated Documentation

### 📊 ANALYSIS_SUMMARY.md (7.6K)
**Executive summary - Read this first!**
- Quick answers to your 4 key questions
- High-level architecture overview
- Recommended implementation approach
- 5-minute brief of the entire system

**Best for:** Getting a quick overview, understanding the big picture

### 📖 MEMORY_TABLE_ANALYSIS.md (18K)
**Complete technical deep-dive**
- Detailed code-level analysis of every component
- Full explanation of serialization/deserialization flow
- Line-by-line breakdown of all key functions
- Architecture insights and design patterns
- All hardcoded references documented

**Best for:** Deep understanding, implementation details, troubleshooting

### 🗺️ MEMORY_TABLE_FLOW.txt (8.4K)
**Visual flow diagrams and traces**
- Step-by-step trace from Lua → IndexedDB
- Step-by-step restoration from IndexedDB → Lua
- Variable tracking table
- Synchronization points
- ASCII diagrams of data flow

**Best for:** Visual learners, understanding the complete flow

### ✅ RENAME_TO_HOME_CHECKLIST.md (10K)
**Implementation guide for renaming Memory to _home**
- File-by-file change checklist
- Three implementation options with pros/cons
- Phase-by-phase migration plan
- Testing strategy and verification steps
- File change matrix

**Best for:** Actually implementing the rename, step-by-step guidance

### ⚡ QUICK_REFERENCE.md (8.6K)
**Quick lookup reference card**
- 5-minute brief
- Function location table
- Code snippets for common patterns
- Testing commands
- Common pitfalls and solutions

**Best for:** Quick lookup during development, copy-paste code examples

## Reading Path

### For Quick Understanding:
1. **ANALYSIS_SUMMARY.md** - Get the big picture (5 min)
2. **QUICK_REFERENCE.md** - See key locations and patterns (5 min)

### For Implementation:
1. **ANALYSIS_SUMMARY.md** - Understand what you're changing
2. **RENAME_TO_HOME_CHECKLIST.md** - Follow step-by-step
3. **QUICK_REFERENCE.md** - Reference for code patterns

### For Deep Understanding:
1. **ANALYSIS_SUMMARY.md** - Start with overview
2. **MEMORY_TABLE_FLOW.txt** - Visualize the flow
3. **MEMORY_TABLE_ANALYSIS.md** - Read detailed analysis
4. **QUICK_REFERENCE.md** - Refer to specific functions

### For Troubleshooting:
1. **QUICK_REFERENCE.md** - Check common pitfalls
2. **MEMORY_TABLE_FLOW.txt** - Trace the data flow
3. **MEMORY_TABLE_ANALYSIS.md** - Dive into specifics

## Key Findings Summary

### Architecture Insights

1. **Name-Agnostic Persistence**
   - The entire persistence system uses numeric table IDs
   - The string "Memory" appears in ONLY 2 places
   - No table name mapping exists - IDs are the single source of truth

2. **Minimal Coupling**
   - Lua layer: String global variable pointing to table
   - WASM layer: Numeric ID tracking
   - JS layer: Numeric ID in Map keys
   - Storage layer: Numeric ID in IndexedDB records

3. **Simple Synchronization**
   - `memory_table_id` (Zig) ↔ `memoryTableId` (JS)
   - Synced via WASM exports: `get_memory_table_id()` / `attach_memory_table(id)`
   - Persisted in metadata: `metadata.memoryTableId`

### Implementation Findings

1. **Hardcoded References**
   - Only 2: src/main.zig lines 75 and 161
   - Both are `lua.setglobal(L, "Memory")` calls
   - No constants defined - should be centralized

2. **Files Requiring Changes**
   - **Core:** 2 files (src/main.zig, web/enhanced/lua-api-enhanced.js)
   - **Tests:** 1 file (tests/enhanced/enhanced-api.test.js)
   - **Docs/Examples:** Multiple files

3. **Files NOT Requiring Changes**
   - src/serializer.zig ✓
   - src/ext_table.zig ✓
   - web/lua-persistence.js ✓
   - web/lua-deserializer.js ✓
   - web/lua-api.js (core) ✓

### Recommended Approach

**Option A: Dual Global (Recommended)**
```zig
// Set both _home and Memory to the same table
lua.pushvalue(L, -1);
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");
```

**Benefits:**
- Zero breaking changes
- Smooth migration path
- Both names work identically
- Users adopt at their own pace

## Quick Start for Implementation

### Minimal Change (2 lines)

1. Edit `src/main.zig` line 75:
```zig
// Before:
lua.setglobal(L, "Memory");

// After:
lua.pushvalue(L, -1);
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");
```

2. Edit `src/main.zig` line 161:
```zig
// Before:
lua.setglobal(L, "Memory");

// After:
lua.pushvalue(L, -1);
lua.setglobal(L, "_home");
lua.setglobal(L, "Memory");
```

3. Rebuild:
```bash
./build.sh
```

4. Test:
```bash
npm test
```

Done! Both `_home` and `Memory` now work.

## Data Flow in One Diagram

```
┌──────────────┐
│ Lua Script   │  Memory["key"] = "value"
└──────┬───────┘
       │ uses table.__ext_table_id = 1
       ↓
┌──────────────┐
│ WASM (Zig)   │  memory_table_id = 1
└──────┬───────┘  ext_table_newindex() → js_ext_table_set(1, ...)
       │
       ↓
┌──────────────┐
│ JS Bridge    │  externalTables.get(1).set("key", value)
└──────┬───────┘
       │
       ↓
┌──────────────┐
│ IndexedDB    │  { id: 1, data: {"key": ...} }
└──────────────┘  { id: '__metadata__', data: {memoryTableId: 1} }
```

## Questions Answered

### 1. How is the memory table identified and managed?
**By a numeric ID (u32).** The ID flows through WASM (`memory_table_id`) → JS (`memoryTableId`) → IndexedDB (`metadata.memoryTableId`). The string "Memory" is just a Lua global variable name.

### 2. How does the JavaScript bridge interact?
**Through numeric table IDs.** Functions like `js_ext_table_set(tableId, ...)` use the numeric ID to index into `externalTables` Map. The bridge is name-agnostic.

### 3. What is memory_table_id and how is it tracked?
**A u32 variable** in WASM that stores which numeric ID corresponds to the "Memory" global. Synchronized with JS via exports, persisted in IndexedDB metadata.

### 4. Hardcoded references?
**Only 2 in src/main.zig** (lines 75, 161). No constants exist. Should centralize as:
```zig
const MEMORY_TABLE_NAME = "_home";
const LEGACY_MEMORY_TABLE_NAME = "Memory";
```

## File Statistics

| File | Size | Lines | Purpose |
|------|------|-------|---------|
| ANALYSIS_SUMMARY.md | 7.6K | ~350 | Executive summary |
| MEMORY_TABLE_ANALYSIS.md | 18K | ~850 | Complete analysis |
| MEMORY_TABLE_FLOW.txt | 8.4K | ~300 | Flow diagrams |
| RENAME_TO_HOME_CHECKLIST.md | 10K | ~450 | Implementation guide |
| QUICK_REFERENCE.md | 8.6K | ~450 | Quick reference |

**Total:** ~52K of documentation, ~2,400 lines

## Next Steps

1. **Read ANALYSIS_SUMMARY.md** to understand the system
2. **Review RENAME_TO_HOME_CHECKLIST.md** for implementation options
3. **Decide on approach:** Dual global vs clean rename
4. **Make changes** (2 lines in src/main.zig)
5. **Update tests and docs**
6. **Test thoroughly** using commands in QUICK_REFERENCE.md

## Contact

For questions or clarifications, refer to:
- The source code with file:line references provided
- The detailed function analysis in MEMORY_TABLE_ANALYSIS.md
- The flow traces in MEMORY_TABLE_FLOW.txt

---

**Last Updated:** 2025-10-26  
**Analysis Version:** 1.0  
**Codebase Version:** Current as of analysis date
