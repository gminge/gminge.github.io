> 状态：doing  
> 分类：Heap  
> libc：2.23

## 初步观察

有一个fmt
  ```
  puts("Welcome to note management system!");
  printf("Enter your name: ");
  __isoc99_scanf("%s", format);
  printf("Hello, ");
  printf(format);
  ```
好像没有show
show被ban了
key是什么

size大小有限制
```
if ( size <= 0x80 )
```

这个题libc版本是啥啊，看有的wp说是2.23
当2.23写好了

先泄漏地址

0x3c67a8 <--free hook偏移

修改指向分配位置的指针（大概是这个意思吗在严肃阅读wp[wp](https://www.cnblogs.com/ZedsM4gicC4bin/articles/18689569)
其实没太搞明白那个堆快合并不合并啥的。。

