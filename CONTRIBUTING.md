# Contributing to Lua Persistent Demo

First off, thank you for considering contributing to Lua Persistent Demo! It's people like you that make this project such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please be respectful and constructive in all interactions.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and expected**
- **Include screenshots if possible**
- **Include browser and OS information**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and expected behavior**
- **Explain why this enhancement would be useful**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code, add tests that cover your changes
3. Ensure the test suite passes
4. Make sure your code follows the existing code style
5. Write a clear commit message
6. Issue the pull request

## Development Setup

### Prerequisites

- Zig 0.15.1 or later
- Node.js 16+ (for running the demo)
- Python 3 (for local web server)
- Git

### Setting Up Your Development Environment

```bash
# Clone your fork
git clone https://github.com/your-username/cu.git
cd cu

# Install dependencies (if any)
npm install

# Build the project
./build.sh

# Run the demo locally
cd demo
python3 -m http.server 8000
```

### Project Structure

```
├── src/          # Zig source code
├── demo/         # Web demo files
├── dist/         # Pre-built binaries
├── docs/         # Documentation
├── examples/     # Example code
└── scripts/      # Build and utility scripts
```

## Coding Standards

### Zig Code Style

- Use snake_case for functions and variables
- Use PascalCase for types and structs
- Keep lines under 100 characters
- Add comments for complex logic
- Use meaningful variable names

Example:
```zig
pub fn create_external_table(allocator: std.mem.Allocator) !*ExternalTable {
    // Allocate memory for the table
    const table = try allocator.create(ExternalTable);
    table.* = ExternalTable{
        .id = next_table_id,
        .data = StringHashMap([]const u8).init(allocator),
    };
    next_table_id += 1;
    return table;
}
```

### JavaScript Code Style

- Use ES6+ features
- Use const/let instead of var
- Add JSDoc comments for functions
- Follow the existing code style

Example:
```javascript
/**
 * Load Cu WASM module
 * @returns {Promise<boolean>} Success status
 */
export async function loadLuaWasm() {
    const response = await fetch('./lua.wasm');
    // ... implementation
}
```

## Testing

- Add tests for new functionality
- Ensure all existing tests pass
- Test in multiple browsers
- Test error cases

## Documentation

- Update the README if needed
- Add JSDoc comments to new functions
- Update API documentation for new features
- Include examples for new functionality

## Commit Guidelines

We use conventional commits. Format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes
- **refactor**: Code refactoring
- **test**: Test additions/changes
- **chore**: Maintenance tasks

Example:
```
feat(ext-table): add support for nested tables

Implemented recursive serialization for nested table structures.
This allows users to store complex data hierarchies.

Closes #123
```

## Release Process

1. Update version in relevant files
2. Update CHANGELOG.md
3. Create a pull request
4. After merge, tag the release
5. GitHub Actions will build and publish

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing! 🎉