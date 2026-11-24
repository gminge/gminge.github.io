---
title: Lake_ctf
date: 2026-07-17 17:24:03
tags:
---

翻看有哪些题写了保存了文件但是没写wp翻到的

## qiandao

呃我也忘了这道题的原名叫什么了

反正我给这道题的文件夹的命名是签到

# qiandao - stackception VM Challenge

## 题目概述

`stackception-1` 是一个**基于栈的自定义虚拟机 (VM) 逆向/PWN 挑战**。题目实现了简单的字节码解释器，并提供一个汇编器 `stackception-asm` 将汇编代码编译为字节码。

---

## 文件结构

| 文件 | 说明 |
|------|------|
| `stackception-1` | **VM 解释器**（x86-64 ELF），执行 `.bin` 字节码文件 |
| `stackception-asm` | **汇编器**，将 `.asm` 汇编代码编译为 `.bin` 字节码 |
| `chall.py` | 题目交互脚本（启动 challenge） |
| `1.asm` / `1.py` / `1.bin` | 示例 challenge 1：栈运算（push + add + write） |
| `2.asm` / `2.py` / `2.bin` | 示例 challenge 2：read + push + write |
| `ld-linux-x86-64.so.2` | 动态链接器（可能是特定版本） |
| `libc.so.6` | 题目提供的 libc（其中包含 flag） |
| `stackception-1.i64` | IDA/Ghidra 数据库文件 |
| `stackception-asm.i64` | 汇编器的 IDA/Ghidra 数据库文件 |

---

## 安全防护 (Mitigations)

```
Arch:     amd64-64-little
RELRO:    Partial RELRO
Stack:    Canary found
NX:       NX enabled
PIE:      PIE enabled
```

- **PIE**: 地址随机化
- **NX**: 栈不可执行
- **Stack Canary**: 栈溢出保护
- **Partial RELRO**: GOT 表部分可写

---

## VM 架构详解

### 内存布局

VM 在栈帧上分配三个核心区域：

```
高地址
┌──────────────────────┐
│   return address     │  rbp + 8
├──────────────────────┤
│   saved rbp          │  rbp
├──────────────────────┤
│   stack canary       │  rbp - 0x30
├──────────────────────┤
│   字节码缓冲区        │  rbp - 0x2030  (8192 bytes = 1024 条指令)
│   (bytecode)         │
├──────────────────────┤
│   数据栈             │  rbp - 0x2830  (2048 bytes = 512 个元素)
│   (data stack)       │
├──────────────────────┤
│   调用栈             │  rbp - 0x3030  (2048 bytes = 512 个元素)
│   (call stack)       │
└──────────────────────┘
低地址
```

- **字节码缓冲区**: 从文件读入，最多 8192 字节（1024 条指令），每条指令 8 字节
- **PC (r14d)**: 程序计数器，索引字节码中的指令，取值范围 `[0, 1023]`
- **数据栈 (r13d)**: 通用操作数栈，512 个 32-bit 元素，向**高地址**增长
- **调用栈 (r12d)**: 保存调用返回地址，512 个 32-bit 元素

### 指令格式

每条指令固定 **8 字节**：

| 偏移 | 大小 | 含义 |
|------|------|------|
| 0 - 3 | 4 bytes (int32) | **操作码 (opcode)** |
| 4 - 7 | 4 bytes (int32) | **立即数 (immediate)** |

### 指令集 (Opcode Table)

| Opcode | 助记符 | 描述 |
|--------|--------|------|
| `0` | `ADD` | 弹出栈顶两个值，相加后压回栈顶 |
| `1` | `MUL` | 弹出栈顶两个值，相乘后压回栈顶 |
| `2` | `PUSH imm` | 将立即数 `imm` 压入数据栈 |
| `3` | `POP` | 弹出数据栈栈顶（丢弃） |
| `4` | `DUP` | 复制数据栈栈顶元素 |
| `5` | `JMP_INDIRECT` | 弹出数据栈值作为地址跳转（间接跳转） |
| `6` | `CALL` | 弹出目标地址，压入当前 PC 到调用栈，跳转 |
| `7` | `RET` | 从调用栈弹出地址，恢复 PC |
| `8` | `READ` | 从 stdin 读取 4 字节整数，压入数据栈 |
| `9` | `WRITE` | 弹出数据栈栈顶值，以 4 字节整数写入 stdout |
| `10` | `EXIT` | 退出程序 |
| `11` | `FLAG` | 读取并打印 `/app/flag.txt` |

