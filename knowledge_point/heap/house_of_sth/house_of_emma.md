> 相关glibc版本：2.34+
> 
> 前提条件：
> 1.可以任意写一个可控地址（LargeBin Attack、Tcache Stashing Unlink Attack...）
> 2.可以触发 IO 流（FSOP、[House OF Kiwi](https://gminge.github.io/knowledge_point/heap/house_of_sth/house_of_kiwi)）
> 

# 文章阅读及笔记

## [文章一](https://bbs.kanxue.com/thread-270429-1.htm)

在某处写一个可控地址直接 Getshell（借助于 IO_FILE）*怎么还有io的事。好烦啊这些名字起的稀奇古怪就是很恐怖*

存在一个[_IO_cookie_jumps](https://gminge.github.io/yuan_ma_yue_du/glibc2.34)

<span style="color:red"文字 </span>

[vtable](https://gminge.github.io/knowledge_point/heap/vtable)的检测中对具体位置的检测还是比较宽松的，这使得我们可以在一定的范围内对 vtable 表的起始位置进行偏移

这里以 2021 湖湘杯的 1 解题 House_OF_Emma 为例，这里的核心是使用 LargeBin Attack 来进行写入地址

*其实我一直没有搞懂[没有清空指针](https://gminge.github.io/knowledge_point/heap/dangling_pointer)是什么意思，老是说什么没有清空指针可以改写什么的，感觉完全处于一个一知半解的状态（其实0知0解）*

*完了明天就是月赛了我会不会死啊，那些知识点我一个都没有学完，我会不会死在月赛里啊*

在 TLS 上的地址可能需要一些爆破来得到远程偏移 [爆破的思路可以参考](https://blog.wjhwjhn.com/posts/%E9%80%9A%E8%BF%87libc%E5%9F%BA%E5%9D%80%E6%9D%A5%E7%88%86%E7%A0%B4tls/)

*tls上的地址又是什么意思。我怎么什么都不会*

*搭一个docker,怎么还要搭docker*

*我现在还没有成功搭过docker,一直没试。都怪期末考（其实也没有好好复习期末考）*

### 登录才发现刚刚看的文章不全。好吧再看一遍




