#ifndef _STDIO_H
#define _STDIO_H

#include <stddef.h>
#include <stdarg.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    unsigned char *buf;
    int pos;
    int size;
} FILE;

#define EOF (-1)
#define BUFSIZ 8192

extern FILE *stdin;
extern FILE *stdout;
extern FILE *stderr;

extern int printf(const char *format, ...);
extern int fprintf(FILE *stream, const char *format, ...);
extern int sprintf(char *str, const char *format, ...);
extern int snprintf(char *str, size_t size, const char *format, ...);
extern int vprintf(const char *format, va_list ap);
extern int vfprintf(FILE *stream, const char *format, va_list ap);
extern int vsprintf(char *str, const char *format, va_list ap);

extern FILE *fopen(const char *filename, const char *mode);
extern int fclose(FILE *stream);
extern size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream);
extern size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);
extern int fseek(FILE *stream, long offset, int whence);
extern long ftell(FILE *stream);
extern int getc(FILE *stream);
extern int putc(int c, FILE *stream);
extern int getchar(void);
extern int putchar(int c);
extern char *fgets(char *s, int size, FILE *stream);
extern int fputs(const char *s, FILE *stream);
extern int puts(const char *s);
extern int fflush(FILE *stream);
extern int ferror(FILE *stream);
extern int feof(FILE *stream);
extern FILE *freopen(const char *filename, const char *mode, FILE *stream);
extern char *strerror(int errnum);
extern int setvbuf(FILE *stream, char *buf, int mode, size_t size);
extern int remove(const char *filename);
extern int rename(const char *oldname, const char *newname);
extern FILE *tmpfile(void);
extern int ungetc(int c, FILE *stream);
extern void clearerr(FILE *stream);

#define _IOFBF 0
#define _IOLBF 1
#define _IONBF 2

#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2

#ifdef __cplusplus
}
#endif

#endif
