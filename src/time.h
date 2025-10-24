#ifndef _TIME_H
#define _TIME_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef long time_t;
typedef long clock_t;

#define CLOCKS_PER_SEC 1000000L

struct tm {
    int tm_sec;
    int tm_min;
    int tm_hour;
    int tm_mday;
    int tm_mon;
    int tm_year;
    int tm_wday;
    int tm_yday;
    int tm_isdst;
};

extern time_t time(time_t *tloc);
extern clock_t clock(void);
extern double difftime(time_t time1, time_t time2);
extern time_t mktime(struct tm *timeptr);
extern struct tm *gmtime(const time_t *timep);
extern struct tm *localtime(const time_t *timep);
extern char *asctime(const struct tm *timeptr);
extern char *ctime(const time_t *timep);
extern size_t strftime(char *s, size_t max, const char *format, const struct tm *tm);

#ifdef __cplusplus
}
#endif

#endif
