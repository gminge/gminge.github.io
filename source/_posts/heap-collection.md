---
title: heap_collection
date: 2026-03-27 16:32:06
tags: [CTF,PWN]
---

借助ai神力总结一下heap.jpg

因为有点闲不知道干什么

## 一、堆管理器基础

### 1.1 ptmalloc (glibc) 概述

glibc 使用的堆分配器是 ptmalloc (pthread malloc)，基于 Doug Lea 的 dlmalloc 实现。其核心设计思想是在用户空间维护堆内存的复用，减少系统调用 `brk`/`mmap` 的频率。

一大块.jpg

**关键概念：**

- **chunk**：堆管理的最小单元，每一块由 malloc 返回的内存对应一个 chunk。
- **bin**：释放后的 chunk 按大小分类存储到不同的 bin 中，用于后续复用。
- **arena**：每个线程拥有的独立分配区，主线程使用 main_arena。

### 1.2 Chunk 结构

```
   低地址
+--------+--------+   <- prev_size (前一个chunk的大小，仅在前一个chunk为free时有效)
|  prev_size      |
+--------+--------+
|  size    |A|M|P|   <- size 包含 chunk 总大小，低3位为标志位
+--------+--------+       P(PREV_INUSE)=1 表示前一个chunk被使用
|  fd / data      |       M(IS_MMAPPED)=1 表示由mmap分配
|                 |       A(NON_MAIN_ARENA)=1 表示不属于主分配区
|  bk / data      |
|                 |
|  (data...)     |
|                 |
+--------+--------+
   高地址
```

- 用户可用空间从 `fd` 位置开始
- `prev_size` 字段在前一个 chunk 被使用时可以被前一个 chunk 的数据复用（空间优化）

很重要所以被修改了就很危险.jpg

### 1.3 Bin 分类

| Bin 类型 | 数量 | 特点 |
|---------|------|------|
| **tcache** (glibc 2.26+) | 64 条 | 每条单链表，LIFO，每链表最多7个chunk，无安全检查（早期版本） |
| **fastbin** | 10 条 | 单链表，LIFO，chunk大小范围32-128字节（默认），不合并 |
| **smallbin** | 62 条 | 双循环链表，FIFO，chunk大小 < 512字节（32位）/ < 1024字节（64位） |
| **largebin** | 63 条 | 双循环链表，FIFO，每条链覆盖一个范围，链内按大小降序排列 |
| **unsorted bin** | 1 条 | 双循环链表，FIFO，释放后的chunk首先放入这里，起缓存作用 |

---

## 二、常见堆漏洞类型

### 2.1 Heap Overflow（堆溢出）

向堆块写入的数据超过了实际分配的大小，会覆盖到相邻 chunk 的头部或数据区域。

**危害：**
- 覆盖相邻 chunk 的 `size` 字段，改变堆管理器的行为
- 覆盖相邻 chunk 的 `fd`/`bk` 指针，实现任意地址写
- 覆盖相邻 chunk 的数据内容

**利用思路：**
- 修改 chunk size 实现 overlapping chunks
- 结合 unlink 实现任意地址写
- 伪造 chunk 进行 fastbin attack

### 2.2 Use-After-Free (UAF)

在 chunk 被 free 后继续使用该指针，导致访问或修改已被回收的内存。

**危害：**
- 读取释放后的 fd/bk 指针，泄露堆地址或 libc 地址
- 修改释放后的 fd 指针，实现任意地址分配

任意读写

**典型场景：**
- 没有将指针置空（dangling pointer）
- free 后逻辑错误再次操作同一内存

### 2.3 Double Free

对同一 chunk 连续 free 两次。

**危害（绕过检查后）：**
- 在 fastbin 链表中形成循环，实现多次从同一地址分配
- 在 tcache 中可直接 double free（libc 2.26-2.28），配合 key 绕过

有任意读写吗，好像还要进一步写写才能任意读写（回忆）


**绕过思路：**
- 先 free A，再 free B，再 free A
- 利用 tcache key 清空绕过
- 利用 fastbin 的 double free 检测绕过

### 2.4 Off-by-One

写入时溢出一个字节（通常是覆盖下一个 chunk 的 `size` 字段的最低字节或 PREV_INUSE 标志位）。

**危害：**
- **null byte off-by-one**：将下一 chunk 的 PREV_INUSE 位置0，构造向前合并（backward consolidation），实现 overlapping
- 修改 chunk size 的最低字节，改变大小分类

### 2.5 Off-by-Null（经典 null byte poisoning）

