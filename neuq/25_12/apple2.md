> 保护情况：
>
> Arch:       amd64-64-little
> 
> RELRO:      Full RELRO
>
> Stack:      Canary found
>
> NX:         NX enabled
>
> PIE:        PIE enabled
>
> SHSTK:      Enabled
>
> IBT:        Enabled
>
> Stripped:   No
>


#### [文章一（largebin attack）](https://iyheart.github.io/2025/06/13/CTFblog/PWN%E7%B3%BB%E5%88%97blog/Linux_pwn/2.%E5%A0%86%E7%B3%BB%E5%88%97/large-bin-attack/)

处于lardebin中的堆快结构

```
struct chunk{
    unsigned long long int prev_size;
    unsigned long long int size;
    struct chunk *fd;
    struct chunk *bk;
    struct chunk *fd_nextsize;
    struct chunk *bk_nextsize;
    user_space
}
```

    chunk的size位越大的chunk，逻辑位置更靠近largebin，chunk的size位越小的chunk，更远离largebin
    相同size位的chunk，越迟释放的chunk，越远离largebin，而越早释放的chunk，越靠近largebin的大小

两个堆快之间隔一下防止触发unlink（

被切过的堆快放unsortedbin，没被切的放largebin

啥意思啊啥就放栈上了啊啥啊放栈上咋打啊又是伪造了个啥就把啥往栈上放了啊

这样的来自于源代码的这样一个段，也就是在将处于large_bin大小的堆块，并被释放到unsorted_bin的堆块被放入到large_bin中的更新链表的操作

### 草稿

申请的chunk的size必须大于1039

堆快有下限无上限

没fastbin

free清空了size没有清空指针




