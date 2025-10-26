# Project Request Protocol: WASM Low-Level API Documentation

## Project Overview

### Title
Comprehensive Low-Level API Guide for Lua WASM Module

### Background
The lua.wasm module currently lacks comprehensive documentation for developers who want to use it directly from various WASM runtimes (WAMR, Rust, Go, C++, etc.) without the JavaScript wrapper layer. While the high-level JavaScript API is well-documented, the underlying WASM interface exports and imports are not clearly specified, making it difficult for developers to integrate the module into non-JavaScript environments.

### Objective
Create a comprehensive, concise, and developer-friendly API guide that documents the low-level WASM interface of the lua.wasm module. This guide should enable developers using any WASM runtime to successfully integrate and use the Lua interpreter with external table persistence.

### Scope
- Document all WASM exports (functions, memory, globals)
- Document all required WASM imports (host functions)
- Provide memory layout and buffer protocol specifications
- Include code examples for multiple languages (Rust, C, Go)
- Document error handling and return value conventions
- Provide integration patterns and best practices

## Technical Requirements

### Functional Requirements

**FR1: Export Documentation**
- Document all 11 exported functions with signatures, parameters, and return values
- Specify calling conventions and ABI compatibility
- Include memory safety constraints

**FR2: Import Documentation**
- Document all 5 required external table imports
- Specify expected host implementation behavior
- Define error codes and edge cases

**FR3: Memory Protocol**
- Document shared I/O buffer mechanism (64KB)
- Specify memory layout and alignment requirements
- Define buffer protocol for code execution and results

**FR4: Type System**
- Document all WASM primitive types used
- Map to common language types (i32, i64, f32, f64, pointers)
- Specify struct layouts (e.g., MemoryStats)

**FR5: Integration Examples**
- Provide working examples in Rust, C, and Go
- Show complete initialization sequences
- Demonstrate error handling patterns

### Non-Functional Requirements

**NFR1: Clarity**
- API reference should be scannable and easy to navigate
- Each function should have a clear, concise description
- Examples should be copy-paste ready

**NFR2: Completeness**
- Cover all exported functions (no gaps)
- Document all failure modes
- Include performance considerations

**NFR3: Accessibility**
- Support developers of varying experience levels
- Provide both quick reference and detailed sections
- Include diagrams for complex concepts

**NFR4: Maintainability**
- Use consistent formatting throughout
- Include version information
- Specify backward compatibility guarantees

### Constraints
- Documentation must reflect current v2.0.0 implementation
- Must not require changes to existing WASM module
- Should be a single comprehensive markdown file
- Must remain accurate as codebase evolves

## Proposed Solutions

### Solution A: Comprehensive Reference Guide

Create a single, extensive markdown document (docs/WASM_API_REFERENCE.md) with the following structure:

```markdown
# WASM Low-Level API Reference

## Overview
## Quick Start
## Exports
  - Functions (detailed)
  - Memory
  - Types
## Imports (Required Host Functions)
## Memory Protocol
## Integration Examples
  - Rust
  - C
  - Go
  - WebAssembly.js
## Error Handling
## Performance Considerations
## Appendix
```

**Implementation Details:**
- One comprehensive document (~2000-3000 lines)
- Detailed function signatures with parameter descriptions
- Code examples inline with explanations
- Cross-references between sections
- Generated table of contents

### Solution B: Multi-File API Documentation Suite

Create a documentation suite with separate files for different concerns:

```
docs/wasm-api/
  ├── index.md (overview)
  ├── exports.md (function reference)
  ├── imports.md (host requirements)
  ├── memory.md (buffer protocol)
  ├── types.md (type definitions)
  ├── examples-rust.md
  ├── examples-c.md
  ├── examples-go.md
  └── integration-guide.md
```

**Implementation Details:**
- Multiple focused documents (8-10 files)
- Each file ~300-500 lines
- Inter-document links for navigation
- Easier to maintain specific sections
- Better for version control diffs

### Solution C: Interactive API Explorer

Create an interactive documentation system with:
- Static site generator (mdBook, Docusaurus)
- Live WASM examples in browser
- Interactive API playground
- Search functionality
- Versioned documentation

**Implementation Details:**
- Uses mdBook or similar tool
- Multi-page with navigation sidebar
- Code examples with syntax highlighting
- Live REPL for testing
- Hosted on GitHub Pages

## Pros and Cons

### Solution A: Comprehensive Reference Guide

**Pros:**
- Single source of truth - everything in one place
- Easy to search with Ctrl+F
- Simple to maintain (one file)
- No build tools required
- Printable/downloadable as single document
- Consistent formatting throughout

**Cons:**
- Long document may be overwhelming
- Harder to navigate without good TOC
- Git diffs less granular
- Can't optimize per-language examples separately
- May become unwieldy as API grows

### Solution B: Multi-File API Documentation Suite

**Pros:**
- Focused, digestible chunks
- Better separation of concerns
- Easier to update specific sections
- More granular git diffs
- Can optimize each file independently
- Scales better with API growth

