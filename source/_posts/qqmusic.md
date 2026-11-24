---
title: linux一打开qq音乐就闪退
date: 2026-03-04 14:15:23
tags: [qq音乐,闪退]


---

先输入这个打开文件

```bash
sudo nano /usr/share/applications/qqmusic.desktop
```

然后把这个

```bash
Exec=/opt/qqmusic/qqmusic %U
```

改成这个

```bash
Exec=/opt/qqmusic/qqmusic --no-sandbox%U
```

另：绯乐涟二代LIAN2入耳式HIFI游戏耳机好用，音质好好