利用 `\x00` 字节溢出修改下一个 chunk 的 `size` 字段中 PREV_INUSE 位，使分配器认为前一个 chunk 已被释放，从而触发 unlink 合并。

---

## 三、核心攻击手法

### 3.1 Tcache Attack

**适用版本：glibc 2.26+**

tcache 是线程缓存，早期版本几乎没有安全检查，是最容易利用的目标。

#### Tcache Poisoning（tcache 投毒）

修改 tcache 链表中空闲 chunk 的 `fd` 指针，使 `malloc` 返回任意地址。

```
步骤：
1. free chunk A -> tcache 链表: A
2. UAF 修改 A->fd = target_addr
3. malloc(同大小) -> 返回 A
4. malloc(同大小) -> 返回 target_addr（任意地址分配）
```

#### Tcache House of Spirit

伪造一个 chunk 并将其 free 到 tcache 中，后续分配即可拿到伪造的地址。

#### Tcache Stashing Unlink Attack

利用 smallbin 向 tcache 转移时的逻辑缺陷（calloc 触发），在不释放原有 smallbin 链接的情况下修改 bk 指针，实现任意地址写一个 libc 地址。

**前置条件：**
- 能控制 smallbin 中 chunk 的 bk 指针
- 调用 calloc（不经过 tcache 分配）触发 stashing 过程

#### Tcache Key 绕过

glibc 2.29 引入 tcache key（`tcache->key`），用于 double free 检测。

绕过方式：
- UAF 将 key 字段清零后再 free
- 利用其他漏洞直接修改 key

### 3.2 Fastbin Attack

#### Fastbin Double Free

绕过 `malloc_consolidate` 和 double free 检查：
```
解法1：free(A) -> free(B) -> free(A)
解法2：利用 malloc_consolidate 清除 fastbin 标志位后重新 free
```

#### Fastbin Reverse into Tcache (glibc 2.26+)

申请 fastbin 大小范围的内存时，若 fastbin 中有空闲 chunk，会先将 fastbin 中剩余 chunk 转移到 tcache 中。结合堆溢出/UAF 修改 fastbin 中 chunk 的 fd 指针，可间接污染 tcache。

#### House of Spirit (Fastbin 版)

伪造一个满足 fastbin 大小范围的 chunk，释放到 fastbin 中，再申请即可拿到目标地址。

### 3.3 Unsorted Bin Attack

**目标：** 向任意地址写入一个 libc 地址（`main_arena+88/96` 的值，即 unsorted bin 的 bk 值）。

**原理：**
```
unsorted bin 取下操作：
victim = unsorted_bin->fd
victim->bk->fd = unsorted_bin  // <- 利用点

如果能控制 victim->bk 指向 target_addr - 0x10
则 target_addr 处会被写入 unsorted_bin 的地址
```

**利用结果：**
- 常用于修改 `global_max_fast` 为 libc 地址，使所有释放的 chunk 都按 fastbin 处理，实现任意地址分配
- 修改 `_IO_list_all` 等全局指针

**注意：** glibc 2.29 增加了对 unsorted bin 取下时的双向链表完整性检查，需要配合 largebin attack 等技巧绕过。

### 3.4 Largebin Attack

**原理：** 向 largebin 插入 chunk 时，会遍历链表找到合适位置，过程中会对相邻 chunk 的 bk/fd 指针进行写操作。

**glibc < 2.30（经典 largebin attack）：**
```
在 largebin 插入操作中：
fwd->bk->fd = chunk  // 伪造 fwd->bk，可在任意地址+0x10写入chunk地址
```

**glibc ≥ 2.30（largebin attack 新变体）：**
利用 largebin 插入时对 `bk_nextsize` 链表的操作：
```
victim->bk_nextsize = ... // 向目标地址写入 chunk 地址
```

**利用结果：** 常用于修改特定地址的值，例如 `_IO_list_all` 或 `tls_dtor_list`。

**与 unsorted bin attack 的配合（glibc 2.31+）：**
由于 unsorted bin 取下时增加了双向链表检查，需要先通过修改 `_IO_list_all`（largebin attack）来绕过 abort。

### 3.5 Unlink

**适用版本：** glibc 早期版本，现代版本加上了全面的安全检查。

**核心操作（合并时触发）：**
```
prev = P  // 被 unlink 的 chunk
next = P->fd
prev = P->bk

next->bk = prev
prev->fd = next
```

**最终效果：** `*(P->fd + 0x18) = P->bk` 与 `*(P->bk + 0x10) = P->fd`

