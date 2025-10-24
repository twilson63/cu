/**
 * Lua Persistent Demo - TypeScript Definitions
 */

export interface MemoryStats {
  io_buffer_size: number;
  lua_memory_used: number;
  wasm_pages: number;
}

export interface DeserializedResult {
  output: string;
  result: any;
}

export interface TableInfo {
  id: number;
  size: number;
  keys: string[];
}

export interface TablesInfo {
  tableCount: number;
  tables: TableInfo[];
}

export interface LuaAPI {
  /**
   * Load and initialize the Lua WebAssembly module
   */
  loadLuaWasm(): Promise<boolean>;

  /**
   * Initialize the Lua VM
   * @returns 0 on success, -1 on failure
   */
  init(): number;

  /**
   * Execute Lua code
   * @param code Lua code to execute
   * @returns Number of bytes in result buffer (negative on error)
   */
  compute(code: string): number;

  /**
   * Get the pointer to the I/O buffer
   */
  getBufferPtr(): number;

  /**
   * Get the size of the I/O buffer
   */
  getBufferSize(): number;

  /**
   * Get memory statistics
   */
  getMemoryStats(): MemoryStats;

  /**
   * Run garbage collection
   */
  runGc(): void;

  /**
   * Read raw buffer contents as string
   * @param ptr Buffer pointer
   * @param len Number of bytes to read
   */
  readBuffer(ptr: number, len: number): string;

  /**
   * Read and deserialize Lua result from buffer
   * @param ptr Buffer pointer
   * @param len Number of bytes to read
   */
  readResult(ptr: number, len: number): DeserializedResult;

  /**
   * Write string data to buffer
   * @param ptr Buffer pointer
   * @param data Data to write
   */
  writeBuffer(ptr: number, data: string): number;

  /**
   * Save all external tables to IndexedDB
   */
  saveState(): Promise<boolean>;

  /**
   * Load external tables from IndexedDB
   */
  loadState(): Promise<boolean>;

  /**
   * Clear all persisted data
   */
  clearPersistedState(): Promise<boolean>;

  /**
   * Get information about current external tables
   */
  getTableInfo(): TablesInfo;
}

declare const lua: LuaAPI;
export default lua;