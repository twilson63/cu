# Project Request Protocol: Rename WASM Artifact to cu.wasm

## Project Overview

### Problem Statement

The project has been renamed from `lua-persistent-demo` to `cu` (Compute Unit), but the WASM artifact is still named `lua.wasm`. This creates inconsistency:

1. **Naming Inconsistency**: Project is `cu` but artifact is `lua.wasm`
2. **Documentation Confusion**: All examples reference `lua.wasm` instead of `cu.wasm`
3. **Branding Mismatch**: The name doesn't align with the project's identity as a compute unit
4. **Future-Proofing**: Current name ties us to Lua implementation details rather than the compute abstraction

### Current State

**Current Artifact Name**: `lua.wasm`  
**Used in**:
- Build output: `web/lua.wasm`
- All documentation examples
- HTML demo files
- JavaScript imports
- Test configurations
- GitHub references

### Proposed Solution

Rename the WASM artifact from `lua.wasm` to `cu.wasm` throughout the entire codebase to align with the project's new identity as a Compute Unit.

### Goals

1. Rename WASM output artifact from `lua.wasm` to `cu.wasm`
2. Update all references in code, documentation, and examples
3. Update build scripts to output `cu.wasm`
4. Maintain backwards compatibility where possible
5. Update all import statements and URL references

### Non-Goals

- Changing the internal Lua implementation (remains Lua 5.4.7)
- Modifying the API function names (can still reference "lua" internally)
- Breaking existing deployments (provide migration path)
- Renaming source files in `src/lua/` directory

## Technical Requirements

### Functional Requirements

**FR1**: Build script outputs `cu.wasm` instead of `lua.wasm`
- Modify `build.sh` to rename output artifact
- Maintain build process integrity

**FR2**: Update all JavaScript imports
- `web/lua-api.js` and related files
- `web/lua-persistent.js`
- `web/lua-compute.js`
- All demo HTML files

**FR3**: Update documentation
- README.md examples
- API reference documentation
- Quick start guides
- Migration guides
- All PRD/PRP documents

**FR4**: Update example code
- `examples/` directory
- `demo/` directory
- Test files
- Integration examples

**FR5**: Provide backwards compatibility mechanism
- Alias support for legacy `lua.wasm` name
- Documentation for migration
- Deprecation notice

### Non-Functional Requirements

**NFR1**: Zero Breaking Changes for New Users
- New installations use `cu.wasm` by default
- Clear documentation from the start

**NFR2**: Migration Path for Existing Users
- Clear upgrade instructions
- Optional backwards compatibility
- Deprecation timeline

**NFR3**: Consistency
- All references updated atomically
- No mixed naming in documentation
- Consistent branding throughout

**NFR4**: Build System Integrity
- Build script remains reliable
- No performance degradation
- Same WASM output (just renamed)

## Proposed Solutions

### Solution 1: Simple Rename with No Backwards Compatibility

**Description**: Directly rename `lua.wasm` to `cu.wasm` everywhere without any compatibility layer. Clean break approach.

**Implementation**:
```bash
# build.sh
# Change output from:
mv lua.wasm web/lua.wasm
# To:
mv lua.wasm web/cu.wasm
```

**Update all references**:
- JavaScript: `fetch('./lua.wasm')` → `fetch('./cu.wasm')`
- Documentation: All instances of `lua.wasm` → `cu.wasm`
- HTML examples: `<script src="lua.wasm">` → `<script src="cu.wasm">`

**Pros**:
- ✅ Simple and clean
- ✅ No technical debt
- ✅ Fastest to implement
- ✅ Clear naming going forward
- ✅ No confusion about which file to use

**Cons**:
- ❌ Breaks existing deployments immediately
- ❌ No migration period
- ❌ Documentation on the web becomes outdated
- ❌ Third-party integrations break
- ❌ GitHub gists/snippets become invalid

**Complexity**: Low (2-3 hours)

---

### Solution 2: Rename with Backwards Compatibility Alias

**Description**: Rename to `cu.wasm` but provide a copy/symlink as `lua.wasm` for backwards compatibility. Deprecate the old name over time.

**Implementation**:
```bash
# build.sh
mv lua.wasm web/cu.wasm
# Create backwards compatibility copy
cp web/cu.wasm web/lua.wasm

# Add deprecation notice in lua-api.js
if (wasmPath.includes('lua.wasm')) {
  console.warn('[DEPRECATED] lua.wasm is deprecated. Please use cu.wasm instead.');
}
```

