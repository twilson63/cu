#ifndef _SYS_WAIT_H
#define _SYS_WAIT_H

#ifdef __cplusplus
extern "C" {
#endif

extern int waitpid(int pid, int *status, int options);

#define WNOHANG 1
#define WUNTRACED 2

#ifdef __cplusplus
}
#endif

#endif
