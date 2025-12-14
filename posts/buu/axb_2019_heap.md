> 状态：doing  
> 分类：Heap
> libc：

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

