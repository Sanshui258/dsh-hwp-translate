---
name: yeobaek-hwp
description: 把韩文/英文的 HWP、HWPX（한글）文档翻成简体中文，保留原格式原地替换。当用户要求翻译 .hwp/.hwpx 文档、或提到 한글/Hangul/韩国公文/공문 时使用。
version: 0.1.0
license: MIT
homepage: https://github.com/Sanshui258/PPT-Translator
tools:
  - hwp_translate
---

# Yeobaek HWP Translator

## 什么时候用

**用**：
- 用户给了一个 `.hwp` / `.hwpx` 文件，说要翻译、看懂、或做成中文版；
- 用户提到「한글 文档」「韩国公文」「HWP」「HWPX」「行政文书」；
- 需要**保留排版**的双语/中文文档（表格、项目符号、字号、缩进都不变）。

**不用**：
- `.pptx` / `.pdf` / `.docx` → 用 `yeobaek-office`（另一条产品线）；
- 用户只想翻一句话或一段选中的文字 → 直接翻，不用文档工具；
- 用户要的是「提取文字给我看」而不是生成文件 → 读文件即可。

## 调用方式

优先用工具（插件已注册时）：

```json
{"tool": "hwp_translate", "path": "D:\\资料\\행정절차.hwp", "target": "zh-CN"}
```

没有插件、但有命令行时（Windows）：

```powershell
HWP_Translator.exe --file "D:\资料\행정절차.hwp" --target-lang zh-CN --json
```

返回（`--json` 时，stdout 只有一行 JSON）：

```json
{"ok": true, "input": "D:\\资料\\행정절차.hwp", "output": "D:\\资料\\행정절차_zh.hwp", "status": "ok", "translated": 128, "error": ""}
```

失败时：

```json
{"ok": false, "error": "找不到 한글(HWP) 程序：写回 .hwp 需要本机安装 한글"}
```

## 参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `file` / `path` | 是 | 输入文件绝对路径，支持 `.hwp`、`.hwpx` |
| `--target-lang` | 否 | 目标语言，默认 `zh-CN` |
| `--output-dir` | 否 | 输出目录；默认与原文件同目录 |
| `--mock` | 否 | 不联网，用原文占位，只验证链路 |
| `--force` | 否 | 忽略缓存重新翻译 |

输出文件名规则：`原文件名_zh.hwpx`（语言前缀取目标语言的主语言，如 `zh-CN` → `zh`）。

## 前置条件（先检查，再调用）

1. **Windows**：HWP 写回依赖 한글(HWP) COM，macOS/Linux 不支持；
2. **`.hwp` 需要本机装 한글**：旧二进制格式要先转 `.hwpx` 才能改；`.hwpx` 不需要；
3. **API Key**：真实翻译要 `.env` 里的 `AI_API_KEY` / `AI_BASE_URL`（或环境变量）；
4. 找不到工具时先看 `YEOBAEK_CLI` 环境变量是否指向 `HWP_Translator.exe`。

## 错误 → 下一步

| 错误文本 | 含义 | 你该做什么 |
|---|---|---|
| `没找到 Yeobaek CLI` | 没装或没配环境变量 | 让用户安装 HWP_Translator，或设置 `YEOBAEK_CLI` |
| `找不到 한글(HWP) 程序` | 本机没装 한글 | 建议用户装 한글，或改用 `.hwpx` |
| `401` / `invalid api key` | Key 不对 | 请用户检查 `.env`，不要重试 |
| `429` / `rate limit` | 限流 | 调小 `MAX_CONCURRENCY`，或换 Key |
| `timeout` | 网络/单批过大 | 直接重跑（已完成句子有缓存，不重复扣费） |
| `文件不存在` | 路径错 | 向用户确认路径，不要猜 |

## 处理较大文件

- 一份 20 页公文通常 10–60 秒；超过 2 分钟先告诉用户在跑，别重复调用；
- 同一文件重复调用会命中缓存，第二次很快；
- 批量：一次一个文件调用，串行更稳；不要把多个文件塞进一次调用。

## 不要做的事

- 不要为了"看看效果"先跑 `--force`（会清掉缓存、重复计费）；
- 不要修改用户原文件——工具只读输入、写新文件；
- 不要声称"已翻译"除非返回 JSON 里 `ok: true` 且 `output` 指向的文件存在；
- 不要在 `.pptx` 上调用本工具（会直接报"只支持 .hwp/.hwpx"）。

## 术语一致性（可选）

用户有课程/项目术语表时，把分组名写进 `.env` 的 `GLOSSARY_GROUP=课程A`，
工具会自动只注入本批出现的术语，命中术语的句子改一条只重翻相关句。