**Cons:**
- Requires navigation between files
- Risk of documentation drift between files
- More complex maintenance (consistency)
- No single-file reference
- Harder to print/download complete docs

### Solution C: Interactive API Explorer

**Pros:**
- Best user experience (searchable, interactive)
- Live code examples
- Professional presentation
- Versioned documentation support
- Built-in navigation and search
- Mobile-friendly

**Cons:**
- Requires build tools and setup
- More complex maintenance
- Overhead for simple updates
- Requires hosting (GitHub Pages)
- Steeper learning curve for contributors
- Overkill for current project size

## Best Solution Selection

**Recommendation: Solution A – Comprehensive Reference Guide**

### Rationale

1. **Immediate Value**: Provides complete API documentation immediately without tooling overhead
2. **Simplicity**: Single markdown file is easy to maintain and keep updated
3. **Accessibility**: Works with any markdown viewer, GitHub preview, or text editor
4. **Searchability**: Single file makes Ctrl+F search effective across entire API
5. **Project Size**: Current API surface (11 exports, 5 imports) fits well in single document
6. **Integration**: Aligns with existing docs/ structure (single-file reference guides)

### Why Not Others?

- **Solution B**: While better for large APIs, our current 16 functions don't justify the complexity
- **Solution C**: Excellent but overkill; adds significant maintenance burden for marginal benefit at this scale

### Migration Path

If the API grows significantly (>30 exports), we can:
1. Keep the comprehensive guide as a quick reference
2. Extract detailed examples into separate files
3. Eventually migrate to Solution B or C if needed

## Implementation Steps

### Phase 1: API Inventory and Specification (2 hours)

1. **Document Exports**
   - Extract all 11 export signatures from src/main.zig
   - Document parameter types, return values, error codes
   - Add memory safety notes and constraints
   - Include example call sequences

2. **Document Imports**
   - Specify all 5 required host functions
   - Define expected behavior and error handling
   - Provide reference implementations
   - Note callback conventions

3. **Document Memory Layout**
   - Describe I/O buffer protocol (64KB)
   - Explain memory regions and alignment
   - Define buffer communication protocol
   - Specify lifetime and ownership rules

### Phase 2: Integration Examples (3 hours)

4. **Rust Example**
   - Complete working example using wasmtime
   - Show host function implementation
   - Demonstrate error handling
   - Include Cargo.toml with dependencies

5. **C Example**
   - Complete working example using WAMR
   - Show native host function implementations
   - Demonstrate lifecycle management
   - Include Makefile

6. **Go Example**
   - Complete working example using wazero
   - Show Go host function bridges
   - Demonstrate concurrent usage
   - Include go.mod

7. **WebAssembly.js Example**
   - Node.js example without framework
   - Direct WebAssembly API usage
   - Compare with high-level lua-api.js
   - Show minimal integration

### Phase 3: Advanced Topics (2 hours)

8. **Error Handling Guide**
   - Document all error codes and meanings
   - Show error recovery patterns
   - Explain buffer error protocol
   - Provide debugging tips

9. **Performance Considerations**
   - Buffer reuse strategies
   - Memory allocation patterns
   - GC interaction notes
   - Benchmarking guidance

10. **Best Practices**
    - Initialization sequences
    - State management patterns
    - Thread safety notes
    - Resource cleanup

### Phase 4: Review and Polish (1 hour)

11. **Generate Table of Contents**
    - Add comprehensive TOC with links
    - Include quick reference section
    - Add navigation anchors

12. **Add Diagrams**
    - Memory layout diagram
    - Call sequence diagrams
    - Buffer protocol flowchart

13. **Peer Review**
    - Technical accuracy review
    - Code example validation
    - Clarity and completeness check

14. **Integration**
    - Link from README.md
    - Update API_REFERENCE.md to mention low-level API
    - Add to DELIVERABLES_INDEX.md

## Success Criteria

### Functional Success Criteria

**SC1: Completeness**
- ✅ All 11 exports documented with complete signatures
- ✅ All 5 imports specified with expected behavior
- ✅ Memory protocol fully explained with diagrams
- ✅ Working code examples in 3+ languages

**SC2: Usability**
- ✅ Developer can integrate lua.wasm in Rust without reading source code
- ✅ C developers can implement host functions from docs alone
- ✅ Examples compile and run successfully
- ✅ Common questions answered in FAQ section

**SC3: Accuracy**
- ✅ All type signatures match actual WASM exports
- ✅ Memory addresses and sizes are correct
- ✅ Error codes match implementation
- ✅ Examples tested and verified

### Quality Success Criteria

**SC4: Clarity**
- Document is scannable with clear headings
- Each function has <5 lines description
- Examples are annotated with comments
- Common pitfalls highlighted

**SC5: Accessibility**
- Quick reference section for experienced developers
- Tutorial-style examples for newcomers
- Links to related high-level API docs
- Glossary of terms

**SC6: Maintainability**
- Version clearly stated at top
- Last updated date included
- Change log section
- Contact/contribution info

### Validation Methods

