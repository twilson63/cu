#ifndef _SIGNAL_H
#define _SIGNAL_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int sig_atomic_t;
typedef void (*sighandler_t)(int);

#define SIG_DFL ((sighandler_t)0)
#define SIG_IGN ((sighandler_t)1)
#define SIG_ERR ((sighandler_t)-1)

#define SIGABRT 6
#define SIGALRM 14
#define SIGFPE 8
#define SIGHUP 1
#define SIGILL 4
#define SIGINT 2
#define SIGKILL 9
#define SIGPIPE 13
#define SIGQUIT 3
#define SIGSEGV 11
#define SIGTERM 15
#define SIGSTOP 19
#define SIGTSTP 20
#define SIGTTIN 21
#define SIGTTOU 22

extern sighandler_t signal(int signum, sighandler_t handler);
extern int kill(int pid, int sig);
extern int raise(int sig);
extern int pause(void);

#ifdef __cplusplus
}
#endif

#endif
