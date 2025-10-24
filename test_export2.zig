fn test_func() i32 {
    return 42;
}

pub export fn wrapped() i32 {
    return test_func();
}
