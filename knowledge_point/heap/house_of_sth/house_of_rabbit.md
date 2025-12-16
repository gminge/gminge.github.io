## 知识点

## 文章阅读及笔记

[文章一](https://www.52pojie.cn/thread-1559890-1-1.html)

这种利用方式产生于2017年

**本质的原理是可以通过修改fastbin的size或是fd**

**触发malloc_consolidate**

使得fastbin被link到其他的bins中

*house_of_froce*

目的似乎是申请一个很大的空间，溢出，申请一圈后申请到最顶上的chunk的位置

然后就能修改该chunk的fd和bk

然后就能拿到一个任意地址写（？）

以上好像不是rabbit是froce,理解错了

*fastbin dup是什么。*

*怎么突然出现专业术语。*

*你们pwn手起些名字怪抽象的*

### malloc_consolidate函数

函数感动吗，我给你建了一个小标题，感动吗函数？
