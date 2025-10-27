/**
 * Cu - Node.js Entry Point
 */

const path = require('path');
const fs = require('fs');

// Re-export the main API
module.exports = require('../demo/cu-api.js');

// Helper to get WASM path
module.exports.getWasmPath = function() {
  return path.join(__dirname, 'cu.wasm');
};

// Helper to load WASM in Node.js
module.exports.loadWasmBuffer = async function() {
  const wasmPath = module.exports.getWasmPath();
  return fs.promises.readFile(wasmPath);
};