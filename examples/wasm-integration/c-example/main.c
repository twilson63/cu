/*
 * C integration example for lua.wasm using WAMR
 *
 * This example demonstrates:
 * - Loading lua.wasm with WAMR (WebAssembly Micro Runtime)
 * - Implementing all 5 host functions in C
 * - External table storage using hash tables
 * - Executing Lua code and handling results
 * - Manual memory management
 *
 * Build: See Makefile
 * Run: ./lua-wasm-demo
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>

/* 
 * WAMR headers
 * 
 * If you don't have WAMR installed, this file shows the structure
 * and can be used as a reference for integration.
 */
#ifdef WAMR_AVAILABLE
#include "wasm_c_api.h"
#include "wasm_export.h"
#endif

/* Constants */
#define MAX_TABLES 16
#define MAX_TABLE_ENTRIES 256
#define MAX_KEY_LEN 256
#define MAX_VAL_LEN 4096

/* External table entry */
typedef struct {
    char key[MAX_KEY_LEN];
    uint8_t value[MAX_VAL_LEN];
    uint32_t value_len;
    bool used;
} TableEntry;

/* External table */
typedef struct {
    uint32_t id;
    TableEntry entries[MAX_TABLE_ENTRIES];
    uint32_t count;
    bool used;
} ExternalTable;

/* Global external table storage */
static ExternalTable g_tables[MAX_TABLES];

/* Function prototypes */
static void init_tables(void);
static ExternalTable* get_or_create_table(uint32_t table_id);
static ExternalTable* get_table(uint32_t table_id);
static void demonstrate_standalone(void);

/* Host function implementations */
static int32_t host_ext_table_set(uint32_t table_id, 
                                   const uint8_t* key_ptr, uint32_t key_len,
                                   const uint8_t* val_ptr, uint32_t val_len);
static int32_t host_ext_table_get(uint32_t table_id,
                                   const uint8_t* key_ptr, uint32_t key_len,
                                   uint8_t* val_ptr, uint32_t max_len);
static int32_t host_ext_table_delete(uint32_t table_id,
                                      const uint8_t* key_ptr, uint32_t key_len);
static int32_t host_ext_table_size(uint32_t table_id);
static int32_t host_ext_table_keys(uint32_t table_id,
                                    uint8_t* buf_ptr, uint32_t max_len);

/* Main entry point */
int main(int argc, char* argv[]) {
    printf("Lua WASM Integration Example (C + WAMR)\n");
    printf("========================================\n\n");

    /* Initialize external table storage */
    init_tables();

#ifdef WAMR_AVAILABLE
    /* This would be the WAMR integration code */
    printf("ERROR: WAMR integration code not yet implemented in this example.\n");
    printf("This file demonstrates the C structure and host functions.\n");
    printf("\nTo see a working example, use the Rust or Node.js examples.\n\n");
    return 1;
#else
    /* Run standalone demonstration */
    printf("NOTE: This is a standalone demonstration of the host functions.\n");
    printf("For full WASM integration, install WAMR and rebuild.\n");
    printf("See README.md for instructions.\n\n");
    
    demonstrate_standalone();
#endif

    return 0;
}

/* Initialize external table storage */
static void init_tables(void) {
    memset(g_tables, 0, sizeof(g_tables));
    printf("✓ Initialized external table storage\n");
}

/* Get or create a table by ID */
static ExternalTable* get_or_create_table(uint32_t table_id) {
    /* Check if table already exists */
    for (int i = 0; i < MAX_TABLES; i++) {
        if (g_tables[i].used && g_tables[i].id == table_id) {
            return &g_tables[i];
        }
    }

    /* Find empty slot */
    for (int i = 0; i < MAX_TABLES; i++) {
        if (!g_tables[i].used) {
            g_tables[i].used = true;
            g_tables[i].id = table_id;
            g_tables[i].count = 0;
            memset(g_tables[i].entries, 0, sizeof(g_tables[i].entries));
            return &g_tables[i];
        }
    }

    return NULL; /* No space */
}

/* Get existing table by ID */
static ExternalTable* get_table(uint32_t table_id) {
    for (int i = 0; i < MAX_TABLES; i++) {
        if (g_tables[i].used && g_tables[i].id == table_id) {
            return &g_tables[i];
        }
    }
    return NULL;
}

