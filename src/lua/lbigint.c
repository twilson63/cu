/*
** lbigint.c
** Lua bigint library - Arbitrary precision integer arithmetic
** Provides Lua bindings to Zig bigint implementation
*/

#include "lua.h"
#include "lauxlib.h"

/*
** Metatable name for bigint userdata type identification
*/
#define BIGINT_METATABLE "Cu.BigInt"

/*
** BigInt userdata structure
** Wraps an opaque Zig bigint handle
*/
typedef struct BigIntUserdata {
    void* handle;  /* Opaque pointer to Zig std.math.big.int.Managed */
} BigIntUserdata;

/*
** External Zig bigint functions
** These are implemented in src/bignum.zig and exported to WASM
*/

/* Constructor functions */
extern void* bigint_new_from_string(const char* str, size_t len, int base);
extern void* bigint_new_from_i64(long long val);

/* Memory management */
extern void bigint_free(void* handle);

/* Arithmetic operations - return new bigint handle */
extern void* bigint_add(void* a, void* b);
extern void* bigint_sub(void* a, void* b);
extern void* bigint_mul(void* a, void* b);
extern void* bigint_div(void* a, void* b);
extern void* bigint_mod(void* a, void* b);

/* Comparison - returns -1, 0, or 1 */
extern int bigint_compare(void* a, void* b);

/* String conversion - returns length written (or -1 on error) */
extern int bigint_to_string(void* handle, int base, char* buf, size_t max_len);

/*
** Helper function: check and return BigIntUserdata
** Validates that the Lua value at index is a bigint userdata
** Raises Lua error if type check fails
*/
static BigIntUserdata* check_bigint(lua_State* L, int index) {
    BigIntUserdata* ud = (BigIntUserdata*)luaL_checkudata(L, index, BIGINT_METATABLE);
    if (ud->handle == NULL) {
        luaL_error(L, "invalid bigint (freed or null handle)");
    }
    return ud;
}

