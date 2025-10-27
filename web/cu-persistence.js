/**
 * Persistence layer for Lua external tables using IndexedDB
 */

const DB_NAME = 'LuaPersistentDB';
const DB_VERSION = 1;
const STORE_NAME = 'externalTables';

class LuaPersistence {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Save all external tables to IndexedDB
   * @param {Map} externalTables - Map of table ID to Map of key-value pairs
   * @param {Object} metadata - Additional metadata (like variable mappings)
   */
  async saveTables(externalTables, metadata = {}) {
    if (!this.db) await this.init();

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const clearRequest = store.clear();
      clearRequest.onsuccess = resolve;
      clearRequest.onerror = reject;
    });

    const promises = [];
    for (const [tableId, tableData] of externalTables) {
      // Convert Map entries to object, preserving Uint8Array values
      const dataObj = {};
      for (const [key, value] of tableData) {
        if (value instanceof Uint8Array) {
          // Store binary data with a type marker
          dataObj[key] = {
            _type: 'binary',
            data: Array.from(value) // Convert to array for JSON serialization
          };
        } else {
          dataObj[key] = value;
        }
      }
      
      const serializedData = {
        id: tableId,
        data: dataObj
      };

      promises.push(new Promise((resolve, reject) => {
        const request = store.put(serializedData);
        request.onsuccess = resolve;
        request.onerror = reject;
      }));
    }

    const metadataRecord = {
      id: '__metadata__',
      data: {
        ...metadata,
        tableCount: externalTables.size,
        tableIds: Array.from(externalTables.keys())
      }
    };

    promises.push(new Promise((resolve, reject) => {
      const request = store.put(metadataRecord);
      request.onsuccess = resolve;
      request.onerror = reject;
    }));

    await Promise.all(promises);
    console.log(`Saved ${externalTables.size} tables to IndexedDB`);
  }

  /**
   * Load all external tables from IndexedDB
   * @returns {{tables: Map, metadata: Object}} Persisted tables and metadata
   */
  async loadTables() {
    if (!this.db) await this.init();

    const transaction = this.db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = (event) => {
        const results = event.target.result || [];
        const externalTables = new Map();
        let metadata = {};

        for (const record of results) {
          if (record.id === '__metadata__') {
            metadata = record.data || {};
            continue;
          }

          const tableId = typeof record.id === 'number' ? record.id : Number(record.id);
          const entriesObject = record.data || {};
          const tableData = new Map();
          
          // Restore entries, converting binary data back to Uint8Array
          for (const [key, value] of Object.entries(entriesObject)) {
            if (value && typeof value === 'object' && value._type === 'binary' && Array.isArray(value.data)) {
              // Restore binary data
              tableData.set(key, new Uint8Array(value.data));
            } else {
              tableData.set(key, value);
            }
          }
          
          externalTables.set(tableId, tableData);
        }

        console.log(`Loaded ${externalTables.size} tables from IndexedDB`);
        resolve({ tables: externalTables, metadata });
      };

      request.onerror = reject;
    });
  }

  /**
   * Clear all persisted data
   */
  async clearAll() {
    if (!this.db) await this.init();

    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = resolve;
      request.onerror = reject;
    });
  }
}

export default new LuaPersistence();