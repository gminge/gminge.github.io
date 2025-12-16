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
