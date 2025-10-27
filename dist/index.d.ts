/**
 * Cu - TypeScript Definitions
 */

export interface MemoryStats {
  io_buffer_size: number;
  cu_memory_used: number;
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
  homeTableId: number | null;
  nextTableId: number;
  tables: TableInfo[];
}

export interface CuAPI {
  /**
   * Load and initialize the Cu WebAssembly module
   */
  load(options?: { autoRestore?: boolean; wasmPath?: string }): Promise<boolean>;

  /**
   * Initialize the Cu VM
   * @returns 0 on success, -1 on failure
   */
  init(): number;

  /**
   * Execute Lua code in the Cu environment
   * @param code Lua code to execute
   * @returns Number of bytes in result buffer (negative on error)
   */
  compute(code: string): Promise<number>;

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
  runGc(): boolean;

  /**
   * Read raw buffer contents as string
   * @param ptr Buffer pointer
   * @param len Number of bytes to read
   */
  readBuffer(ptr: number, len: number): string;

  /**
   * Read and deserialize result from buffer
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

  /**
   * Get the _home table ID
   */
  getMemoryTableId(): number | null;

  /**
   * Set input data for _io.input
   */
  setInput(data: any): void;

  /**
   * Get output data from _io.output
   */
  getOutput(): any;

  /**
   * Set metadata for _io.meta
   */
  setMetadata(meta: any): void;

  /**
   * Clear all _io table contents
   */
  clearIo(): void;

  /**
   * Get the _io table ID
   */
  getIoTableId(): number;
}

declare const cu: CuAPI;
export default cu;