**Documentation**:
- New examples use `cu.wasm`
- Migration guide for `lua.wasm` → `cu.wasm`
- Deprecation notice in README

**Deprecation Timeline**:
- v2.0: Both files available, `lua.wasm` marked deprecated
- v2.1: Still provide both, stronger warnings
- v3.0: Remove `lua.wasm` completely

**Pros**:
- ✅ Graceful migration path
- ✅ Existing code continues to work
- ✅ Clear deprecation timeline
- ✅ Time for third-party integrations to update
- ✅ Reduces support burden

**Cons**:
- ❌ Two copies of the same file (doubles size)
- ❌ Confusion about which file to use
- ❌ Maintenance overhead
- ❌ Technical debt until v3.0
- ❌ Need to maintain both paths in code

**Complexity**: Medium (4-5 hours)

---

### Solution 3: Configurable Artifact Name with cu.wasm as Default

**Description**: Make the artifact name configurable via build flag, default to `cu.wasm` but allow building as `lua.wasm` if needed.

**Implementation**:
```bash
# build.sh
ARTIFACT_NAME=${ARTIFACT_NAME:-cu.wasm}

zig build-lib \
  # ... existing flags ...
  -femit-bin=web/${ARTIFACT_NAME}

echo "Built: web/${ARTIFACT_NAME}"
```

**JavaScript**:
```javascript
// web/lua-api.js
const WASM_ARTIFACT = process.env.CU_WASM_NAME || 'cu.wasm';

export async function loadLuaWasm(options = {}) {
  const { wasmPath = `./${WASM_ARTIFACT}` } = options;
  // ... rest of code
}
```

**Usage**:
```bash
# Default: builds cu.wasm
./build.sh

# Legacy: builds lua.wasm
ARTIFACT_NAME=lua.wasm ./build.sh
```

**Pros**:
- ✅ Maximum flexibility
- ✅ Supports both use cases
- ✅ No forced migration
- ✅ Easy to maintain both paths
- ✅ Can switch between names easily

**Cons**:
- ❌ Most complex solution
- ❌ Environment variable confusion
- ❌ Documentation needs to cover both cases
- ❌ Split ecosystem (some use cu.wasm, some use lua.wasm)
- ❌ Doesn't solve the naming consistency problem
- ❌ Maintenance burden on both paths

**Complexity**: High (6-7 hours)

---

## Solution Comparison Matrix

| Criteria | Solution 1 (Simple) | Solution 2 (Alias) | Solution 3 (Configurable) |
|----------|---------------------|--------------------|-----------------------------|
| Implementation Time | 2-3 hours | 4-5 hours | 6-7 hours |
| Breaking Changes | Yes (immediate) | No (gradual) | No |
| Code Complexity | Low | Medium | High |
| Maintenance Burden | Low | Medium | High |
| Migration Path | None | Excellent | Flexible |
| Naming Consistency | Excellent | Good | Poor |
| User Confusion | Low (after update) | Medium | High |
| Technical Debt | None | Temporary | Permanent |
| Future-Proofing | Excellent | Good | Poor |

## Recommended Solution

**Solution 2: Rename with Backwards Compatibility Alias**

### Rationale

While Solution 1 is cleanest technically, **Solution 2 is recommended** because:

1. **Graceful Migration**: Existing users aren't forced to update immediately
2. **Reduced Support Burden**: No flood of "broken deployment" issues
3. **Professional Approach**: Shows consideration for existing users
4. **Clear Path Forward**: Deprecation timeline sets expectations
5. **Manageable Debt**: Only ~2.4KB duplication (WASM file size), removed in v3.0
6. **Industry Standard**: Follows common deprecation practices

### When to Use Solution 1