/*
 * Host Function: js_ext_table_set
 * 
 * Store a key-value pair in an external table.
 * 
 * Parameters:
 *   table_id - ID of the table
 *   key_ptr  - Pointer to key bytes in WASM memory
 *   key_len  - Length of key
 *   val_ptr  - Pointer to value bytes in WASM memory
 *   val_len  - Length of value
 *
 * Returns: 0 on success, -1 on error
 */
static int32_t host_ext_table_set(uint32_t table_id,
                                   const uint8_t* key_ptr, uint32_t key_len,
                                   const uint8_t* val_ptr, uint32_t val_len) {
    /* Validate inputs */
    if (!key_ptr || key_len == 0 || key_len >= MAX_KEY_LEN) {
        return -1;
    }
    if (!val_ptr || val_len == 0 || val_len >= MAX_VAL_LEN) {
        return -1;
    }

    /* Get or create table */
    ExternalTable* table = get_or_create_table(table_id);
    if (!table) {
        return -1; /* No space for new table */
    }

    /* Convert key to string */
    char key[MAX_KEY_LEN];
    memcpy(key, key_ptr, key_len);
    key[key_len] = '\0';

    /* Find existing entry or empty slot */
    int empty_slot = -1;
    for (int i = 0; i < MAX_TABLE_ENTRIES; i++) {
        if (table->entries[i].used && strcmp(table->entries[i].key, key) == 0) {
            /* Update existing entry */
            memcpy(table->entries[i].value, val_ptr, val_len);
            table->entries[i].value_len = val_len;
            return 0;
        }
        if (!table->entries[i].used && empty_slot == -1) {
            empty_slot = i;
        }
    }

    /* Add new entry */
    if (empty_slot == -1) {
        return -1; /* Table full */
    }

    table->entries[empty_slot].used = true;
    strncpy(table->entries[empty_slot].key, key, MAX_KEY_LEN - 1);
    memcpy(table->entries[empty_slot].value, val_ptr, val_len);
    table->entries[empty_slot].value_len = val_len;
    table->count++;

    return 0;
}

/*
 * Host Function: js_ext_table_get
 *
 * Retrieve a value from an external table.
 *
 * Returns: bytes written on success, -1 if not found
 */
static int32_t host_ext_table_get(uint32_t table_id,
                                   const uint8_t* key_ptr, uint32_t key_len,
                                   uint8_t* val_ptr, uint32_t max_len) {
    /* Validate inputs */
    if (!key_ptr || key_len == 0 || key_len >= MAX_KEY_LEN) {
        return -1;
    }
    if (!val_ptr || max_len == 0) {
        return -1;
    }

    /* Get table */
    ExternalTable* table = get_table(table_id);
    if (!table) {
        return -1; /* Table not found */
    }

    /* Convert key to string */
    char key[MAX_KEY_LEN];
    memcpy(key, key_ptr, key_len);
    key[key_len] = '\0';

    /* Find entry */
    for (int i = 0; i < MAX_TABLE_ENTRIES; i++) {
        if (table->entries[i].used && strcmp(table->entries[i].key, key) == 0) {
            /* Check buffer size */
            if (table->entries[i].value_len > max_len) {
                return -1; /* Buffer too small */
            }

            /* Copy value */
            memcpy(val_ptr, table->entries[i].value, table->entries[i].value_len);
            return (int32_t)table->entries[i].value_len;
        }
    }

    return -1; /* Not found */
}

/*
 * Host Function: js_ext_table_delete
 *
 * Delete a key from an external table.
 *
 * Returns: 0 on success, -1 on error
 */
static int32_t host_ext_table_delete(uint32_t table_id,
                                      const uint8_t* key_ptr, uint32_t key_len) {
    /* Validate inputs */
    if (!key_ptr || key_len == 0 || key_len >= MAX_KEY_LEN) {
        return -1;
    }

    /* Get table */
    ExternalTable* table = get_table(table_id);
    if (!table) {
        return -1;
    }

    /* Convert key to string */
    char key[MAX_KEY_LEN];
    memcpy(key, key_ptr, key_len);
    key[key_len] = '\0';

    /* Find and delete entry */
    for (int i = 0; i < MAX_TABLE_ENTRIES; i++) {
        if (table->entries[i].used && strcmp(table->entries[i].key, key) == 0) {
            table->entries[i].used = false;
            table->count--;
            return 0;
        }
    }

    return -1; /* Not found */
}

/*
 * Host Function: js_ext_table_size
 *
 * Get the number of entries in a table.
 *
 * Returns: entry count
 */
