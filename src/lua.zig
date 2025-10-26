pub const c = @cImport({
    @cInclude("lua.h");
    @cInclude("lauxlib.h");
    @cInclude("lualib.h");
    @cInclude("lstate.h");
});

pub const lua_State = c.lua_State;

pub inline fn newstate() ?*lua_State {
    return c.luaL_newstate();
}

pub inline fn openlibs(L: *lua_State) void {
    c.luaL_openlibs(L);
}

pub inline fn close(L: *lua_State) void {
    c.lua_close(L);
}

pub fn dostring(L: *lua_State, code: [*:0]const u8) c_int {
    const load_result = c.luaL_loadstring(L, code);
    if (load_result != 0) {
        return load_result;
    }
    return c.lua_pcallk(L, 0, -1, 0, 0, null);
}

pub inline fn tolstring(L: *lua_State, idx: c_int, out_len: *usize) [*:0]const u8 {
    return c.lua_tolstring(L, idx, out_len);
}

pub inline fn type_name(L: *lua_State, idx: c_int) [*:0]const u8 {
    return c.lua_typename(L, c.lua_type(L, idx));
}

pub fn tostring(L: *lua_State, idx: c_int) [*:0]const u8 {
    var len: usize = 0;
    return c.lua_tolstring(L, idx, &len);
}

pub inline fn gettop(L: *lua_State) c_int {
    return c.lua_gettop(L);
}

pub inline fn settop(L: *lua_State, idx: c_int) void {
    c.lua_settop(L, idx);
}

pub inline fn pop(L: *lua_State, n: c_int) void {
    c.lua_settop(L, -(n) - 1);
}

pub inline fn getglobal(L: *lua_State, name: [*:0]const u8) c_int {
    return c.lua_getglobal(L, name);
}

pub inline fn setglobal(L: *lua_State, name: [*:0]const u8) void {
    c.lua_setglobal(L, name);
}

pub inline fn pushstring(L: *lua_State, s: [*:0]const u8) [*:0]const u8 {
    return c.lua_pushstring(L, s);
}

pub inline fn pushlstring(L: *lua_State, s: [*]const u8, str_len: usize) [*:0]const u8 {
    return c.lua_pushlstring(L, s, str_len);
}

pub inline fn pushinteger(L: *lua_State, n: c.lua_Integer) void {
    c.lua_pushinteger(L, n);
}

pub inline fn pushnumber(L: *lua_State, n: c.lua_Number) void {
    c.lua_pushnumber(L, n);
}

pub inline fn pushboolean(L: *lua_State, b: c_int) void {
    c.lua_pushboolean(L, b);
}

pub inline fn pushnil(L: *lua_State) void {
    c.lua_pushnil(L);
}

pub inline fn pushvalue(L: *lua_State, idx: c_int) void {
    c.lua_pushvalue(L, idx);
}

pub fn tointeger(L: *lua_State, idx: c_int) c.lua_Integer {
    return c.lua_tointegerx(L, idx, null);
}

pub fn tonumber(L: *lua_State, idx: c_int) c.lua_Number {
    return c.lua_tonumberx(L, idx, null);
}

pub inline fn toboolean(L: *lua_State, idx: c_int) bool {
    return c.lua_toboolean(L, idx) != 0;
}

pub inline fn isnil(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TNIL;
}

pub inline fn isstring(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TSTRING;
}

pub inline fn isnumber(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TNUMBER;
}

pub inline fn isboolean(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TBOOLEAN;
}

pub inline fn istable(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TTABLE;
}

pub inline fn isfunction(L: *lua_State, idx: c_int) bool {
    return c.lua_type(L, idx) == c.LUA_TFUNCTION;
}

pub inline fn objlen(L: *lua_State, idx: c_int) usize {
    return c.lua_objlen(L, idx);
}

pub inline fn newtable(L: *lua_State) void {
    c.lua_newtable(L);
}

pub inline fn setfield(L: *lua_State, idx: c_int, field: [*:0]const u8) void {
    c.lua_setfield(L, idx, field);
}

pub inline fn getfield(L: *lua_State, idx: c_int, field: [*:0]const u8) c_int {
    return c.lua_getfield(L, idx, field);
}

pub inline fn pushcfunction(L: *lua_State, f: c.lua_CFunction) void {
    c.lua_pushcfunction(L, f);
}

pub inline fn setmetatable(L: *lua_State, idx: c_int) c_int {
    return c.lua_setmetatable(L, idx);
}

pub inline fn getmetatable(L: *lua_State, idx: c_int) c_int {
    return c.lua_getmetatable(L, idx);
}

pub inline fn luaL_newmetatable(L: *lua_State, tname: [*:0]const u8) c_int {
    return c.luaL_newmetatable(L, tname);
}
