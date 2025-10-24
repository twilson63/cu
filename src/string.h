#ifndef _STRING_H
#define _STRING_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

extern void *memcpy(void *dest, const void *src, size_t n);
extern void *memmove(void *dest, const void *src, size_t n);
extern void *memset(void *s, int c, size_t n);
extern int memcmp(const void *s1, const void *s2, size_t n);
extern void *memchr(const void *s, int c, size_t n);

extern char *strcpy(char *dest, const char *src);
extern char *strncpy(char *dest, const char *src, size_t n);
extern char *strcat(char *dest, const char *src);
extern char *strncat(char *dest, const char *src, size_t n);

extern int strcmp(const char *s1, const char *s2);
extern int strncmp(const char *s1, const char *s2, size_t n);

extern size_t strlen(const char *s);
extern char *strchr(const char *s, int c);
extern char *strrchr(const char *s, int c);
extern char *strstr(const char *haystack, const char *needle);
extern size_t strspn(const char *s, const char *accept);
extern size_t strcspn(const char *s, const char *reject);
extern char *strtok(char *str, const char *delim);
extern char *strdup(const char *s);
extern char *strpbrk(const char *s, const char *accept);
extern int strcoll(const char *s1, const char *s2);

#ifdef __cplusplus
}
#endif

#endif
