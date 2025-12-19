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

<span style="color:red">vtable 的检测中对具体位置的检测还是比较宽松的，这使得我们可以在一定的范围内对 vtable 表的起始位置进行偏移</span>

[vtable](https://gminge.github.io/knowledge_point/heap/vtable)

这几个函数内存在任意函数指针调用

且函数指针来源于_IO_cookie_file 结构体

这个结构体是 _IO_FILE_plus 的扩展

如果我们可以控制 IO 的内容

大概率这部分的数据也是可控的

并且其的第一个参数也是来源于这个结构

所以我们可以把其当做一个类似于 __free_hook 的 Hook 来利用。

在上面代码中函数指针调用前所执行的 PTR_DEMANGLE （指针保护）选项是默认开启的

这意味着我们需要解决指针加密的问题

通过调试可以得知，这个值存在于 TLS 段上，将其 ROR 移位 0x11 后再与指针进行异或

*是一个指针check吗*

*篡改异或是啥意思*

*是控地址的意思吗*

*感觉没有很懂不管了接着看吧*

这里以 2021 湖湘杯的 1 解题 House_OF_Emma 为例，这里的核心是使用 LargeBin Attack 来进行写入地址

*其实我一直没有搞懂[没有清空指针](https://gminge.github.io/knowledge_point/heap/dangling_pointer)是什么意思，老是说什么没有清空指针可以改写什么的，感觉完全处于一个一知半解的状态（其实0知0解）*

由于没有办法退出读入 opcode 的主循环，所以可以尝试用 House OF Kiwi 来触发 IO，同时因为此题使用了 puts 进行输出，所以也可以考虑劫持 stdout 指针，这里选择前者来讲解。

*我还没看house of kiwi啊，咋这么多文章要看，感觉每个知识点都一知半解我完蛋了*

*这里怎么还有一个爆破，我最不擅长的就是爆破*

*完了明天就是月赛了我会不会死啊，那些知识点我一个都没有学完，我会不会死在月赛里啊*

在 TLS 上的地址可能需要一些爆破来得到远程偏移 [爆破的思路可以参考](https://blog.wjhwjhn.com/posts/%E9%80%9A%E8%BF%87libc%E5%9F%BA%E5%9D%80%E6%9D%A5%E7%88%86%E7%A0%B4tls/)

*tls上的地址又是什么意思。我怎么什么都不会*

*搭一个docker,怎么还要搭docker*

*我现在还没有成功搭过docker,一直没试。都怪期末考（其实也没有好好复习期末考）*

但这并非 House OF Emma 这题考察的本意

利用 House OF Emma 的攻击手法

可以在无需申请出堆块的情况下来控制程序流程

同时这种方法也只要求单次的IO vtable调用即可

这种调用的要求是非常低的。

*然后就是一个超级长的wp。好恐怖。好恐怖。从咖啡馆回宿舍之后再接着看*

<span style="color:#3498db">_IO_FILE</span>
