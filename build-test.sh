#!/bin/bash
################################################################################
# BUILD-TEST.SH
# Quick validation build script for build-freestanding.sh
#
# Performs a rapid build with early failure detection and detailed reporting.
# Useful for CI/CD and development validation.
#
# Usage:
#   ./build-test.sh              # Quick validation build
#   ./build-test.sh --full       # Full build with detailed output
#
# Exit codes:
#   0 - Build successful
#   1 - Build failed
#   2 - Environment check failed
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_MODE="quick"
EXIT_CODE=0

if [[ "$1" == "--full" ]]; then
    TEST_MODE="full"
fi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         BUILD TEST - Validation Build for WASM                 ║"
echo "║                                                                ║"
echo "║  Mode: ${TEST_MODE}                                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "STEP 1: Environment Check"
if ! command -v zig &> /dev/null; then
    echo "❌ FAIL: Zig not installed"
    exit 2
fi
echo "✅ Zig found: $(which zig)"
echo "   Version: $(zig version)"
echo ""

echo "STEP 2: Source File Check"
lua_count=$(find "$SCRIPT_DIR/src/lua" -name "*.c" -type f | wc -l)
zig_count=$(find "$SCRIPT_DIR/src" -maxdepth 1 -name "*.zig" -type f | wc -l)
if [[ $lua_count -ne 33 ]]; then
    echo "❌ FAIL: Expected 33 Lua C files, found $lua_count"
    exit 2
fi
echo "✅ Found $lua_count Lua C sources"
echo "✅ Found $zig_count Zig sources"
echo ""

echo "STEP 3: Build Execution"
if [[ "$TEST_MODE" == "full" ]]; then
    echo "   Running: ./build-freestanding.sh --verbose --clean"
    cd "$SCRIPT_DIR"
    if ./build-freestanding.sh --verbose --clean; then
        echo "✅ Build completed"
    else
        echo "❌ Build failed"
        EXIT_CODE=1
    fi
else
    echo "   Running: ./build-freestanding.sh"
    cd "$SCRIPT_DIR"
    if ./build-freestanding.sh > /tmp/build-test.log 2>&1; then
        echo "✅ Build completed"
    else
        echo "❌ Build failed"
        echo ""
        echo "Last 20 lines of build.log:"
        tail -20 build.log || tail -20 /tmp/build-test.log
        EXIT_CODE=1
    fi
fi
echo ""

echo "STEP 4: Output Verification"
if [[ ! -f "$SCRIPT_DIR/web/lua.wasm" ]]; then
    echo "❌ FAIL: web/lua.wasm not created"
    EXIT_CODE=1
else
    file_size=$(wc -c < "$SCRIPT_DIR/web/lua.wasm")
    file_size_kb=$((file_size / 1024))
    echo "✅ WASM binary created: web/lua.wasm"
    echo "   Size: $file_size bytes ($file_size_kb KB)"
    
    magic_bytes=$(xxd -p -l 4 "$SCRIPT_DIR/web/lua.wasm")
    if [[ "$magic_bytes" == "0061736d" ]]; then
        echo "✅ Valid WASM magic bytes: 0x$magic_bytes"
    else
        echo "❌ FAIL: Invalid WASM magic bytes: 0x$magic_bytes"
        EXIT_CODE=1
    fi
fi
echo ""

echo "STEP 5: Log Check"
if [[ -f "$SCRIPT_DIR/build.log" ]]; then
    echo "✅ Build log created: build.log"
    log_size=$(wc -l < "$SCRIPT_DIR/build.log")
    echo "   Lines: $log_size"
    
    if grep -q "error\|Error\|ERROR" "$SCRIPT_DIR/build.log"; then
        echo "⚠️  Found error keywords in log (may be informational)"
    else
        echo "✅ No obvious errors in log"
    fi
else
    echo "❌ FAIL: build.log not created"
    EXIT_CODE=1
fi
echo ""

if [[ $EXIT_CODE -eq 0 ]]; then
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                  ✅ ALL TESTS PASSED                           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Build validation successful!"
    echo "Next steps:"
    echo "  1. Review build.log for any warnings"
    echo "  2. Test the WASM module: node check_exports.js"
    echo "  3. Run web server: cd web && python3 -m http.server 8000"
else
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                  ❌ TESTS FAILED                               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Build validation failed! Check errors above."
fi
echo ""

exit $EXIT_CODE
