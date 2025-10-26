# Project Request Protocol: Lua WASM `_home` Storage Migration

## Project Overview

### Title
Adopt `_home` as the canonical external storage namespace for Lua WASM persistence

### Background
The current runtime exposes `_G.Memory` as the default external storage table for persisted data and serialized Lua functions. As the platform evolves toward message-driven compute units with inbox/outbox semantics, the name `Memory` lacks clarity and invites accidental overwrites. Renaming the namespace to `_home` aligns with the “home directory” metaphor for process-owned state while reinforcing that the table is framework-managed.

### Objective
Design and execute a migration that replaces `Memory` with `_home` as the default storage identifier, preserves function and data serialization guarantees, and maintains backward compatibility for existing applications.

### Scope
- Update Lua, Zig, and JavaScript layers to use `_home` by default
- Provide compatibility paths for existing `_G.Memory` references
- Ensure serializers/deserializers remain transparent for functions and structured data
- Update tooling, docs, and tests to reflect the new namespace

## Technical Requirements

### Functional Requirements
1. **FR1**: `_G._home` must initialize automatically for every runtime instance.
2. **FR2**: Function serialization/deserialization must operate identically under `_home`.
3. **FR3**: Existing code using `_G.Memory` should continue to work (deprecation window).
4. **FR4**: Inbox/outbox helpers must read/write state from `_home` by default.
5. **FR5**: Tooling APIs (JS bridge, persistence helpers) must expose the new identifier.

### Non-Functional Requirements
1. **NFR1**: No measurable performance regression (>1%) in serialization throughput.
2. **NFR2**: Migration logic must add <10KB to the WASM binary.
3. **NFR3**: Documentation and examples must be synchronized with code changes.
4. **NFR4**: Backward compatibility shims must be gated by a feature flag for removal.

### Constraints
- Maintain wasm32-freestanding target; no new host dependencies.
- Preserve IndexedDB storage schema to avoid data loss.
- Avoid mutating core Lua C sources beyond existing patch strategy.

## Proposed Solutions

### Solution A: Direct Rename with Alias Shim
Rename all internal references to `_home`, create `_G.Memory` as a thin alias pointing to `_home` during a deprecation period, and emit warnings when the alias is used.

### Solution B: Configurable Namespace with Default `_home`
Introduce a configurable namespace (default `_home`) set during initialization, automatically map legacy configs to `Memory`, and emit telemetry events for legacy usage.

### Solution C: Dual Namespace with Lazy Migration
Instantiate both `_home` and `Memory`, synchronize writes between them at runtime, and slowly phase out the `Memory` table once users manually migrate.

## Pros and Cons

### Solution A
- **Pros**: Minimal complexity; clear new name; easy to document; small code diff.
- **Cons**: Requires coordination to update all call sites; alias removal still manual.

### Solution B
- **Pros**: Flexible for future renames; supports custom deployments; structured telemetry.
- **Cons**: Higher implementation effort; added configuration surface; risk of misconfiguration.

### Solution C
- **Pros**: Zero-touch for existing apps; seamless data coexistence during migration.
- **Cons**: Doubles storage writes; increases state divergence risk; more complex GC.

## Best Solution Selection
**Recommendation: Solution A – Direct Rename with Alias Shim.** It delivers the clean naming goal with minimal overhead, keeps serialization pathways unchanged, and provides a straightforward deprecation story without introducing new configuration complexity or runtime synchronization.

## Implementation Steps
1. Rename internal constants and initialization hooks to `_home` (JS/Zig/Lua).
2. Create `_G.Memory` alias pointing to `_home` and log/flag usage.
3. Update serializers, inbox/outbox helpers, and tests to reference `_home`.
4. Refresh documentation, examples, and tooling guidance to the new namespace.
5. Add feature flag or environment switch to disable the legacy alias for testing.
6. Draft migration guide and release notes outlining timelines and removal plan.

## Success Criteria
- `_G._home` exists and is populated across all entry points; `_G.Memory` optional alias passes regression tests.
- Function serialization round-trips succeed via `_home` with zero regressions (unit + integration tests).
- Documentation (`docs/`, `examples/`, `web/`) references `_home` exclusively post-migration.
- Telemetry or logging confirms alias usage <5% of operations two releases post-launch.
- Removing the alias behind the feature flag yields no failing tests, indicating readiness for deprecation.