**现代绕过条件（glibc 2.24+）：**
- 需要有指向 chunk 的指针数组
- `P->fd->bk == P` 且 `P->bk->fd == P`
- 在已知地址的区域伪造 fd/bk 指针
- 通常配合 `global_max_fast` 或其他全局地址使用

### 3.6 Overlapping Chunks

**核心思想：** 通过修改 chunk 的 `size` 字段，使一个 chunk 的合法范围包含另一个 chunk，实现对"已释放但仍然可用"的 chunk 的越界操作。

**实现方式：**
1. **Heap Overflow 修改 size**：覆盖相邻 chunk 的 `size` 字段改为更大的值
2. **Off-by-Null（向前合并）**：
   - 伪造 prev_size = (chunk_A + chunk_B) 的总大小
   - off-by-null 清除 chunk_C 的 PREV_INUSE 标志
   - free chunk_C 触发与"chunk_A+chunk_B"的整体合并
   - 再申请可覆盖 chunk_B 的位置

### 3.7 Chunk Extend / Shrink

#### Chunk Extend

通过溢出修改 chunk size 并释放，使分配器认为该 chunk 更大，再次申请时可以覆盖到后续的 chunk。

#### Chunk Shrink

通过 off-by-one/null 缩小 chunk size，然后通过两次 free 制造重叠。

---

## 四、House of 系列技术

### 4.1 House of Force

利用 top chunk 的 size 改写，控制 `malloc` 返回任意地址。

**条件：** 可修改 top chunk 的 `size` 字段为极大的值（绕过检查）。

**步骤：**
1. 修改 top chunk size = -1（最大 unsigned 值）
2. 计算目标地址与 top chunk 之间的偏移
3. malloc(偏移量) 将 top chunk 移到目标地址
4. malloc(任意) 即可分配到目标地址

**限制：** glibc 2.29 增加了 `mchunk_size <= system_mem` 的检查，基本被修复。

### 4.2 House of Orange

不需要 free 即可利用的技术，完全基于 `malloc` 和 `brk` 失败触发 `sysmalloc` 中的 `_int_free`。

**核心：**
- 修改 top chunk size 使 `sysmalloc` 中 `old_top` 被释放
- 被释放的 `old_top` 进入 unsorted bin
- 配合 FSOP (File Stream Oriented Programming) 拿到 shell

**FSOP 原理：** 修改 `_IO_list_all` 指向伪造的 `_IO_FILE_plus` 结构，触发 `_IO_flush_all_lockp` 调用虚函数表 `vtable` 中的函数。

### 4.3 House of Einherjar

**目标：** 通过 off-by-one/null 强制合并两个 chunk，实现 overlapping。

**步骤：**
1. 在 chunk_A 中伪造一个 chunk，设置好 `prev_size` 和 `size`
2. off-by-one 清除 chunk_B 的 PREV_INUSE 标志
3. 使 chunk_B 的 `prev_size` 指向伪造的 chunk
4. free chunk_B 触发 unlink，合并到伪造 chunk 的位置

### 4.4 House of Lore

利用 smallbin 链表操作，将 smallbin 中的 chunk 错误地分配到一个可控地址。

**原理：** 篡改 smallbin 链表中 chunk 的 bk 指针，使 malloc 返回栈上的地址。

**限制：** glibc 2.27+ 增加了 `victim->bk->fd != victim` 检查，基本被修复。

### 4.5 House of Storm

#### 原理
通过结合 Unsorted Bin Attack 和 Largebin Attack，最终实现在**任意地址分配一个 chunk**。

#### 核心步骤
```
1. 在largebin中布置一个 chunk_L，在其 bk 和 bk_nextsize 处写入 target_addr
2. 在unsorted bin中放入 chunk_X，其 bk 指向 target_addr
3. 申请一个适大小的 chunk 触发遍历：
   - 将 unsorted bin 中的 chunk_X 插入 largebin 中
   - 插入时修改 target_addr 处的 fd 和 bk 指针，写入 main_arena 的地址
4. target_addr 处的 fd/bk 合法后，再次申请即可分配到 target_addr
```

#### 版本
- glibc < 2.30 无检查，直接实现

### 4.6 House of Apple

pwndbg 作者提出的较新技术，针对 glibc 2.35 等高版本的利用链条。

**核心思路：**
- 结合 Unsorted Bin Attack + Largebin Attack 控制 `_IO_list_all` 等指针
- 利用 `_IO_wfile_overflow` 等较新的 IO_FILE 利用路径
- 绕过 vtable 检查（`_IO_validate_vtable`），使用合法但可以被滥用的 vtable 函数

### 4.7 House of Banana

利用 `rtld_global._dl_ns->_ns_loaded` 链表和 `_dl_fini` 中的函数指针调用，实现一个更通用的高版本利用链。