### 汇编器支持的助记符

汇编器识别以下助记符（与 VM opcode 的映射）：
- `push <val>` — 压入立即数
- `read` — 从 stdin 读取
- `write` — 写入 stdout
- `call` — 调用
- `exit` — 退出

### 执行流程

1. 从命令行参数获取 `.bin` 文件路径
2. 初始化 stdin/stdout/stderr（关闭缓冲）
3. 将字节码文件读入字节码缓冲区（最多 8192 字节）
4. 进入主循环：取指 → 解码(opcode 0~11) → 跳转执行 → 递增 PC → 继续
5. PC 超出范围 (≥1024) 时报错退出

---

## 漏洞分析

### 漏洞 1: PUSH 无栈溢出检查

**`PUSH` 指令（opcode 2）不会检查数据栈是否已满**，而 `DUP`（opcode 4）会检查。

数据栈从 `rbp - 0x2830` 向高地址增长，每 push 一次写入 4 字节。栈空间仅 2048 字节（512 个元素），但 `PUSH` 可以无限次执行：

- Push 512 次 → 到达字节码缓冲区起点（`rbp - 0x2030`）
- Push 1024 次 (2560) → 覆盖字节码缓冲区全部
- Push 更多次 → 覆盖 stack canary、saved rbp、return address

```
数据栈溢出路径：
  rbp-0x2830 ──────> rbp-0x2030 ──────> rbp-0x30 ──> rbp ──> rbp+8
  (数据栈)            (字节码)            (canary)     (rbp)   (ret addr)
  0~511 pushes       512~2559 pushes    2560~2567    2568    2570~2571
```

### 漏洞 2: 字节码自修改能力

由于数据栈紧邻字节码缓冲区（低地址侧），且在字节码执行过程中可以通过 PUSH 覆盖字节码区域，这提供了**自修改代码 (self-modifying code)** 的能力。

### 漏洞 3: FLAG 指令直接读取 flag

Opcode 11 会直接打开 `/app/flag.txt` 并打印内容，无需任何地址泄漏或 ROP 链。

---

## 利用思路

### 方案 A: 直接执行 FLAG 指令

如果字节码可以包含 opcode 11，直接执行即可打印 flag：

```asm
push 0    ; opcode 11 的编码 = 11 << 32 | 0
; 但汇编器不支持 FLAG 助记符，需要手动构造字节码
```

解法：手动写入包含 opcode 11 的字节码文件，或通过 PUSH 溢出覆盖字节码区域写入 opcode 11。

### 方案 B: 数据栈溢出 + ROP

1. 利用 PUSH 无限溢出的漏洞，用精心构造的值覆盖 canary、saved rbp 和 return address
2. 需要先泄漏 canary（可能通过 READ/WRITE 结合栈越界读取）
3. 覆盖 return address 为 one_gadget 或 system("/bin/sh") ROP 链

### 方案 C: 栈溢出 + 覆盖字节码执行 FLAG

1. Push 足够多次溢出到字节码区域
2. 覆盖字节码为 opcode 11 (FLAG)
3. 利用 JMP_INDIRECT 或 CALL 跳转到被修改的字节码位置

---

# snalloc - Custom Slab Allocator Heap Challenge

## 题目概述

`snalloc` 是一个**自定义 Slab 分配器堆漏洞挑战**。题目实现了一个基于页对齐的 slab 内存分配器（~217 行 C 代码），并与标准 `malloc` 同时提供给用户操作，参与者需要利用自定义分配器中的漏洞获取 flag。

---

## 文件结构

| 文件 | 说明 |
|------|------|
| `chal` | **挑战二进制文件**（menu-based heap pwn） |
| `chal.c` | 挑战交互逻辑（alloc / edit / free 菜单） |
| `snalloc.c` | 自定义 slab 分配器实现 |
| `snalloc.h` | 分配器头文件（结构体、宏定义） |
| `libc.so.6` | 题目提供的 libc（替换系统 libc） |
| `flag.txt` | Flag 文件 |
| `Dockerfile` | 容器化部署配置（Arch Linux + pwn.red/jail） |
| `compose.yaml` | Docker Compose 配置 |
| `Makefile` | 编译脚本 |

