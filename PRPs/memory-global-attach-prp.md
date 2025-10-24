# Memory Global Attach PRP

## Project Overview
- Address loss of Lua global references to external tables after save/load cycles.
- Expose a stable `_G.Memory` table so developers access persistent state without tracking numeric IDs.
- Reduce friction in demos and user scripts by eliminating manual remapping work.

## Technical Requirements
- Initialization must create or reattach an external table and bind it to `_G.Memory`.
- Save/restore flows must persist the external table identifier.
- Changes must respect current Zig/JS bridge constraints (no dynamic allocation, wasm32-freestanding target).
- Updated API must remain backward compatible with existing persistence demos.

## Proposed Solutions
1. **Auto-Attach Table on Init**: During `init()`, call `ext.table()` (JS bridge) and set `_G.Memory` to the resulting table; store the table ID for reload.
2. **Metadata-Driven Rebind**: Extend serializer to record Lua globals → table IDs map and replay assignments when the module loads state.
3. **Lua Helper Module**: Provide a Lua module exposing `Memory = require('memory').get()` that internally handles table creation/rebinding using exported Zig helpers.

## Pros / Cons
- **Auto-Attach Table on Init**
  - Pros: Simplest DX, zero script changes, deterministic global name.
  - Cons: Requires Zig ↔ JS changes and care with idempotency across re-init.
- **Metadata-Driven Rebind**
  - Pros: General solution for multiple globals, flexible mappings.
  - Cons: Higher complexity, larger serialized payload, more restore steps.
- **Lua Helper Module**
  - Pros: Minimal engine changes, explicit opt-in for advanced users.
  - Cons: Developers still need to import helper; risk of multiple instances if misused.

## Recommended Solution
- Choose **Auto-Attach Table on Init** for consistent experience and minimal Lua surface changes. It balances implementation effort with usability and aligns with project goal of hiding storage plumbing.

## Implementation Steps
1. Extend Zig `init()` to request an external table, store its ID, and push it into `_G.Memory` (replace existing value if present).
2. Persist the table ID in the existing persistence layer; on load, rebind `_G.Memory` using the saved ID instead of creating a new table.
3. Update JS bridge to expose a helper for rebinding (e.g., `attachGlobal(tableId)`), ensuring graceful failure handling.
4. Adjust demo code to rely on `_G.Memory` and add regression tests covering save/load cycles.
5. Document the new behavior in `docs/` and `AGENTS.md` to guide future contributors.

## Success Criteria
- `_G.Memory` exists and points to the correct external table after any init or restore.
- Lua scripts using `_G.Memory` retain data across save/load without manual ID management.
- Playwright demo scenario covering persistence passes with the new defaults.
- No regressions in existing init/compute API behavior or memory statistics reporting.
