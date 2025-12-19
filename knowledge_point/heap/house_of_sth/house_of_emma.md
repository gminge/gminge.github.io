> 相关glibc版本：2.34+
> 
> 前提条件：
> 1.可以任意写一个可控地址（LargeBin Attack、Tcache Stashing Unlink Attack...）
> 2.可以触发 IO 流（FSOP、[House OF Kiwi](https://gminge.github.io/knowledge_point/heap/house_of_sth/house_of_kiwi)）
> 

# 文章阅读及笔记

[文章一](https://bbs.kanxue.com/thread-270429-1.htm)

在某处写一个可控地址直接 Getshell（借助于 IO_FILE）*怎么还有io的事。好烦啊这些名字起的稀奇古怪就是很恐怖*

存在一个[_IO_cookie_jumps]()

vtable 的检测中对具体位置的检测还是比较宽松的，这使得我们可以在一定的范围内对 vtable 表的起始位置进行偏移

[vtable](https://gminge.github.io/knowledge_point/heap/vtable)


