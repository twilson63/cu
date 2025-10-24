#ifndef _DLFCN_H
#define _DLFCN_H

#ifdef __cplusplus
extern "C" {
#endif

#define RTLD_LAZY 1
#define RTLD_NOW 2
#define RTLD_GLOBAL 4
#define RTLD_LOCAL 0

extern void *dlopen(const char *filename, int flags);
extern void *dlsym(void *restrict handle, const char *restrict symbol);
extern int dlclose(void *handle);
extern char *dlerror(void);

#ifdef __cplusplus
}
#endif

#endif