**前置条件：** 能进行任意地址写（通常是 largebin attack 的结果）。

### 4.8 House of Cats

一种综合的利用思路，涉及：
- House of Apple 的 IO_FILE 利用
- TLS (Thread Local Storage) 上的指针劫持
- 在高版本 glibc (2.35+) 下仍可用

### 4.9 House of Mind

利用 fastbin 分配时对 `NON_MAIN_ARENA` 标志的处理，结合伪造的 `arena` 结构，通过 `arena->fastbinY[]` 实现任意地址分配。

**条件：**
- 可触发 chunk 的 NON_MAIN_ARENA 位置位
- 可伪造内存中的 arena 结构

---

## 五、IO_FILE 利用

### 5.1 FSOP (File Stream Oriented Programming)

**核心：** 利用 `_IO_flush_all_lockp` 在程序 exit 或从 main 返回时刷新所有 FILE 流时触发虚函数调用。

**关键结构：**
- `_IO_list_all`：全局 FILE 链表头，指向所有打开的 FILE 结构体
- `_IO_FILE_plus.vtable`：虚函数表指针
- `_IO_overflow`、`_IO_xsputn` 等：vtable 中的函数指针

**利用链：**
1. 通过 unsorted bin attack 修改 `_IO_list_all` 指向可控区域
2. 伪造一个合法的 `_IO_FILE_plus` 结构体
3. 设置虚函数表中的函数指针（如 `__overflow`）为 `system`
4. 程序 exit / 返回时触发 `_IO_flush_all_lockp` 执行 `system("/bin/sh")`

### 5.2 vtable 绕过（glibc 2.24+）

glibc 2.24 引入了 `IO_validate_vtable` 检查 vtable 是否在合法的 `__libc_IO_vtables` 段内。

**绕过方式：**
- 将 vtable 指针偏移到合法 vtable 段内，使目标函数偏移落在另一个合法函数上
- 利用 `_IO_str_jumps`、`_IO_wstr_jumps` 等"宽字符"虚表
- 使用 `_IO_cookie_jumps` 等包含 `_IO_cookie_read/write/close` 的虚表
- **House of Apple 2/3** 系列正是基于 `_IO_wfile_overflow` 路径绕过 vtable 检查

---

## 六、高版本 glibc 防护机制

### 6.1 各版本新增检查

| 版本 | 新增防护 |
|------|---------|
| glibc 2.23-2.25 | 基本无额外检查 |
| glibc 2.26 | 引入 tcache，但几乎无检查 |
| glibc 2.27 | tcache 加入简单的 double free 检测（仅检查链表头） |
| glibc 2.28 | - |
| glibc 2.29 | tcache 加入 `key` 字段防 double free；unsorted bin 取下增加双向链表完整性检查；`global_max_fast` 修改受限 |
| glibc 2.30 | largebin 经典利用路径被修复 |
| glibc 2.31 | tcache count 检查加剧，放置时检查是否重复 |
| glibc 2.32 | safe-linking (指针异或加密)：tcache fd 与 fastbin fd 存储为 `ptr >> 12 XOR next_ptr` |
| glibc 2.34 | tcache、fastbin 的 fd 指针全部启用 safe-linking；移除传统 HOOK（`__free_hook`、`__malloc_hook` 等） |
| glibc 2.35+ | 继续加固，House of Apple 等新技术应运而生 |

### 6.2 Safe-Linking 绕过

**机制：** `fd = (chunk_addr >> 12) XOR next`

**绕过条件：**
- 需要泄露堆地址（获得 `chunk_addr >> 12` 的值）
- 已知 XOR key 后，仍可构造任意地址的加密后的 fd 值

### 6.3 HOOK 移除后的利用方向

glibc 2.34 移除了 `__free_hook`、`__malloc_hook`、`__realloc_hook` 等传统利用目标。

**新的利用点：**
- `_IO_list_all` → FSOP
- `tls_dtor_list` → 在程序 exit 时执行任意函数
- `_rtld_global._dl_load_lock` / `_dl_fini` → House of Banana
- 栈上的返回地址（ROP）
- `atexit` 链
- `link_map` 结构中的函数指针

---

## 七、TLS / exit 相关利用

### 7.1 tls_dtor_list 利用

**原理：** glibc exit 时会遍历 `tls_dtor_list` 链表，调用每个节点的函数指针。

```
exit()
  -> __call_tls_dtors()
    -> while (tls_dtor_list)
      -> tls_dtor_list->func(tls_dtor_list->obj)
```

