---
title: house_of_apple
date: 2026-03-24 10:20:54
tags:
---



存草稿





### 利用_IO_wfile_overflow函数控制程序执行流

对`fp`的设置如下：

- `_flags`设置为`~(2 | 0x8 | 0x800)`，如果不需要控制`rdi`，设置为`0`即可；如果需要获得`shell`，可设置为 `sh;`，注意前面有两个空格
- `vtable`设置为`_IO_wfile_jumps/_IO_wfile_jumps_mmap/_IO_wfile_jumps_maybe_mmap`地址（加减偏移），使其能成功调用`_IO_wfile_overflow`即可
- `_wide_data`设置为可控堆地址`A`，即满足`*(fp + 0xa0) = A`
- `_wide_data->_IO_write_base`设置为`0`，即满足`*(A + 0x18) = 0`
- `_wide_data->_IO_buf_base`设置为`0`，即满足`*(A + 0x30) = 0`
- `_wide_data->_wide_vtable`设置为可控堆地址`B`，即满足`*(A + 0xe0) = B`
- `_wide_data->_wide_vtable->doallocate`设置为地址`C`用于劫持`RIP`，即满足`*(B + 0x68) = C`



函数的调用链如下：

```c
_IO_wfile_overflow
    _IO_wdoallocbuf
        _IO_WDOALLOCATE
            *(fp->_wide_data->_wide_vtable + 0x68)(fp)
```





### 利用_IO_wfile_underflow_mmap函数控制程序执行流

对`fp`的设置如下：

- `_flags`设置为`~4`，如果不需要控制`rdi`，设置为`0`即可；如果需要获得`shell`，可设置为 `sh;`，注意前面有个空格
- `vtable`设置为`_IO_wfile_jumps_mmap`地址（加减偏移），使其能成功调用`_IO_wfile_underflow_mmap`即可
- `_IO_read_ptr < _IO_read_end`，即满足`*(fp + 8) < *(fp + 0x10)`
- `_wide_data`设置为可控堆地址`A`，即满足`*(fp + 0xa0) = A`
- `_wide_data->_IO_read_ptr >= _wide_data->_IO_read_end`，即满足`*A >= *(A + 8)`
- `_wide_data->_IO_buf_base`设置为`0`，即满足`*(A + 0x30) = 0`
- `_wide_data->_IO_save_base`设置为`0`或者合法的可被`free`的地址，即满足`*(A + 0x40) = 0`
- `_wide_data->_wide_vtable`设置为可控堆地址`B`，即满足`*(A + 0xe0) = B`
- `_wide_data->_wide_vtable->doallocate`设置为地址`C`用于劫持`RIP`，即满足`*(B + 0x68) = C`



函数的调用链如下：



```c
_IO_wfile_underflow_mmap
    _IO_wdoallocbuf
        _IO_WDOALLOCATE
            *(fp->_wide_data->_wide_vtable + 0x68)(fp)
```





### 利用_IO_wdefault_xsgetn函数控制程序执行流

**这条链执行的条件是调用到_IO_wdefault_xsgetn时rdx寄存器，也就是第三个参数不为0**。如果不满足这个条件，可选用其他链。

对`fp`的设置如下：

- `_flags`设置为`0x800`
- `vtable`设置为`_IO_wstrn_jumps/_IO_wmem_jumps/_IO_wstr_jumps`地址（加减偏移），使其能成功调用`_IO_wdefault_xsgetn`即可
- `_mode`设置为大于`0`，即满足`*(fp + 0xc0) > 0`
- `_wide_data`设置为可控堆地址`A`，即满足`*(fp + 0xa0) = A`
- `_wide_data->_IO_read_end == _wide_data->_IO_read_ptr`设置为`0`，即满足`*(A + 8) = *A`
- `_wide_data->_IO_write_ptr > _wide_data->_IO_write_base`，即满足`*(A + 0x20) > *(A + 0x18)`
- `_wide_data->_wide_vtable`设置为可控堆地址`B`，即满足`*(A + 0xe0) = B`
- `_wide_data->_wide_vtable->overflow`设置为地址`C`用于劫持`RIP`，即满足`*(B + 0x18) = C`



函数的调用链如下：



```c
_IO_wdefault_xsgetn
    __wunderflow
        _IO_switch_to_wget_mode
            _IO_WOVERFLOW
                *(fp->_wide_data->_wide_vtable + 0x18)(fp)
```
