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
> 题型：qemu逃逸（真的吗我怎么感觉不像啊这啥啊不像啊）（感觉像一个很普通的堆题，甚至是2.23版本）（是unlink吗毕竟题目都叫unlink了）


### 文章阅读及笔记
#### [文章一（来自题干）](https://arttnba3.cn/2022/08/30/HARDWARE-0X00-PCI_DEVICE/)

PCI 标准中的三个基本组件：

    PCI 设备（device）：符合 PCI 总线标准的设备都可以称之为 PCI 设备，在一个 PCI 总线上可以包含多个 PCI 设备
    PCI 总线（bus）：用以连接多个 PCI 设备与多个 PCI 桥的通信干道
    PCI 桥（bridge）：总线之间的连接枢纽，主要有以下三种：
        HOST/PCI 桥：也称为 PCI 主桥或者 PCI 总线控制器，用以连接 CPU 与 PCI 根总线，隔离设备地址空间与存储器地址空间，现代 PC 通常还会在其中集成内存控制器，称之为北桥芯片组（North Bridge Chipset）
        PCI/ISA 桥：用于连接旧的 ISA 总线，通常还会集成中断控制器（如 i8359A），称之为南桥芯片组（South Bridge Chipset）
        PCI-to-PCI 桥：用于连接 PCI 主总线（Primary Bus）与次总线（Secondary Bus）

*好复杂*

<img width="881" height="580" alt="图片" src="https://github.com/user-attachments/assets/96375467-8596-4088-ac90-74a215fa6f6d" />

*看不懂。就连这个图片是怎么被我复制过来的。都没看懂。*




#### [文章二（qwmu逃逸入门）](https://ctf-wiki.org/pwn/virtualization/qemu/exploitation/intro/)

题目本身通常以一个 QEMU 模拟设备的形式进行呈现

#### [文章三（unlink）](https://ctf-wiki.org/pwn/linux/user-mode/heap/ptmalloc2/unlink/)

eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee

我看不懂（垂头丧气）

但是这个作者的文章看起来还满齐全的

**利用思路 ¶**

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

### 草稿

好烦啊为啥签到题的ida那么丑，看到这道题的ida之后觉得签到题的ida愈发丑陋了

发现了malloc_hook，这个题是2.23,malloc_hook和free_hook还没有删

清空了大小但是没有清空指针

啥叫伪造一个prev chunk啊

有点完蛋

**free() 会对“被 free 的 chunk 自己”做 unlink**

啥意思

我受不了这个弱智ai了，每次翻译ida都把我往沟里带

**fastbin<=0x80**

