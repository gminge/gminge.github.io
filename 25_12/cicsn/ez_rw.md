
> libc版本：2.31

### 文章阅读

#### [glibc 2.31 常见利用手法](https://wsxk.github.io/glic231/)

**glibc的堆题目思路一般是：代码审计——发现漏洞(uaf,double free,oob, …)——利用漏洞泄露glibc地址/堆地址——堆风水（目的是获得任意地址的读写能力）——劫持free_hook为system，实现利用**

tcache

2.31的函数本身会对double free进行检查

fast bin double free+tcache stash进行绕过

2.31不是ban了double free吗

pthread_tcache_struct

先填充tcache然后分配fastbin.

啥啊。啥啊。

填充tcache之后会填充fastbin

然后申请完tcache就能申请到fastbin（？）

这个利用方法好像之前讲过。就是把地址申请出来。但是一直没写到相关题目就是了。

#### [Heap Exploit v2.31 | 最新堆利用技巧，速速查收](https://zhuanlan.zhihu.com/p/136983333)

当从 fastbin 里取 chunk 时，其余的 chunk 会被依次放入对应的 tcache 中，终止条件时 fastbin 链为空或者 tcache 装满。

做 fastbin 相关利用的时候要先填满对应的 tcache_entry 链。

所以上篇文章才说要填充tcache吗。

这样吗。

tache stash unlink （smallbin解链，有unlink,类似于远古版本的无检测unlink

Tcache stash unlink attack可以实现等价于 unsortedbin 的作用，即向任意地址写入一个不可控的大数字

先放入 2 个 chunk 到 smallbin，6 个 chunk 到对应的 tcache 。之后在不破坏 fd 的情况下将后放入 smallbin 的 chunk 的 bk 设置为目标地址- 0x10 

好多例题。后面再看吧。。。





### 草稿

清了chunk指针

edit没有溢出

是一道堆。但是我不知道怎么运行。哈哈。

不是。有点烦。我感觉能懂打法。想调试一下。但是。我不知道怎么运行文件。不是。

之前没这么发过文件啊。

没学过咋使啊。

咋整啊。

怎么没有签到题啊。       感觉这道就是签到题，但是，但是，我，打不开，题目，我不会运行题目。

学长不会红温吧。。。

写一天结果题目都没运行上。

我也连不了远程。我也开不了本地。咋办啊。咋办啊

哎。

这个本地咋调啊。

没见过这种题目啊。

哎。

咋整啊



啥叫解最多的是一道内核啊

不是。

内核怎么还要配环境啊。       这道不是内核另外一道是。

不是。


###### 心路历程

我好饿啊怎么没人去吃饭啊

这个题目我也不知道怎么打开。看得出来是一道堆。但是我都没办法gdb调试。我是飞舞来的。

好饿啊好想吃饭啊。再饿一阵我都不想吃饭了。

好饿啊

好饿

好饿

这个delete函数是清了chunk指针的，虽然好像没清size

但是好像没有double free的检测

这个版本的libc有double free的检测吗。。     有的兄弟有的

忘记了。

好饿。好饿。好饿。好饿。

我真的好饿啊。。咋办啊。

我好饿。

wk.队友咋这么强啊。

wk.

我肯定爆零的啊。

咋办啊。

