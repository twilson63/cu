#ifndef _STDLIB_H
#define _STDLIB_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

extern void *malloc(size_t size);
extern void *realloc(void *ptr, size_t size);
extern void *calloc(size_t nmemb, size_t size);
extern void free(void *ptr);

extern int atoi(const char *nptr);
extern long int strtol(const char *nptr, char **endptr, int base);
extern double strtod(const char *nptr, char **endptr);

extern void qsort(void *base, size_t nmemb, size_t size,
                  int (*compar)(const void *, const void *));

extern int rand(void);
extern void srand(unsigned int seed);

extern int abs(int j);
extern long int labs(long int j);
extern int system(const char *command);
extern void exit(int status);
extern void abort(void);
extern int atexit(void (*func)(void));
extern char *getenv(const char *name);

#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1

#ifdef __cplusplus
}
#endif

#endif
