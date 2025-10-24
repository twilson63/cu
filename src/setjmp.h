#ifndef _SETJMP_H
#define _SETJMP_H

#ifdef __cplusplus
extern "C" {
#endif

typedef unsigned long jmp_buf[8];

extern int setjmp(jmp_buf env);
extern void longjmp(jmp_buf env, int val);

#ifdef __cplusplus
}
#endif

#endif
