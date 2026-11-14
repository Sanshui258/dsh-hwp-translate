# dsh-hwp-translate

DSH 插件：把 `.hwp` / `.hwpx`（한글）文档翻成中文，**保留表格、项目符号与缩进**。

**不需要任何 API Key**：翻译由当前会话的模型完成，插件只负责本地抽取与写回。

## 三个工具

| 工具 | 作用 | 联网 |
|---|---|---|
| `hwp_extract(path, offset?, limit?)` | 抽取待翻段落（id + 原文）；`.hwp` 自动转 `.hwpx` | 否 |
| `hwp_apply(path, translations, out_dir?)` | 把 `{id: 译文}` 写回；`.hwp` 进则 `.hwp` 出 | 否 |
| `hwp_translate(path, target?, out_dir?)` | 旧接口：让 exe 自己调 API（需自带 Key） | 是 |

## 典型用法（模型自动完成）

```
用户：把 D:\资料\행정절차.hwpx 翻成中文

1. hwp_extract → 4 段韩文
2. 模型自己翻译成中文
3. hwp_apply({"1": "专业体验活动照片", ...}) → 输出 D:\资料\행정절차_zh.hwpx
```

分页：`hwp_extract` 返回 `next_offset`，用它继续取下一页；
写回后返回值里的 `missing` 是没交回的 id。

## 前置

- **Windows**；
- `.hwpx` / `.docx` 纯 Python，直接可用；
- 旧版 `.hwp` 需要本机 한글(HWP)：工具会自动转 `.hwpx`、写完再转回 `.hwp`；没有 한글 返回 `HANGUL_REQUIRED`；
- 不需要 API Key、不需要另装 Yeobaek——翻译器随包分发（`bin/HWP_Translator.exe`，16.8 MB）。

## 安装

在 DSH 的插件安装界面安装，或：

```sh
dsh plugin --profile web add github:Sanshui258/dsh-hwp-translate
```

## 离线命令行（不经 DSH 也能用）

```sh
HWP_Translator.exe --file 文档.hwpx --extract-json segments.json
HWP_Translator.exe --file 文档.hwpx --apply-json translations.json --output-dir out
```

## 已知限制

- 仅 Windows；`.hwpx` 纯 Python，`.hwp` 需要本机 한글；
- 长文档要分页抽取（每页默认 50 段）；
- 旧接口 `hwp_translate` 仍需用户自己的 API Key，仅为兼容保留；
- 许可证：本插件 MIT；随包翻译器为个人非商业使用许可。

## 权限与 한글

`.hwp`（旧二进制）需要启动本机 한글 并通过 COM 打开文档。这是「操作外部程序」，
不是纯文件读写，所以：

- 工具调用需要显式 `allow_hangul: true`（agent 会先向你确认）；
- 未授权时返回 `HANGUL_PERMISSION_REQUIRED`，不会自行启动 한글；
- 한글 首次可能弹出「允许外部程序访问」，请选择允许；
- 不想给这个权限：把文件另存为 `.hwpx`，纯 Python 读写，无需 한글。

## 错误码

失败时返回 `{"ok": false, "code": "...", "hint": "...", "error": "..."}`：

`HANGUL_REQUIRED`（缺 한글）、`CONVERT_TIMEOUT`（转换超 120s）、
`UNSUPPORTED_FORMAT`、`NOT_FOUND`、`BAD_MAP`、`EXTRACT_FAILED`、`APPLY_FAILED`。
