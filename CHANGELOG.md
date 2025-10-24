# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-23

### Added
- Initial release of Lua Persistent Demo
- Lua 5.4.7 interpreter compiled to WebAssembly using Zig
- External table support with JavaScript bridge
- IndexedDB persistence for external tables
- Interactive web demo with code editor
- Custom memory allocator implementation
- Comprehensive documentation
- Example applications demonstrating persistence
- Build system using Zig without Emscripten

### Technical Details
- WASM binary size: 1.67 MB
- Target: wasm32-freestanding
- Memory: 512 KB static allocation + 64 KB I/O buffer
- External table functions: set, get, delete, size, keys
- Serialization format: Type-tagged binary protocol

### Known Limitations
- External table references must be recreated after page reload
- Maximum I/O buffer size: 64 KB
- Tables can only store string keys and values