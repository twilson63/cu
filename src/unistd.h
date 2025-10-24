#ifndef _UNISTD_H
#define _UNISTD_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

extern char *getenv(const char *name);
extern int chdir(const char *path);
extern char *getcwd(char *buf, size_t size);
extern unsigned int sleep(unsigned int seconds);
extern int usleep(unsigned int usec);
extern int access(const char *pathname, int mode);
extern int rmdir(const char *pathname);

#define F_OK 0
#define X_OK 1
#define W_OK 2
#define R_OK 4

#ifdef __cplusplus
}
#endif

#endif