---

## 安全防护 (Mitigations)

```
Arch:     amd64-64-little
RELRO:    Full RELRO        ← GOT 表只读
Stack:    No canary found   ← 无栈溢出保护
NX:       NX enabled        ← 栈不可执行
PIE:      PIE enabled       ← 地址随机化
```

- **Full RELRO**: GOT 表不可写，无法通过 GOT overwrite 劫持控制流
- **No Stack Canary**: 栈溢出可直接覆盖返回地址
- **PIE + NX**: 需要地址泄漏才能 ROP

---

## 自定义分配器架构 (snalloc)

### 设计概览

snalloc 是一个基于 **Slab（Slab Allocation）** 思想的自定义堆分配器：

- 内存以 **snabs**（slabs）为单位进行管理
- 每个 snab 是一个页对齐的内存块，大小由 **order**（0~3）决定
- 一个 snab 包含 **64 个固定大小的 chunk**（`SNAB_CHUNKS = 64`）
- 空闲 chunk 通过 **64-bit bitmap** 追踪

### Order 与 Slab 大小

| Order | Slab 总大小 | 元数据页 | 数据区 | Chunk 大小 | 适用请求范围 |
|-------|------------|---------|--------|-----------|-------------|
| 0 | 0x2000 (8KB) | 0x1000 | 0x1000 | **64 bytes** | 1 ~ 64 |
| 1 | 0x3000 (12KB) | 0x1000 | 0x2000 | **128 bytes** | 65 ~ 128 |
| 2 | 0x4000 (16KB) | 0x1000 | 0x3000 | **192 bytes** | 129 ~ 192 |
| 3 | 0x5000 (20KB) | 0x1000 | 0x4000 | **256 bytes** | 193 ~ 256 |

> **计算公式**:
> - `ORDER_2_SNAB_SZ(order)` = (order + 2) × 0x1000
> - `ORDER_2_CHUNK_SZ(order)` = (ORDER_2_SNAB_SZ(order) - 0x1000) / 64
> - `CHUNK_SZ_2_ORDER(size)` = (size × 64 - 1) / 0x1000

### Snab 元数据结构

```c
typedef struct snab_t {
    magic_t magic;           // offset 0x00: 魔数 (页号 >> 12)
    uint64_t flags;          // offset 0x08: SNAB_AUTO / SNAB_EXTEND
    order_t order;           // offset 0x10: slab order (0~3)
    bitmap_t bitmap;         // offset 0x18: 64-bit 空闲位图
    struct snab_t *prev;     // offset 0x20: 双向链表前驱
    struct snab_t *next;     // offset 0x28: 双向链表后继
} snab_t;  // sizeof = 48 bytes (0x30)
```

- 元数据存放在每个 slab 的**第一页开头**
- **Magic** 验证: `magic == (snab地址 >> 12)`，即 magic 等于页号

### Snab 链表管理

- 每个 order 维护一个 snab 链表（全局数组 `snabs[4]`）
- 首次分配某 order 时创建根 snab（`SNAB_EXTEND` 标志，无 `SNAB_AUTO`）
- 当某 order 的所有 snab 都满时，通过 `snab_alloc` 扩展新 snab（带 `SNAB_AUTO` 标志）
- 最多 16 个 snabs（`MAX_SNABS = 0x10`）

### 分配流程 (`snalloc`)

```
snalloc(size)
  ├─ order = CHUNK_SZ_2_ORDER(size)    // 计算所需最小 order
  └─ while order ≤ 3:
       ├─ snab = get_snab_from_order(order)
       ├─ chunk = snab_free_chunk_get(snab)  // bitmap 中找空闲位
       └─ if chunk: return chunk
          else: order++
```

如果低 order 满，会自动**向上提升 order**（返回更大的 chunk，但 `alloc->size` 仍为请求值）。

### 释放流程 (`snfree`)

```
snfree(chunk)
  ├─ snab = get_snab_from_chunk(chunk)  // 页回退查找 snab 元数据
  ├─ 验证 magic、双向链表完整性、chunk 索引合法性
  ├─ 检查 bitmap 防止 double-free
  ├─ 清除 bitmap 对应位
  └─ if bitmap == 0 && SNAB_AUTO:
       ├─ 从链表中 unlink 该 snab
       ├─ memset(snab, 0, 48)
       └─ free(snab)                    // 归还给 glibc
```

