---
title: largebins_attack
date: 2026-03-24 11:01:22
tags: [CTF,PWN]
categories: [知识点,heap]
---

这种攻击方式主要利用的是 chunk 进入 bin 中的操作，在 malloc 的时候，遍历 unsorted bin 时，对每一个 
chunk，若无法 exact-fit 分配或不满足切割分配的条件，就会将该 chunk 置入相应的 bin 中，而此过程中缺乏对 
largebin 的跳表指针的检测。

感觉这个真的和unlink差不多

## 总结 large bin attack 的利用方法 [原文章链接](https://ctf-wiki.org/pwn/linux/user-mode/heap/ptmalloc2/large-bin-attack/#large-bin-attack_3 "Permanent link")

how2heap 中也说了，large bin attack 是未来更深入的利用。现在我们来总结一下利用的条件：

- 可以修改一个 large bin chunk 的 data
- 从 unsorted bin 中来的 large bin chunk 要紧跟在被构造过的 chunk 的后面
- 通过 large bin attack 可以辅助 Tcache Stash Unlink+ 攻击
- 可以修改 _IO_list_all 便于伪造 _IO_FILE 结构体进行 FSOP。