1. **Code Validation**: All examples must compile and execute
2. **Peer Review**: At least 2 developers review for clarity
3. **User Testing**: Share with external developer for feedback
4. **Accuracy Check**: Cross-reference with source code
5. **Integration Test**: Verify examples work with actual lua.wasm

## Document Structure

### Proposed Outline

```markdown
# Lua WASM Low-Level API Reference

Version: 2.0.0 | Last Updated: October 2025

## Table of Contents
[Auto-generated TOC with 3 levels]

## Overview
- What is lua.wasm?
- Target Audience
- Prerequisites
- Quick Start (30 seconds)

## Architecture
- Module Design
- Memory Model
- External Table System
- Function Persistence

## Exports Reference

### Core Functions
- init() - Initialize Lua VM
- compute() - Execute Lua code
- get_buffer_ptr() - Get I/O buffer pointer
- get_buffer_size() - Get buffer size

### Memory Management
- get_memory_stats() - Query memory usage
- run_gc() - Trigger garbage collection

### External Tables
- attach_memory_table() - Restore table state
- get_memory_table_id() - Get home table ID
- sync_external_table_counter() - Synchronize IDs

### Configuration
- set_memory_alias_enabled() - Toggle legacy support

### Internal (Advanced)
- lua_alloc() - Custom allocator

## Imports Reference (Host Functions Required)

### External Table Operations
- js_ext_table_set() - Store key-value pair
- js_ext_table_get() - Retrieve value
- js_ext_table_delete() - Remove entry
- js_ext_table_size() - Get table size
- js_ext_table_keys() - List all keys

## Memory Protocol

### I/O Buffer
- Location and Size
- Usage Pattern
- Data Encoding
- Error Protocol

### Shared Memory
- Layout Diagram
- Alignment Requirements
- Thread Safety

## Type Definitions

### Primitive Types
- i32, u32, usize mappings
- Pointer conventions
- Error codes

### Structures
- MemoryStats struct

## Integration Examples

### Rust + wasmtime
[Complete working example]

### C + WAMR
[Complete working example]

### Go + wazero
[Complete working example]

### Node.js (Bare WebAssembly API)
[Complete working example]

## Error Handling
- Return Value Conventions
- Error Code Reference
- Recovery Strategies
- Common Issues

## Best Practices
- Initialization Sequence
- Buffer Management
- State Persistence
- Resource Cleanup

## Performance Guide
- Buffer Reuse
- Memory Patterns
- Benchmarking

## Migration Notes
- From v1.x to v2.0
- Memory → _home Change
- Backward Compatibility

## FAQ
[Common questions]

## Appendix

### A: Complete Function Index
[Alphabetical listing]

### B: Error Code Reference
[All error codes]

### C: Memory Map
[Detailed layout]

### D: Version History
[API changes by version]

## Contributing
- How to improve this doc
- Reporting inaccuracies
- Adding examples

## License
MIT
```

## Timeline

**Total Estimated Time: 8 hours**

- Phase 1 (API Specification): 2 hours
- Phase 2 (Examples): 3 hours
- Phase 3 (Advanced Topics): 2 hours
- Phase 4 (Polish): 1 hour

**Target Completion**: Can be completed in one dedicated work session or split across 2 days.

## Deliverables

1. **docs/WASM_API_REFERENCE.md** (primary deliverable)
   - ~2000-3000 lines
   - Comprehensive API reference
   - Working code examples

2. **examples/wasm-integration/** (optional support)
   - rust-example/ (Cargo project)
   - c-example/ (WAMR project)
   - go-example/ (Go module)
   - nodejs-example/ (minimal JS)

3. **Updated Documentation Links**
   - README.md mentions low-level API
   - docs/API_REFERENCE.md links to WASM docs
   - DELIVERABLES_INDEX.md updated

## Risk Mitigation

**Risk: Examples Don't Compile**
- Mitigation: Test each example before documenting
- Validate with CI/CD if available

**Risk: Documentation Becomes Stale**
- Mitigation: Add version numbers throughout
- Include last-updated dates
- Link to source code for verification

**Risk: Too Technical for Beginners**
- Mitigation: Include "Quick Start" section
- Add tutorial-style walkthrough
- Link to high-level API for alternatives

**Risk: Incomplete Coverage**
- Mitigation: Use checklist from exports/imports lists
- Cross-reference with source code
- Peer review for gaps

## Future Enhancements

Once Solution A is complete, consider:

1. **Interactive Playground**: Online WASM testing environment
2. **Video Tutorials**: Screen recordings of integration
3. **Language Bindings**: Helper libraries for popular languages
4. **Auto-Generated Docs**: Extract from source annotations
5. **Performance Benchmarks**: Published benchmark suite

## References

- Current exports: src/main.zig lines 35-195
- Current imports: src/main.zig lines 23-27
- High-level API: docs/API_REFERENCE.md
- Architecture: docs/ENHANCED_ARCHITECTURE.md
- Memory protocol: Inferred from compute() implementation

---

**Approval Required**: Yes (for time allocation and priority)  
**Dependencies**: None (pure documentation)  
**Blocking**: No other work blocked by this  
**Priority**: Medium (enhances adoption but not critical)
