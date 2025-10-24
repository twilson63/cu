#ifndef _MATH_H
#define _MATH_H

#ifdef __cplusplus
extern "C" {
#endif

extern double sin(double x);
extern double cos(double x);
extern double tan(double x);
extern double asin(double x);
extern double acos(double x);
extern double atan(double x);
extern double atan2(double y, double x);

extern double sinh(double x);
extern double cosh(double x);
extern double tanh(double x);

extern double sqrt(double x);
extern double pow(double x, double y);
extern double exp(double x);
extern double log(double x);
extern double log10(double x);
extern double log2(double x);

extern double floor(double x);
extern double ceil(double x);
extern double fabs(double x);
extern double fmod(double x, double y);

extern double modf(double x, double *ipart);
extern double ldexp(double x, int exp);
extern double frexp(double x, int *exp);

#define M_E        2.7182818284590452354
#define M_LOG2E    1.4426950408889634074
#define M_LOG10E   0.43429448190325182765
#define M_LN2      0.69314718055994530942
#define M_LN10     2.30258509299404568402
#define M_PI       3.14159265358979323846
#define M_PI_2     1.57079632679489661923
#define M_PI_4     0.78539816339744830962
#define M_1_PI     0.31830988618379067154
#define M_2_PI     0.63661977236758134308
#define M_2_SQRTPI 1.12837916709551257390
#define M_SQRT2    1.41421356237309504880
#define M_SQRT1_2  0.70710678118654752440

#define HUGE_VAL 1.79769313486231570814e+308
#define INFINITY __builtin_inff()
#define NAN __builtin_nanf("")

#ifdef __cplusplus
}
#endif

#endif
