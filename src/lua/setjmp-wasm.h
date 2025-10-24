#ifndef SETJMP_WASM_H
#define SETJMP_WASM_H

#ifdef __wasm__

#include <stdint.h>

typedef uint64_t jmp_buf[5];

static inline int setjmp(jmp_buf env) {
    return 0;
}

static inline int _setjmp(jmp_buf env) {
    return 0;
}

static inline void longjmp(jmp_buf env, int val) {
    __builtin_unreachable();
}

static inline void _longjmp(jmp_buf env, int val) {
    __builtin_unreachable();
}

#else
#include <setjmp.h>
#endif

#endif