> **注意**: 只有带 `SNAB_AUTO` 标志的扩展 snab 才会在完全空闲时自动释放。根 snab 不会自动释放。

---

## 挑战交互逻辑

### 菜单选项

```
1 - alloc    (分配内存)
2 - edit     (编辑内存)
3 - free     (释放内存)
```

- 每次操作需选择分配器：**1 = malloc** / **2 = snalloc**
- 每个分配器有独立槽位（索引 0 ~ 0xFFF，最多 4096 个）
- 分配大小限制：≤ 256 bytes（`MAX_ALLOC_SIZE`）
- Free 后将清空指针和 size（防止 UAF）

### 交互流程示例

```
cmd> 1           # 选择 alloc
allocator> 2     # 使用 snalloc
idx> 0           # 槽位 0
size> 128        # 分配 128 字节

cmd> 2           # 选择 edit
allocator> 2
idx> 0
content> AAAA    # 写入数据

cmd> 3           # 选择 free
allocator> 2
idx> 0           # 释放槽位 0
```

---

## 漏洞分析

### 漏洞 1: 跨分配器类型混淆 (Cross-Allocator Type Confusion)

**核心问题**: 每次操作可以独立选择分配器，但分配器的槽位数组是分离的（`mallocs[4096]` 和 `snallocs[4096]`）。这本身没有问题，但是：

- `get_snab_from_chunk` 通过**页回退匹配 magic** 来定位 snab，不对指针来源做任何验证
- 如果向 `snfree()` 传入一个 **malloc 分配的指针**，它会盲目地在指针所在页附近搜索 magic 匹配
- 如果恰好在某页开头 8 字节的值等于该页的页号 → 伪造 snab 通过验证

### 漏洞 2: 经典的 Unlink 操作

在 `_snfree` 中，当 snab 完全空闲且带 `SNAB_AUTO` 标志时：

```c
if (next) {
    next->prev = prev;    // *(next + 0x20) = prev
}
if (prev) {
    prev->next = next;    // *(prev + 0x28) = next
}
```

这是一个**经典的 unsafe unlink** 操作。如果攻击者能伪造 snab 的 `prev` 和 `next` 指针，就可以实现**任意地址写**：

- `*(fake_next + 0x20) = fake_prev`
- `*(fake_prev + 0x28) = fake_next`

### 漏洞 3: Magic 可预测

`SNAB_MAGIC(snab) = (uint64_t)snab >> 12`（即页号）。magic 值完全是地址派生的，没有随机性：

- 如果知道某页的地址，就能计算出合法的 magic 值
- 如果能在页对齐地址处写入 magic 值，就能构造假 snab

### 漏洞 4: 无 Stack Canary

二进制**没有栈溢出保护**，一旦泄漏了栈地址，即可直接覆盖返回地址进行 ROP。

---

## 利用思路

### 方案 A: 伪造 Snab + Unlink 任意写

1. **地址泄漏**: 通过 snalloc 与 malloc 之间的堆布局关系泄漏 libc / 堆地址
2. **伪造 snab 元数据**: 在某个页对齐位置构造假 snab（设置 magic、order=0、bitmap=1、prev/next 为目标地址）
3. **触发 unlink**: 调用 `snfree(fake_chunk_ptr)` → 识别假 snab → bitmap 清零 → 触发 auto-free → unlink 写
4. **目标写入**:
   - 由于 Full RELRO，不能写 GOT
   - 可写 `__free_hook`（glibc < 2.34）/ `_IO_list_all` / 栈返回地址
   - 或通过任意写修改 snab 的 order 字段扩大越界读写范围

### 方案 B: 堆布局操纵 + Order 升级导致的信息泄漏

1. 先填充低 order 的 snab
2. 触发 order 升级（请求小 size 但获得大 chunk）
3. 利用 edit 在 chunk 中写入特定 pattern
4. 通过某种方式（如 write 原语或 side-channel）泄漏相邻 chunk 数据

### 方案 C: 栈溢出（如果有办法泄漏栈地址）

- 二进制无 canary 保护
- 如果有栈地址泄漏（通过 libc environ 或其他方式），可直接 ROP

---