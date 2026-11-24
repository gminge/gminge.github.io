---
title: b01lersctf
date: 2026-04-28 23:36:58
tags: [CTF,PWN]
categories: [CTF,b01lersctf]
---

上周末写的，本来打算上周整理wp,但是这周一考机械制图，可恶，讨厌考试。

哦不对是不是应该叫上上周末，时间。。时间过的好快。。时间都去哪了.mp3

这个比赛蛮好，还有情绪价值提供哦

交完flag有小动画。。

好好笑，，

# transmutation

> Self-Modifying Code

好像是可以改汇编（回忆）

```c
mprotect((void *)((unsigned __int64)chall & 0xFFFFFFFFFFFFF000LL), 0x1000u, 7);
chall();
```

这个就是改了chall的权限然后进chall函数

```c
signed __int64 chall()
{
  signed __int64 result; // rax
  unsigned __int8 v1; // [rsp+Eh] [rbp-2h]
  unsigned __int8 v2; // [rsp+Fh] [rbp-1h]

  v2 = getchar();
  v1 = getchar();
  result = (char *)main - (char *)chall;
  if ( v1 < (char *)main - (char *)chall )
  {
    result = v2;
    *((_BYTE *)chall + v1) = v2;
  }
  return result;
}
```

然后这个chall函数直接进行一个改
