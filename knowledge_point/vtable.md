

## 人类文章

## gpt
一、虚表是什么（正常语义）

在 C++ 里，如果一个类有 虚函数：

class A {
public:
    virtual void foo();
    virtual void bar();
};


编译器会做一件事：

给这个类生成一张 虚函数表（vtable）

表里按顺序存放：

&A::foo
&A::bar


每个 对象实例 的开头，都会有一个指针：

vptr -> vtable


当你调用：

A *a = new A();
a->foo();


本质执行流程是：

vtable = [a]        ; 读对象头部的 vptr
func   = vtable[0] ; 第 0 个虚函数
call func
