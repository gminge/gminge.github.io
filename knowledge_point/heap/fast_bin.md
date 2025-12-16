为啥我的博客这么丑啊。。
算了丑就丑吧

## 知识点总结

0x20-0x80的free掉的单链表组

malloc的时候依次取出

free掉不合并

一个fd指一个chunk

如果可以修改fd，那就可以把被修改掉fd的chunk申请出来后

把修改的fd申请出来

就能拿到一个任意写

可以写__free_hook（2.23前）啥的


## 文章阅读及笔记

[文章一](https://bailan2.github.io/2023/06/27/Pwn-%E5%A0%86%E5%9F%BA%E7%A1%80-FastBin-Attack/)

fastbin采用LIFO的单链表方式管理空闲chunk

free释放堆块后，会将堆块链入到main_arena对应大小的bin中，可以用dq &main_arena 20查看main_arean中存放的各个bin的头结点。从上到下分别对应main_arean布局中的不同大小的chunk块。

*没看懂啊这句话*gpt加油一下（喂）

main_arena 是 glibc 用来管理堆的“总管结构体”

在 glibc 2.23 里：

所有 bin（fastbin / unsorted / small / large）

都存在 main_arena 这个结构体里

哦哦这下看懂了