/*
** bigint.new(value [, base])
** Constructor function for creating new bigint instances
** 
** Args:
**   value: string or number to convert to bigint
**   base: optional integer base for string parsing (default 10, range 2-36)
**
** Returns:
**   new bigint userdata
**
** Examples:
**   local a = bigint.new(42)
**   local b = bigint.new("123456789012345678901234567890")
**   local c = bigint.new("DEADBEEF", 16)
*/
static int l_bigint_new(lua_State* L) {
    void* handle = NULL;
    
    if (lua_type(L, 1) == LUA_TSTRING) {
        /* String construction with optional base */
        size_t len;
        const char* str = lua_tolstring(L, 1, &len);
        int base = (int)luaL_optinteger(L, 2, 10);
        
        if (base < 2 || base > 36) {
            return luaL_error(L, "base must be between 2 and 36");
        }
        
        handle = bigint_new_from_string(str, len, base);
        
    } else if (lua_type(L, 1) == LUA_TNUMBER) {
        /* Number construction */
        long long val = (long long)lua_tointeger(L, 1);
        handle = bigint_new_from_i64(val);
        
    } else {
        return luaL_error(L, "bigint.new expects string or number, got %s", 
                         lua_typename(L, lua_type(L, 1)));
    }
    
    if (handle == NULL) {
        return luaL_error(L, "failed to create bigint");
    }
    
    /* Create userdata and attach metatable */
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = handle;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:add(other)
** Addition method for bigint arithmetic
**
** Args:
**   other: another bigint
**
** Returns:
**   new bigint representing self + other
*/
static int l_bigint_add(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    void* result = bigint_add(a->handle, b->handle);
    if (result == NULL) {
        return luaL_error(L, "bigint addition failed");
    }
    
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:sub(other)
** Subtraction method for bigint arithmetic
**
** Args:
**   other: another bigint
**
** Returns:
**   new bigint representing self - other
*/
static int l_bigint_sub(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    void* result = bigint_sub(a->handle, b->handle);
    if (result == NULL) {
        return luaL_error(L, "bigint subtraction failed");
    }
    
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:mul(other)
** Multiplication method for bigint arithmetic
**
** Args:
**   other: another bigint
**
** Returns:
**   new bigint representing self * other
*/
static int l_bigint_mul(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    void* result = bigint_mul(a->handle, b->handle);
    if (result == NULL) {
        return luaL_error(L, "bigint multiplication failed");
    }
    
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:div(other)
** Division method for bigint arithmetic
**
** Args:
**   other: another bigint (must be non-zero)
**
** Returns:
**   new bigint representing floor(self / other)
*/
static int l_bigint_div(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    void* result = bigint_div(a->handle, b->handle);
    if (result == NULL) {
        return luaL_error(L, "bigint division failed (division by zero?)");
    }
    
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:mod(other)
** Modulo method for bigint arithmetic
**
** Args:
**   other: another bigint (must be non-zero)
**
** Returns:
**   new bigint representing self % other
*/
static int l_bigint_mod(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    void* result = bigint_mod(a->handle, b->handle);
    if (result == NULL) {
        return luaL_error(L, "bigint modulo failed (division by zero?)");
    }
    
    BigIntUserdata* ud = (BigIntUserdata*)lua_newuserdata(L, sizeof(BigIntUserdata));
    ud->handle = result;
    luaL_setmetatable(L, BIGINT_METATABLE);
    
    return 1;
}

/*
** bigint:tostring([base])
** Convert bigint to string representation
**
** Args:
**   base: optional integer base (default 10, range 2-36)
**
** Returns:
**   string representation of the bigint
*/
static int l_bigint_tostring(lua_State* L) {
    BigIntUserdata* ud = check_bigint(L, 1);
    int base = (int)luaL_optinteger(L, 2, 10);
    
    if (base < 2 || base > 36) {
        return luaL_error(L, "base must be between 2 and 36");
    }
    
    /* Allocate buffer - use reasonable size for most bigints */
    char buffer[1024];
    int len = bigint_to_string(ud->handle, base, buffer, sizeof(buffer));
    
    if (len < 0) {
        return luaL_error(L, "failed to convert bigint to string (number too large?)");
    }
    
    lua_pushlstring(L, buffer, (size_t)len);
    return 1;
}

/*
** Metamethod: __add
** Enables operator overloading for addition: a + b
*/
static int l_bigint_meta_add(lua_State* L) {
    return l_bigint_add(L);
}

/*
** Metamethod: __sub
** Enables operator overloading for subtraction: a - b
*/
static int l_bigint_meta_sub(lua_State* L) {
    return l_bigint_sub(L);
}

/*
** Metamethod: __mul
** Enables operator overloading for multiplication: a * b
*/
static int l_bigint_meta_mul(lua_State* L) {
    return l_bigint_mul(L);
}

/*
** Metamethod: __div
** Enables operator overloading for division: a / b
*/
static int l_bigint_meta_div(lua_State* L) {
    return l_bigint_div(L);
}

/*
** Metamethod: __mod
** Enables operator overloading for modulo: a % b
*/
static int l_bigint_meta_mod(lua_State* L) {
    return l_bigint_mod(L);
}

/*
** Metamethod: __eq
** Enables operator overloading for equality: a == b
*/
static int l_bigint_meta_eq(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    int cmp = bigint_compare(a->handle, b->handle);
    lua_pushboolean(L, cmp == 0);
    return 1;
}

/*
** Metamethod: __lt
** Enables operator overloading for less than: a < b
*/
static int l_bigint_meta_lt(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    int cmp = bigint_compare(a->handle, b->handle);
    lua_pushboolean(L, cmp < 0);
    return 1;
}

/*
** Metamethod: __le
** Enables operator overloading for less than or equal: a <= b
*/
static int l_bigint_meta_le(lua_State* L) {
    BigIntUserdata* a = check_bigint(L, 1);
    BigIntUserdata* b = check_bigint(L, 2);
    
    int cmp = bigint_compare(a->handle, b->handle);
    lua_pushboolean(L, cmp <= 0);
    return 1;
}

/*
** Metamethod: __tostring
** Enables automatic string conversion for print(), tostring(), etc.
*/
static int l_bigint_meta_tostring(lua_State* L) {
    return l_bigint_tostring(L);
}

/*
** Metamethod: __gc
** Garbage collection finalizer - frees Zig bigint handle
** Called automatically when Lua userdata is collected
*/
static int l_bigint_meta_gc(lua_State* L) {
    BigIntUserdata* ud = (BigIntUserdata*)luaL_checkudata(L, 1, BIGINT_METATABLE);
    if (ud->handle != NULL) {
        bigint_free(ud->handle);
        ud->handle = NULL;
    }
    return 0;
}

/*
** Module function registration table
** These become accessible as bigint.new(), etc.
*/
static const luaL_Reg bigint_functions[] = {
    {"new", l_bigint_new},
    {"add", l_bigint_add},
    {"sub", l_bigint_sub},
    {"mul", l_bigint_mul},
    {"div", l_bigint_div},
    {"mod", l_bigint_mod},
    {NULL, NULL}
};

/*
** Metamethod registration table
** These enable operator overloading and special behaviors
*/
static const luaL_Reg bigint_metamethods[] = {
    /* Method functions (accessible as obj:method()) */
    {"add", l_bigint_add},
    {"sub", l_bigint_sub},
    {"mul", l_bigint_mul},
    {"div", l_bigint_div},
    {"mod", l_bigint_mod},
    {"tostring", l_bigint_tostring},
    
    /* Operator overloads */
    {"__add", l_bigint_meta_add},
    {"__sub", l_bigint_meta_sub},
    {"__mul", l_bigint_meta_mul},
    {"__div", l_bigint_meta_div},
    {"__mod", l_bigint_meta_mod},
    {"__eq", l_bigint_meta_eq},
    {"__lt", l_bigint_meta_lt},
    {"__le", l_bigint_meta_le},
    {"__tostring", l_bigint_meta_tostring},
    
    /* Memory management */
    {"__gc", l_bigint_meta_gc},
    
    {NULL, NULL}
};

/*
** luaopen_bigint
** Module initialization function - called when bigint library is loaded
**
** Sets up:
**   1. BIGINT_METATABLE with metamethods and methods
**   2. bigint module table with constructor functions
**
** Returns:
**   bigint module table on Lua stack
*/
LUAMOD_API int luaopen_bigint(lua_State* L) {
    /* Create metatable for BigInt userdata */
    luaL_newmetatable(L, BIGINT_METATABLE);
    
    /* Register metamethods */
    luaL_setfuncs(L, bigint_metamethods, 0);
    
    /* Set __index to metatable itself for method calls */
    /* This allows obj:method() syntax to find methods in the metatable */
    lua_pushvalue(L, -1);  /* Duplicate metatable */
    lua_setfield(L, -2, "__index");
    
    /* Pop metatable */
    lua_pop(L, 1);
    
    /* Create and return module table */
    luaL_newlib(L, bigint_functions);
    
    return 1;
}
