# 🌙 Lua WASM Persistent Demo

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build Status](https://img.shields.io/github/actions/workflow/status/yourusername/lua-persistent-demo/build.yml?branch=main)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![WebAssembly](https://img.shields.io/badge/WebAssembly-654FF0?logo=webassembly&logoColor=white)
![Lua](https://img.shields.io/badge/Lua-5.4.7-2C2D72?logo=lua&logoColor=white)

```
 _                  __        ___   ____  __  __ 
| |   _   _  __ _  \ \      / / \ / ___||  \/  |
| |  | | | |/ _` |  \ \ /\ / / _ \___ \| |\/| |
| |__| |_| | (_| |   \ V  V / ___ \___) | |  | |
|_____\__,_|\__,_|    \_/\_/_/   \_\____/|_|  |_|
                                                 
```

> Run Lua in the browser with persistent state across page reloads using WebAssembly

## ✨ Overview

Lua WASM Persistent Demo brings the full power of Lua 5.4.7 to your browser through WebAssembly, with a unique twist - your scripts and data persist across browser sessions! Perfect for educational tools, browser-based IDEs, and interactive demos.

### 🚀 Key Features

- **Full Lua 5.4.7** - Complete Lua language support in the browser
- **Persistent State** - Scripts and data survive page reloads
- **Zero Dependencies** - Pure WebAssembly, no external libraries required
- **Tiny Size** - Just 1.6MB WASM binary (gzips to ~400KB)
- **Fast Performance** - Near-native execution speed
- **Sandboxed Execution** - Safe, isolated runtime environment
- **Custom Memory Management** - Efficient allocator with 512KB heap

## 🎮 Live Demo

Try it now: [https://yourusername.github.io/lua-persistent-demo](https://yourusername.github.io/lua-persistent-demo)

## 🏃 Quick Start

### CDN Usage (Easiest)

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://unpkg.com/lua-wasm-persistent@1.0.0/dist/lua-wasm.js"></script>
</head>
<body>
    <script>
        // Initialize Lua WASM
        LuaWASM.init().then(lua => {
            // Run some Lua code
            const result = lua.eval(`
                function fibonacci(n)
                    if n <= 1 then return n end
                    return fibonacci(n - 1) + fibonacci(n - 2)
                end
                return fibonacci(10)
            `);
            console.log('Fibonacci(10):', result); // Output: 55
            
            // Store persistent data
            lua.eval(`
                persistent_table = persistent_table or {}
                persistent_table.counter = (persistent_table.counter or 0) + 1
                return persistent_table.counter
            `);
        });
    </script>
</body>
</html>
```

## 📦 Installation

### npm

```bash
npm install lua-wasm-persistent
```

```javascript
import { LuaWASM } from 'lua-wasm-persistent';

const lua = await LuaWASM.init();
const result = lua.eval('return "Hello from Lua!"');
console.log(result); // "Hello from Lua!"
```

### Manual Download

1. Download the latest release from [GitHub Releases](https://github.com/yourusername/lua-persistent-demo/releases)
2. Include the files in your project:
   - `lua-wasm.js` - JavaScript wrapper
   - `lua.wasm` - WebAssembly binary

## 💻 Usage Examples

### Basic Evaluation

```javascript
const lua = await LuaWASM.init();

// Simple expression
const sum = lua.eval('return 2 + 2');
console.log(sum); // 4

// Multiple statements
lua.eval(`
    local x = 10
    local y = 20
    print("Sum is: " .. (x + y))
`);
```

### Working with Tables

```javascript
// Create and manipulate Lua tables
lua.eval(`
    player = {
        name = "Alice",
        score = 100,
        items = {"sword", "shield", "potion"}
    }
`);

// Access table data
const playerName = lua.eval('return player.name');
const itemCount = lua.eval('return #player.items');
```

### Persistent Storage

```javascript
// Data persists across page reloads
lua.eval(`
    -- Initialize persistent storage
    storage = storage or {}
    
    -- Increment visit counter
    storage.visits = (storage.visits or 0) + 1
    
    -- Store user preferences
    storage.preferences = {
        theme = "dark",
        language = "en"
    }
`);

// Retrieve persistent data
const visits = lua.eval('return storage.visits');
console.log(`You've visited ${visits} times`);
```

### Error Handling

```javascript
try {
    const result = lua.eval('return undefined_variable');
} catch (error) {
    console.error('Lua error:', error.message);
    // "Lua error: [string "return undefined_variable"]:1: attempt to index a nil value"
}
```

## 📚 API Reference

### `LuaWASM.init(options?)`
Initialize the Lua WASM environment.

**Parameters:**
- `options` (optional): Configuration object
  - `memorySize`: Initial memory size (default: 16MB)
  - `persistentStorage`: Enable persistent storage (default: true)

**Returns:** Promise<LuaInstance>

### `lua.eval(code)`
Execute Lua code and return the result.

**Parameters:**
- `code`: String containing Lua code

**Returns:** The last returned value from Lua (string, number, boolean, null, or object)

### `lua.getMemoryStats()`
Get current memory usage statistics.

**Returns:** Object with memory information

For complete API documentation, see [API.md](./docs/API.md).

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────┐
│         Web Application             │
├─────────────────────────────────────┤
│      JavaScript API Layer           │
│         (lua-wasm.js)               │
├─────────────────────────────────────┤
│    WebAssembly Module (lua.wasm)    │
│  ┌─────────────────────────────┐    │
│  │     Lua 5.4.7 VM Core       │    │
│  ├─────────────────────────────┤    │
│  │   Custom Memory Allocator   │    │
│  ├─────────────────────────────┤    │
│  │    POSIX Compatibility      │    │
│  │      Layer (libc stubs)     │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Key Components

- **Lua VM**: Complete Lua 5.4.7 implementation compiled to WebAssembly
- **Memory Management**: Custom allocator with 512KB heap + 64KB I/O buffer
- **JavaScript Bridge**: Bi-directional communication between JS and WASM
- **Persistence Layer**: LocalStorage integration for state persistence

## 🌐 Browser Support

| Browser | Version | Status |
|---------|---------|---------|
| Chrome | 57+ | ✅ Fully Supported |
| Firefox | 52+ | ✅ Fully Supported |
| Safari | 11+ | ✅ Fully Supported |
| Edge | 79+ | ✅ Fully Supported |
| Mobile Chrome | 57+ | ✅ Fully Supported |
| Mobile Safari | 11+ | ✅ Fully Supported |

## 🔨 Building from Source

### Prerequisites

- [Zig](https://ziglang.org/) 0.15.1 or later
- Python 3.x (for local web server)
- Git

### Build Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/lua-persistent-demo.git
cd lua-persistent-demo

# Build the WASM module
./build.sh

# Start local server
cd web
python3 -m http.server 8000

# Open http://localhost:8000 in your browser
```

### Build Options

```bash
# Development build (with debug symbols)
./build.sh --debug

# Production build (optimized)
./build.sh --release

# Clean build
rm -rf .zig-cache .build web/lua.wasm && ./build.sh
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Running Tests

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run all tests with coverage
npm run test:coverage
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Lua](https://www.lua.org/) - The powerful, efficient, lightweight, embeddable scripting language
- [Zig](https://ziglang.org/) - For making WebAssembly compilation straightforward
- [WebAssembly Community Group](https://www.w3.org/community/webassembly/) - For the WebAssembly standard
- All contributors who have helped shape this project

## 📊 Project Status

- ✅ **Phase 1-3**: Build system & implementation complete
- ✅ **Phase 4-5**: Documentation complete
- ✅ **Phase 6**: Export functions fixed
- ✅ **Phase 6.1**: Memory management resolved
- 🚧 **Phase 7**: Optimization (in progress)
- 📋 **Phase 8**: Additional features (planned)

---

<p align="center">
  Made with ❤️ by the Lua WASM community
</p>