如果能通过任意地址写修改 `tls_dtor_list` 指向可控内存区域，即可在程序退出时执行指定的函数。

### 7.2 _dl_fini 利用（House of Banana 核心）

`_dl_fini` 在程序退出时遍历 `rtld_global._dl_ns[0]._ns_loaded` 链表并调用各 link_map 中的函数指针。

若能劫持该链表节点中的函数指针，即可实现代码执行。

---

## 八、堆风水 (Heap Feng Shui)

好像第一次写到堆风水相关的题目的时候ai已经特别发达了
（借助ai进行堆布局就好了
（最开始听说栈风水堆风水的时候ai还没这么发达当时觉得特别恐怖

### 8.1 核心思想

通过一系列精心编排的 `malloc`/`free` 操作，将堆布局调整到有利于利用的状态。

### 8.2 常用技巧

- **padding chunk 隔离**：在目标 chunk 之间插入辅助 chunk，防止合并干扰
- **tcache 填充**：用 7 个 chunk 填满 tcache，使 free 后的 chunk 进入 fastbin/smallbin
- **bin 切换**：利用不同 bin 的特性（FIFO/LIFO），控制分配顺序
- **overlap 制造**：通过 chunk extend / shrink 制造重叠区域
- **堆喷射 (Heap Spray)**：大量分配固定大小的 chunk，提升地址可预测性

---

## 九、泄露技巧



### 9.1 堆地址泄露

- unsorted bin 中 large chunk 的 fd/bk 指向 main_arena 结构体（位于 libc 的 data 段）
- fastbin/tcache 中 chunk 的 fd 为堆地址（safe-linking 开启后是加密值）
- 通过 UAF 读取释放后 chunk 的 fd/bk 字段

### 9.2 Libc 地址泄露

- 将 chunk 放入 unsorted bin（> 0x420 大小，避开 tcache），其 fd/bk 指向 `main_arena+XX`
- 从 largebin 中取下 chunk 时 fd_nextsize/bk_nextsize 可能包含 libc 地址
- 计算 `main_arena` 到 `libc_base` 的偏移
文件开始运行时在栈上残留的函数地址.jpg

### 9.3 栈地址 / PIE基址泄露

- 通过残留数据（未初始化的 malloc 内存）读取栈/代码段残留信息
- 利用 libc 中的 `environ` 变量泄露栈地址

---

## 十、调试与分析工具

| 工具 | 用途 |
|------|------|
| **pwndbg** | GDB 插件，`vis_heap_chunks`、`bins`、`tcache` 等命令 |
| **Pwngdb** | GDB 插件，`parseheap` 解析堆布局 |
| **libc-database** | 在线/离线 libc 识别工具 |
| **patchelf / pwninit** | 更换二进制文件的 libc 和 ld |
| **seccomp-tools** | 分析沙箱规则，配合 ORW 利用 |

---

## 十一、常见利用综合思路

### 11.1 低版本 (glibc < 2.27)

```
UAF / Heap Overflow
  -> tcache poisoning / fastbin attack
    -> 修改 __malloc_hook / __free_hook
      -> one_gadget / system
```

### 11.2 中版本 (glibc 2.27 ~ 2.31)

```
UAF / Heap Overflow / Off-by-null
  -> tcache poisoning（含 safe-linking 绕过）
    -> 修改 __free_hook / __malloc_hook
      -> system
或
  -> Unsorted Bin Attack + Largebin Attack
    -> House of Storm / 修改 _IO_list_all
      -> FSOP
```

### 11.3 高版本 (glibc 2.32 ~ 2.35+)

```
Heap Overflow / UAF
  -> tcache poisoning (需 leak 堆地址绕过 safe-linking)
    -> Largebin Attack 修改 tls_dtor_list / _IO_list_all
      -> House of Apple
      -> House of Banana
      -> FSOP (wfile 路径)
或
  -> 任意地址写
    -> exit_func / tls_dtor_list
      -> 代码执行
```

---

## 十二、常见出题套路

1. **菜单堆题**：经典增删改查，需要逆向分析漏洞点
2. **限制大小**：只能申请特定大小的 chunk，需要结合 extend/shrink
3. **限制次数**：malloc/free 次数有限，需要高效利用
4. **沙箱保护 (seccomp)**：禁用 execve，需要 ORW (open-read-write) 读 flag
5. **无 show 功能**：盲打利用（Blind PWN），通过 IO_FILE 或 stdout 操作实现输出
6. **自定义 allocator**：在原有堆实现上修改规则，需分析定制逻辑

好像很多菜单堆
基本上都是吧
其他感觉都是这个基础上改