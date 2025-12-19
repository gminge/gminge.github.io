## tata

就是虚表被覆盖之后

调用那个位置的虚函数

就可以调用到覆盖上去的东西

的意思

吧

## 人类文章

[文章一](https://blog.csdn.net/weixin_59166557/article/details/143377069)



## gpt

### 一、虚表是什么（正常语义）

在 C++ 里，如果一个类有 虚函数：
```
class A {
public:
    virtual void foo();
    virtual void bar();
};
```

编译器会做一件事：

给这个类生成一张 虚函数表（vtable）

表里按顺序存放：
```
&A::foo
&A::bar
```

每个 对象实例 的开头，都会有一个指针：
```
vptr -> vtable
```

当你调用：
```
A *a = new A();
a->foo();
```

本质执行流程是：
```
vtable = [a]        ; 读对象头部的 vptr
func   = vtable[0] ; 第 0 个虚函数
call func
```

### 二、内存布局（pwn 最关心的）

在 64 位 Linux / gcc 下，典型对象长这样：
```
堆上对象 A：
+0x00  vptr  ------------------> vtable
+0x08  成员变量1
+0x10  成员变量2
```

而 vtable 在 只读段（正常情况）：
```
vtable:
+0x00  &A::foo
+0x08  &A::bar
```

💡 重点：

vptr 本身是一个“函数指针数组的指针”

### 三、为什么虚表在堆攻击中这么重要
1️⃣ 本质 = 函数指针控制

在 pwn 眼里：

***虚表调用 ≈ 间接 call [可控地址]***

如果你能做到 以下任意一件事：

覆盖对象的 vptr

伪造一张 vtable

控制 vtable 里的函数指针

那么一旦程序调用虚函数：
```
obj->foo();
```

你就能：
```
call system
call one_gadget
call ROP gadget
```
2️⃣ 为什么“堆”漏洞能打虚表

因为：

C++ 对象通常是 new 出来的（在堆上）

vptr 在 对象起始位置

堆漏洞非常容易：

溢出

UAF

Double Free

Off-by-one

常见场景
✅ 堆溢出覆盖 vptr
```
chunk A（用户可控数据）
chunk B（C++ 对象）
```

溢出后：

```
chunk B:
vptr = fake_vtable
```

✅ UAF 修改 vptr
```
delete obj;
malloc(...); // 复用 obj 的 chunk
```

你重新申请的 chunk 覆盖了：
```
vptr -> fake_vtable
```
3️⃣ 典型虚表攻击流程（CTF 常见）

堆漏洞（UAF / overflow）

覆盖对象的 vptr

在堆 / libc / mmap 区伪造 vtable

`vtable[0] = system`

控制参数（this 指针 / rdi）

触发虚函数调用

`system("/bin/sh")`
