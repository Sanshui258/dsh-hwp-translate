# dsh-hwp-translate

DSH 工具插件：把 `.hwp` / `.hwpx`（한글）文档翻成中文，**保留表格、项目符号与缩进**。
注册一个工具 `hwp_translate`，返回输出文件路径。

翻译器随插件一起分发（`bin/HWP_Translator.exe`，14 MB，单文件），**不需要另外安装 Yeobaek**。

## 前置

- **Windows**（写回用 COM；macOS/Linux 不支持）；
- **API Key**：`AI_API_KEY` 与 `AI_BASE_URL`（环境变量，或 exe 同目录的 `.env`）；
- 翻译**旧版 `.hwp`** 还需要本机装 한글(HWP)；`.hwpx` 不需要。

## 安装

在 DSH 的插件安装界面里安装，或：

```sh
dsh plugin --profile web add github:Sanshui258/dsh-hwp-translate
```

## 工具

`hwp_translate(path, target?, out_dir?)` → `{ ok, input, output, summary }`

| 参数 | 说明 |
|---|---|
| `path` | `.hwp` / `.hwpx` 的绝对路径 |
| `target` | 目标语言，默认 `zh-CN` |
| `out_dir` | 输出目录，默认与原文件同目录 |

输出文件名：`原名_zh.后缀`。

## 配置 API Key

两种方式，任选其一：

1. 环境变量（推荐）：在系统环境变量里设置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`；
2. 把 `.env` 放在 `bin/HWP_Translator.exe` 旁边（可从仓库的 `.env.example` 复制）。

> 不要填智谱、Kimi 等「编程套餐（coding plan）」的地址：那些套餐只允许官方工具调用。

## 已知限制

- 仅 Windows；`.hwp` 需要本机 한글，`.hwpx` 纯 Python 读写；
- 只翻译 HWP/HWPX（PPT/PDF/Word 请用完整版 Yeobaek Translator）；
- 没有进度流：大文件会等几十秒到几分钟，工具只返回最终结果；
- 许可证：本插件 MIT；随包翻译器为个人非商业使用许可。

## 卸载

```sh
dsh plugin --profile web remove dsh-hwp-translate
```
