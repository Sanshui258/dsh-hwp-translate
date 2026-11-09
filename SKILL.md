---
name: yeobaek-hwp
description: 把韩文/英文的 HWP、HWPX（한글）文档翻成简体中文，保留原格式。当用户要求翻译 .hwp/.hwpx 文档，或提到 한글/Hangul/韩国公文/공문 时使用。翻译由你（当前模型）完成，不需要用户配任何 API Key。
version: 0.3.0
license: MIT
homepage: https://github.com/Sanshui258/dsh-hwp-translate
tools:
  - hwp_extract
  - hwp_apply
---

# Yeobaek HWP Translator

## 什么时候用

**用**：
- 用户给了一个 `.hwp` / `.hwpx` 文件，说要翻译、看懂、或做成中文版；
- 用户提到「한글 文档」「韩国公文」「HWP」「HWPX」「行政文书」；
- 需要**保留排版**的中文文档（表格、项目符号、字号、缩进都不变）。

**不用**：
- `.pptx` / `.pdf` / `.docx` → 用 `yeobaek-office`（另一条产品线）；
- 只想翻一句话或选中的文字 → 直接翻，不用文档工具；
- 只要提取文字 → 可以用 `hwp_extract`，但不要写回。

## 工作流程（三步，全部本地）

```
1) hwp_extract(path)               → {"total":4,"segments":[{"id":"1","text":"전공체험 진행사진"}...]}
2) 你自己把每个 text 翻成目标语言     ← 用当前会话的模型，不需要额外 Key
3) hwp_apply(path, translations)   → {"ok":true,"output":"..._zh.hwpx","applied":4,"missing":[]}
```

**注意**：
- `translations` 必须是 `{"id": "译文"}`，id 原样带回，不要自己编号；
- 长文档分页：`hwp_extract` 返回 `next_offset` 不为空时，用 `offset` 继续取；
- 只有抽到的段落需要翻译；`hwp_apply` 返回的 `missing` 列出没交回的 id。

## 翻译要求

- 保留原文的标点与换行意图；表格单元格要短、名词化；
- 韩文里的「※」「○」「-」等符号保留；
- 数字、日期、人名、机构名照抄不译，除非用户要求；
- 同一术语全文统一（"전공" → "专业"，"학과" → "学科"）。

## 失败怎么处理

| 现象 | 处理 |
|---|---|
| `没找到 HWP 翻译器` | 插件包不完整：让用户重装插件，或设 `YEOBAEK_CLI` |
| `文件不存在` | 向用户确认路径，不要猜 |
| `applied: 0` | 可能是 id 对不上：重新 `hwp_extract` 再翻 |
| `.hwp` 转换失败 | 旧版二进制需要本机 한글；建议用户另存为 `.hwpx` |

## 不要做的事

- 不要调用 `hwp_translate`（旧接口，需要用户自己的 API Key）——优先 `hwp_extract` + `hwp_apply`；
- 不要修改用户原文件：`hwp_apply` 只写 `*_zh` 新文件；
- 不要声称"已翻译"除非 `hwp_apply` 返回 `ok: true` 且 `output` 存在；
- 不要在 `.pptx` / `.pdf` 上调用本工具。