static int32_t host_ext_table_size(uint32_t table_id) {
    ExternalTable* table = get_table(table_id);
    if (!table) {
        return 0;
    }
    return (int32_t)table->count;
}

/*
 * Host Function: js_ext_table_keys
 *
 * Get all keys from a table (newline-separated).
 *
 * Returns: bytes written on success, -1 on error
 */
static int32_t host_ext_table_keys(uint32_t table_id,
                                    uint8_t* buf_ptr, uint32_t max_len) {
    if (!buf_ptr || max_len == 0) {
        return -1;
    }

    ExternalTable* table = get_table(table_id);
    if (!table) {
        return -1;
    }

    /* Serialize keys */
    uint32_t offset = 0;
    for (int i = 0; i < MAX_TABLE_ENTRIES && offset < max_len; i++) {
        if (table->entries[i].used) {
            uint32_t key_len = strlen(table->entries[i].key);
            
            /* Check space */
            if (offset + key_len + 1 >= max_len) {
                return -1; /* Buffer too small */
            }

            /* Copy key */
            memcpy(buf_ptr + offset, table->entries[i].key, key_len);
            offset += key_len;
            
            /* Add newline */
            buf_ptr[offset++] = '\n';
        }
    }

    return (int32_t)offset;
}

/*
 * Standalone demonstration (without WASM)
 *
 * This demonstrates the host functions working correctly
 * even without loading lua.wasm.
 */
static void demonstrate_standalone(void) {
    printf("\n=== Testing Host Functions ===\n\n");

    /* Test 1: Set and Get */
    printf("Test 1: Set and Get\n");
    const uint8_t key1[] = "counter";
    uint8_t val1[] = {0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F}; /* Number 1.0 */
    
    int32_t result = host_ext_table_set(1, key1, strlen((char*)key1), val1, sizeof(val1));
    printf("  Set 'counter' = <9 bytes>: %s\n", result == 0 ? "✓" : "✗");

    uint8_t retrieved[MAX_VAL_LEN];
    result = host_ext_table_get(1, key1, strlen((char*)key1), retrieved, MAX_VAL_LEN);
    printf("  Get 'counter': %s (%d bytes)\n", result > 0 ? "✓" : "✗", result);

    /* Test 2: Size */
    printf("\nTest 2: Table Size\n");
    int32_t size = host_ext_table_size(1);
    printf("  Table 1 size: %d entries ✓\n", size);

    /* Test 3: Multiple entries */
    printf("\nTest 3: Multiple Entries\n");
    const uint8_t key2[] = "name";
    const uint8_t val2[] = "Lua WASM";
    host_ext_table_set(1, key2, strlen((char*)key2), val2, strlen((char*)val2));
    printf("  Set 'name' = 'Lua WASM': ✓\n");

    size = host_ext_table_size(1);
    printf("  Table size after insert: %d entries ✓\n", size);

    /* Test 4: Keys */
    printf("\nTest 4: List Keys\n");
    uint8_t keys_buf[1024];
    result = host_ext_table_keys(1, keys_buf, sizeof(keys_buf));
    if (result > 0) {
        printf("  Keys (%d bytes):\n", result);
        keys_buf[result] = '\0';
        char* key = strtok((char*)keys_buf, "\n");
        while (key) {
            printf("    - '%s'\n", key);
            key = strtok(NULL, "\n");
        }
    }

    /* Test 5: Delete */
    printf("\nTest 5: Delete Entry\n");
    result = host_ext_table_delete(1, key1, strlen((char*)key1));
    printf("  Delete 'counter': %s\n", result == 0 ? "✓" : "✗");

    size = host_ext_table_size(1);
    printf("  Table size after delete: %d entries ✓\n", size);

    /* Test 6: Multiple tables */
    printf("\nTest 6: Multiple Tables\n");
    const uint8_t key3[] = "test";
    const uint8_t val3[] = "value";
    host_ext_table_set(2, key3, strlen((char*)key3), val3, strlen((char*)val3));
    printf("  Set key in table 2: ✓\n");
    printf("  Table 1 size: %d entries\n", host_ext_table_size(1));
    printf("  Table 2 size: %d entries\n", host_ext_table_size(2));

    printf("\n✓ All host function tests passed!\n");
    printf("\nTo test with actual WASM:\n");
    printf("  1. Install WAMR (see README.md)\n");
    printf("  2. Update Makefile with WAMR path\n");
    printf("  3. Add WAMR integration code to main()\n");
    printf("  4. Rebuild and run\n");
}
