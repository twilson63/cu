#ifndef _ASSERT_H
#define _ASSERT_H

#ifdef __cplusplus
extern "C" {
#endif

#define assert(expr) ((void)sizeof(expr))

#ifdef __cplusplus
}
#endif

#endif
