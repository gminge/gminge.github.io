---
title: stack_collection
date: 2026-03-27 00:50:33
tags: [CTF,PWN,STACK]
categories: [CTF,知识点,stack]
---

由于马上是星盟的招新赛最近写的题都是一些不会的知识点

有点担心把前面的知识点忘记了导致连签到题都写不出来

所以紧急对写过的栈题进行一个复盘，，

从哪里开始，，从?CTF开始吧（（

真好啊，那时候同龄人还都是弱智，，

现在只剩我是弱智了。。

# ?CTF

## week1

就是一些ret2backdoor和一些调试教学关

有一个多个进程同时访问 同一份共享数据时执行结果取决于运行时的时序

## week2

是一个小rop一个syscall教学关一个canary教学关一个pie教学关

## week3

是一个fmt教学关（感觉fmt还真有些知识点不小心忘记了。。

一个canary爆破教学关（其实我还是不是很会爆破）（汗）

还有一个没有成功考到的知识点pkey（？）

### fmt

格式化字符串的标准格式：

%[parameter][flags][field width][.precision][length]type

而d,s,x,p,n就是其中的type(类型)

由于一些原因只有一次fmt时需要用很多%%%%%而不能%（数字）

来向对应的地址写东西

### pkey

[内存保护密钥 &#8212; The Linux Kernel documentation](https://docs.kernel.org/translations/zh_CN/core-api/protection-keys.html)

### 爆破

这个之前学长有发过一个爆破题的板子（但是由于没看很懂也没怎么写爆破题所以一直没用上

```python
from multiprocessing import Event, Process, Lock, Value

def worker(stop_event, lock, counter):
    while not stop_event.is_set():
        try:
            counter.value += 1
            pwn(stop_event)
            context.log_level = 'debug'
            log.info(f"Success! Tried {counter.value} times.")
            with lock:
                p.interactive()
            p.close()
            continue
        except:
            p.close()
            pass

def brute_multi(process_num):
    context.log_level = 'error'
    stop_event, lock, counter= Event(), Lock(), Value("i", 0)
    jobs = []
    for _ in range(process_num):
        process = Process(target=worker, args=(stop_event, lock, counter))
        jobs.append(process)
        process.start()
    try:
        while not stop_event.is_set():
            time.sleep(0.5)   
        for process in jobs:
            process.join()
    except KeyboardInterrupt:
        stop_event.set()
        for process in jobs:
            process.terminate()

# 把pwn改成def pwn(stop_event = Event()):
# 认为当前已经成功拿到shell的时候stop_event.set()
# Make Multi-process Great Again
```

## week4

 有一个栈迁移的教学关（？）

我记得我这道题不是用的栈迁移啊，奇怪了

哦哦也算栈迁移吧

一个进阶fmt（貌似看到有篇文章说可以用house of apple2（？）可能我没太搞懂吧

[?CTF pwn WriteUp | Erik_Aoi](https://meinakomneni.github.io/2025/11/01/QuestionCTF-pwn-WriteUp/#:~:text=short%20or%20out)

哦哦

其实cpcp那道题我已经忘记题干了

哦哦就是想办法栈溢出本质还是栈溢出

然后有一个shellcode

剩下的就不是stack了

shellcode我记得有个网站有个什么合集好像

### shellcode

[常见特殊shellcode（更新中） | 张清越](https://zqy.ink/2022/11/27/shellcodes/)

[仅用三种字符实现 x86_64 架构的任意 shellcode-安全KER - 安全资讯平台](https://www.anquanke.com/post/id/256530)

# 然后是月赛

stack相关就是很基础的fmt和rop之类

还有shellcode

唉唉

# isctf

这个好像也就是一个fmt一个rop

唉

确实栈好像考来考去就是那些东西，，，

哎感觉有点完蛋再看点堆吧