Consider Solution 1 if:
- Project is still in beta/alpha (currently at v2.0.0, so no)
- No known external users (we don't know usage, assume there are users)
- Need immediate clean break (not required here)

### When to Use Solution 3

Consider Solution 3 if:
- Need to support multiple artifact names long-term (not the case)
- Building for different platforms with different names (not applicable)
- Have strong backwards compatibility requirements beyond v3.0 (not needed)

## Implementation Plan

### Phase 1: Preparation

#### Step 1: Audit Current References
**Time**: 30 minutes

**Tasks**:
- Find all references to `lua.wasm` in codebase
- Document each file and line number
- Create checklist of files to update

```bash
# Search command
rg "lua\.wasm" --type-add 'web:*.{js,html,md}' --type web -l
```

**Expected Files**:
- `build.sh`
- `web/lua-api.js`
- `web/lua-persistent.js`
- `web/lua-compute.js`
- `demo/*.html`
- `examples/*.html`
- `README.md`
- `docs/*.md`
- `tests/*.js`

---

#### Step 2: Update Build Script
**File**: `build.sh`

**Changes**:
```bash
# Find the current output line (around line 100)
# Old:
# Build output written to web/lua.wasm

# New:
echo "✅ Build complete!"
echo "   Output: web/cu.wasm"
echo "   Size: $(du -h web/cu.wasm | cut -f1)"

# Create backwards compatibility copy
echo "   Compat: web/lua.wasm (deprecated)"
cp web/cu.wasm web/lua.wasm
```

**Update final mv command**:
```bash
# Old:
mv zig-out/lib/liblua.wasm web/lua.wasm

# New:
mv zig-out/lib/liblua.wasm web/cu.wasm
```

**Time**: 15 minutes

---

#### Step 3: Update JavaScript Files
**Files**: 
- `web/lua-api.js`
- `web/lua-persistent.js`
- `web/lua-compute.js`
- `web/io-wrapper.js`

**Changes to lua-api.js**:
```javascript
// Add deprecation warning helper
function checkDeprecatedPath(path) {
  if (path && path.includes('lua.wasm')) {
    console.warn(
      '[DEPRECATED] lua.wasm is deprecated and will be removed in v3.0. ' +
      'Please update to cu.wasm. See: https://github.com/twilson63/cu#migration'
    );
  }
}

export async function loadLuaWasm(options = {}) {
  const { 
    wasmPath = './cu.wasm',  // Changed from './lua.wasm'
    autoRestore = true 
  } = options;
  
  checkDeprecatedPath(wasmPath);
  
  // ... rest of code
}
```

**Changes to lua-persistent.js**:
```javascript
async load(wasmPath = 'lua.wasm') {  // Keep default for backwards compat
  // Add deprecation warning
  if (wasmPath === 'lua.wasm') {
    console.warn('[DEPRECATED] lua.wasm → cu.wasm. Update your code.');
  }
  
  const response = await fetch(wasmPath);
  // ... rest of code
}
```

**Changes to lua-compute.js**:
```javascript
constructor(wasmPath = './cu.wasm') {  // Changed default
  this.wasmPath = wasmPath;
  checkDeprecatedPath(wasmPath);
  // ... rest of code
}
```

**Time**: 1 hour

---

### Phase 2: Documentation Updates

#### Step 4: Update README.md
**File**: `README.md`

**Changes**:
1. Update CDN example:
```html
<!-- Old -->
<script src="https://unpkg.com/cu@2.0.0/dist/cu.js"></script>

<!-- Update to reference cu.wasm internally -->
```

2. Update installation examples:
```bash
# Quick start now references cu.wasm
await fetch('./cu.wasm');
```

3. Add migration note:
```markdown
### ⚠️ Migration from v1.x

If you're using `lua.wasm`, please update to `cu.wasm`:

- **v2.0+**: Both `cu.wasm` and `lua.wasm` are provided (lua.wasm deprecated)
- **v3.0**: Only `cu.wasm` will be available

Update your code:
```javascript
// Before
await lua.loadLuaWasm({ wasmPath: './lua.wasm' });

// After
await lua.loadLuaWasm({ wasmPath: './cu.wasm' });
// Or simply use default (no wasmPath needed)
await lua.loadLuaWasm();
```

**Time**: 30 minutes

---

#### Step 5: Update API Reference
**File**: `docs/API_REFERENCE.md`

**Changes**:
1. Update `loadLuaWasm()` documentation:
```markdown
#### `loadLuaWasm(options?)`

Load the cu.wasm module.

**Parameters:**
- `options.wasmPath` (string, optional): Path to cu.wasm file (default: './cu.wasm')
  - **Note**: Using 'lua.wasm' is deprecated and will show a warning
- `options.autoRestore` (boolean, optional): Auto-restore persisted state (default: true)
```

2. Add deprecation notice section
3. Update all code examples to use `cu.wasm`

**Time**: 30 minutes

---

#### Step 6: Update All Documentation Files
**Files**: All files in `docs/`

Update references in:
- `docs/QUICK_START.md`
- `docs/ARCHITECTURE.md`
- `docs/BUILD_AND_DEPLOYMENT_GUIDE.md`
- `docs/BROWSER_TESTING.md`
- `docs/IO_TABLE_API.md`
- `docs/MIGRATION_TO_IO_TABLE.md`
- `docs/WASM_API_REFERENCE.md`
- All other `.md` files

**Search and replace**:
```bash
# In all docs
lua.wasm → cu.wasm
```

**Add note to migration guides**:
```markdown
> **Note**: As of v2.0, the WASM artifact is named `cu.wasm` (previously `lua.wasm`).
> Both are provided for backwards compatibility, but `lua.wasm` is deprecated.
```

**Time**: 1 hour

---

### Phase 3: Examples and Tests

#### Step 7: Update Example Files
**Files**: 
- `examples/*.html`
- `examples/*.js`
- `demo/*.html`

**Changes**:
```html
<!-- Old -->
<script type="module">
  import lua from './lua-api.js';
  await lua.loadLuaWasm({ wasmPath: './lua.wasm' });
</script>

<!-- New -->
<script type="module">
  import lua from './lua-api.js';
  await lua.loadLuaWasm({ wasmPath: './cu.wasm' });
  // Or just: await lua.loadLuaWasm(); (uses cu.wasm by default)
</script>
```

**Update fetch calls**:
```javascript
// Old
const response = await fetch('./lua.wasm');

// New
const response = await fetch('./cu.wasm');
```

**Time**: 45 minutes

---

#### Step 8: Update Test Files
**Files**: 
- `tests/*.test.js`
- `playwright.config.js`

**Changes**:
```javascript
// tests/integration.test.js
test.beforeEach(async ({ page }) => {
  // Update WASM path expectations
  await page.goto('http://localhost:8000/demo/index.html');
  
  // Update any hardcoded references
  // Old: expect(page.url()).toContain('lua.wasm');
  // New: Can reference either (both work)
});
```

**playwright.config.js**:
- Update any webServer configuration if it references lua.wasm
- Update test artifact paths

**Time**: 30 minutes

---

### Phase 4: Migration Guide and Deprecation Notice

#### Step 9: Create Migration Guide
**File**: `docs/MIGRATION_LUA_WASM_TO_CU_WASM.md` (new)

**Contents**:
```markdown
# Migration Guide: lua.wasm → cu.wasm

## Overview

As of v2.0.0, the WASM artifact has been renamed from `lua.wasm` to `cu.wasm` to align with the project's rebranding as a Compute Unit.

## Timeline

- **v2.0.0**: Both `cu.wasm` and `lua.wasm` provided (deprecated warning)
- **v2.1.0**: Both files available, stronger deprecation warnings
- **v3.0.0**: `lua.wasm` removed, only `cu.wasm` available

## Migration Steps

### Step 1: Update WASM Path

**Before:**
```javascript
await lua.loadLuaWasm({ wasmPath: './lua.wasm' });
```

**After:**
```javascript
await lua.loadLuaWasm({ wasmPath: './cu.wasm' });
// Or use default (recommended):
await lua.loadLuaWasm();
```

### Step 2: Update HTML References

**Before:**
```html
<script src="lua.wasm"></script>
```

**After:**
```html
<script src="cu.wasm"></script>
```

### Step 3: Update Deployment

If you deploy the WASM file separately:
- Copy/rename `web/lua.wasm` to `cu.wasm` in your deployment
- Update CDN/static asset references
- Update documentation

### Step 4: Update Tests

Update any test fixtures or mocks that reference `lua.wasm`.

## Backwards Compatibility

For v2.x, both files are provided:
- `cu.wasm` - Primary artifact (recommended)
- `lua.wasm` - Compatibility copy (deprecated)

You can continue using `lua.wasm` during v2.x, but you'll see deprecation warnings in the console.

## Why the Change?

The project was renamed from "lua-persistent-demo" to "cu" (Compute Unit) to better reflect its purpose. The WASM artifact name now aligns with this identity.

## Need Help?

- Check the [Quick Start Guide](QUICK_START.md)
- Review the [API Reference](API_REFERENCE.md)
- Open an issue: https://github.com/twilson63/cu/issues
```

**Time**: 30 minutes

---

#### Step 10: Update CHANGELOG and Release Notes
**File**: `CHANGELOG.md`

**Add entry**:
```markdown
## [2.1.0] - 2025-01-XX

### Changed
- **BREAKING (v3.0)**: Renamed WASM artifact from `lua.wasm` to `cu.wasm`
  - Both files provided in v2.x for backwards compatibility
  - `lua.wasm` is deprecated and will be removed in v3.0
  - See [Migration Guide](docs/MIGRATION_LUA_WASM_TO_CU_WASM.md)

### Added
- Deprecation warnings when using `lua.wasm`
- Migration guide for lua.wasm → cu.wasm transition
- Backwards compatibility copy of WASM artifact
```

**Time**: 15 minutes

---

### Phase 5: Testing and Verification

#### Step 11: Build and Test
**Time**: 30 minutes

**Tasks**:
1. Run build script: `./build.sh`
2. Verify both files exist:
   - `web/cu.wasm` (primary)
   - `web/lua.wasm` (deprecated copy)
3. Verify both have same size
4. Run test suite: `npm test`
5. Test deprecation warning appears when using `lua.wasm`
6. Test default path uses `cu.wasm`

**Verification**:
```bash
# Check both files exist
ls -lh web/*.wasm

# Should show:
# cu.wasm   -> 1.6M
# lua.wasm  -> 1.6M (copy)

# Verify they're identical
diff web/cu.wasm web/lua.wasm
# Should output nothing (files are identical)

# Run tests
npm test

# Check examples work
npm run demo
# Visit http://localhost:8000 and test
```

---

#### Step 12: Update .gitignore
**File**: `.gitignore`

Ensure both WASM artifacts are tracked correctly:
```gitignore
# Keep both for now (v2.x)
# In v3.0, we'll ignore lua.wasm

# Build artifacts
zig-cache/
zig-out/

# But track WASM output
!web/cu.wasm
!web/lua.wasm
```

**Time**: 5 minutes

---

## Timeline

### Total Estimated Time: 6-7 hours

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1 | Audit current references | 30 min | - |
| 1 | Update build script | 15 min | Step 1 |
| 1 | Update JavaScript files | 1 hour | Step 1 |
| 2 | Update README | 30 min | Step 3 |
| 2 | Update API Reference | 30 min | Step 3 |
| 2 | Update all docs | 1 hour | Step 3 |
| 3 | Update examples | 45 min | Step 2 |
| 3 | Update tests | 30 min | Step 2 |
| 4 | Create migration guide | 30 min | All above |
| 4 | Update CHANGELOG | 15 min | Step 9 |
| 5 | Build and test | 30 min | All above |
| 5 | Update .gitignore | 5 min | Step 11 |

### Milestones

- **Hour 2**: Build system updated, both artifacts building
- **Hour 4**: All documentation updated
- **Hour 6**: All examples and tests updated
- **Hour 7**: Migration guide complete, ready to commit

---

## Success Criteria

### Functional Success Criteria

**SC1**: Build produces both `cu.wasm` and `lua.wasm`
```bash
./build.sh
ls web/cu.wasm web/lua.wasm  # Both exist
```

**SC2**: Both files are identical
```bash
diff web/cu.wasm web/lua.wasm  # No output
```

**SC3**: Default path uses `cu.wasm`
```javascript
await lua.loadLuaWasm();  // Uses cu.wasm by default
```

**SC4**: Deprecation warning shown for `lua.wasm`
```javascript
await lua.loadLuaWasm({ wasmPath: './lua.wasm' });
// Console: "[DEPRECATED] lua.wasm is deprecated..."
```

**SC5**: Documentation consistently uses `cu.wasm`
```bash
# Search all docs
rg "lua\.wasm" docs/
# Should only appear in migration guide and deprecation notices
```

**SC6**: All examples work with both artifacts
```javascript
// Both work in v2.x
fetch('./cu.wasm')    // ✅ Recommended
fetch('./lua.wasm')   // ✅ Deprecated but works
```

### Quality Success Criteria

**SC7**: All tests pass
- Build succeeds
- Integration tests pass
- Example demos work
- No broken links in documentation

**SC8**: Clear migration path documented
- Migration guide complete
- Deprecation timeline clear
- Code examples provided
- FAQ answers common questions

**SC9**: No breaking changes in v2.x
- Existing code continues to work
- Both files available
- Warnings are informative, not errors

**SC10**: Professional deprecation handling
- Console warnings are clear
- Documentation is comprehensive
- Timeline is communicated
- Support resources provided

---

## Risk Assessment

### High Risk Items

**R1**: Breaking existing deployments
- **Mitigation**: Provide both files in v2.x
- **Fallback**: Keep lua.wasm until v3.0

**R2**: Confusion about which file to use
- **Mitigation**: Clear documentation and defaults
- **Fallback**: Deprecation warnings guide users

**R3**: Third-party integrations break
- **Mitigation**: Backwards compatibility period
- **Fallback**: Extended support if needed

### Medium Risk Items

**R4**: CDN caching issues
- **Mitigation**: Document cache busting strategies
- **Fallback**: Provide versioned URLs

**R5**: Search engine/documentation fragmentation
- **Mitigation**: Update all official docs
- **Fallback**: Add redirects/aliases where possible

### Low Risk Items

**R6**: User confusion during transition
- **Mitigation**: Clear messaging in all channels
- **Fallback**: FAQ and support

---

## Deprecation Timeline

### v2.0.0 (Current)
- ✅ Introduce `cu.wasm` as primary artifact
- ✅ Provide `lua.wasm` as backwards compatibility copy
- ✅ Show deprecation warning when using `lua.wasm`
- ✅ Update all documentation to use `cu.wasm`
- ✅ Migration guide published

### v2.1.0 (Next Release)
- Continue providing both files
- Stronger deprecation warnings
- Update warning message with v3.0 timeline
- Reminder in release notes

### v2.2.0
- Final compatibility release
- Deprecation warning mentions "last version with lua.wasm"
- Encourage migration before v3.0

### v3.0.0 (Breaking Change)
- ❌ Remove `lua.wasm` completely
- ✅ Only `cu.wasm` available
- Update build script to not create lua.wasm
- BREAKING CHANGE documented in release notes

---

## File Manifest

### Modified Files (20+)

**Build System:**
- `build.sh` - Update output artifact name

**JavaScript:**
- `web/lua-api.js` - Update default path, add deprecation warning
- `web/lua-persistent.js` - Update default path
- `web/lua-compute.js` - Update default path
- `web/io-wrapper.js` - Update examples in comments

**Documentation:**
- `README.md` - Update examples and add migration note
- `docs/API_REFERENCE.md` - Update API docs
- `docs/QUICK_START.md` - Update quick start examples
- `docs/ARCHITECTURE.md` - Update architecture diagrams
- `docs/BUILD_AND_DEPLOYMENT_GUIDE.md` - Update build instructions
- `docs/IO_TABLE_API.md` - Update examples
- `docs/WASM_API_REFERENCE.md` - Update WASM loading examples
- All other `docs/*.md` files

**Examples:**
- `examples/*.html` - Update WASM references
- `examples/*.js` - Update import paths
- `demo/*.html` - Update demo files

**Tests:**
- `tests/*.test.js` - Update test configurations
- `playwright.config.js` - Update config if needed

**Changelog:**
- `CHANGELOG.md` - Document the change

### New Files (1)

- `docs/MIGRATION_LUA_WASM_TO_CU_WASM.md` - Migration guide

### Build Artifacts (2)

- `web/cu.wasm` - Primary WASM artifact (renamed from lua.wasm)
- `web/lua.wasm` - Backwards compatibility copy (deprecated)

---

## Post-Implementation

### Communication Plan

1. **Release Notes**: Clearly communicate the change
2. **GitHub Release**: Highlight migration guide
3. **README Badge**: Update version badge to v2.1
4. **NPM Package**: Update package description
5. **Community**: Announce in relevant channels

### Monitoring

1. **Usage Analytics**: Track which artifact is being loaded
2. **Error Reports**: Monitor for broken deployments
3. **Support Tickets**: Track migration questions
4. **Deprecation Warnings**: Ensure they're being seen

### Future Cleanup (v3.0)

When removing `lua.wasm` in v3.0:
1. Update build script to only output `cu.wasm`
2. Remove deprecation warning code
3. Remove `lua.wasm` references from .gitignore
4. Update migration guide to mark completion
5. Archive backwards compatibility code

---

## Conclusion

Renaming the WASM artifact from `lua.wasm` to `cu.wasm` aligns the project's technical artifacts with its new identity as a Compute Unit. 

**Solution 2** (Rename with Backwards Compatibility) provides:
- ✅ Graceful migration path for existing users
- ✅ Professional deprecation handling
- ✅ Clear timeline and communication
- ✅ Minimal disruption to ecosystem
- ✅ Future-proof naming

The implementation is straightforward, taking approximately 6-7 hours, and provides a clear path from v2.0 (both files) to v3.0 (cu.wasm only).

This approach respects existing users while moving the project forward with consistent, meaningful naming that reflects the compute unit abstraction rather than implementation details.

---

## References

- Project rename PRP: `PRPs/cu-rename-prp.md`
- Deprecation best practices: [semver.org](https://semver.org/)
- WASM module naming conventions: WebAssembly community standards
