# dsh-hwp-translate

DSH 插件：把 `.hwp` / `.hwpx`（한글）文档翻成中文，**保留表格、项目符号、字号与缩进**，
译文写在原文件旁边（`原名_zh.扩展名`）。

**只能用宿主（会话）模型翻译，不提供任何自填 API 的通道**：插件只负责把文档读成
JSON、再把模型给的译文写回文件。两个步骤都在本机执行，插件本身不发起网络请求，
也不需要、不接受 API Key。

## 它能做什么、不能做什么

| 能 | 不能 |
|---|---|
| `.hwpx`（韩文/英文）→ 中文，纯 Python 读写 | PPT / PDF / Excel（请用 Yeobaek 完整版） |
| `.docx`（Word）→ 中文，保留样式 | 扫描件 / 图片里的文字（本插件不做 OCR） |
| `.hwp`（旧二进制）→ 中文，经本机 한글 转换，输出仍是 `.hwp` | 加密文档（需先在 한글 里解密） |
| 表格单元格、项目符号、缩进、字号跟随原文 | run 级富文本（粗体/上下标）目前会塌成首 run 的格式 |
| 长文档分页抽取（默认每页 50 段，可调 1–200） | 参考文献/公式的专门跳过策略 |

## 两个工具

| 工具 | 参数 | 返回 | 联网 |
|---|---|---|---|
| `hwp_extract` | `path`、`offset?`、`limit?`、`allow_hangul?` | `{total, offset, next_offset, segments[], notice?}` | 否 |
| `hwp_apply` | `path`、`translations`、`out_dir?`、`allow_hangul?` | `{ok, output, applied, skipped, missing[], notice?}` | 否 |

`segments` 里每项：

```json
{"id": "4", "text": "교수님 성함", "kind": "cell", "in_table": true, "font_size": 10}
```

> `id` 是文档里的段落序号，写回时**原样带回**即可，不要自己重新编号。

## 一次完整调用的样子

```
用户：把 D:\资料\행정절차.hwpx 翻成中文

1. hwp_extract(path)                → 4 段（id 1/2/4/8）
2. 模型逐段翻译                       ← 用会话模型，不额外花钱配 Key
3. hwp_apply(path, {"1": "…", "2": "…"})
   → {"ok": true, "output": "…_zh.hwpx", "applied": 4, "missing": []}
```

分页：`next_offset` 不为 `null` 时，带 `offset=next_offset` 再取一页；
`missing` 是没交回的 id，可以补翻后再 `hwp_apply` 一次（幂等：只替换交回的段落）。

## 权限：操作 한글 前必须先问用户

`.hwp`（旧二进制）需要启动**本机 한글** 并通过 COM 打开文档，这属于「操作外部程序」：

1. `hwp_extract` / `hwp_apply` 收到 `.hwp` 时，**必须带 `allow_hangul: true`**；
2. 没带就返回 `{"ok": false, "code": "HANGUL_PERMISSION_REQUIRED"}`，不会静默启动 한글；
3. agent 会先向你确认，再带这个参数重试。

不想给这个权限：把文件另存为 `.hwpx`，纯 Python 读写，完全不需要 한글。

## 한글 安全对话框（必须点第二个按钮）

`.hwp` 触发本机 한글 时，会弹出「파일 접근」安全提示：

```
[접근 허용(Y)]  [모두 허용(N)]  [허용 안 함(A)]  [모두 안 함(C)]
```

请点**第二个「모두 허용」（N）**：

- 点第一个只放行当前这一个文件，下一个文件（例如写回时的 `_zh.hwpx`）还会再弹；
- 点后两个会直接失败；
- 120 秒内没点，本次转换会被终止，返回 `HANGUL_DIALOG_TIMEOUT`（不是普通失败）。

转换在**子进程**里执行，所以卡住的 한글 不会拖住 agent；超时后进程会被终止。
成功返回里的 `notice` 会重复这个提醒。

## 错误码

失败一律返回 `{"ok": false, "code": "...", "hint": "...", "error": "..."}`：

| code | 含义 | 处理 |
|---|---|---|
| `HANGUL_PERMISSION_REQUIRED` | 未获用户同意就处理 `.hwp` | 先问用户，同意后带 `allow_hangul: true` |
| `HANGUL_DIALOG_TIMEOUT` | 한글 安全框 120 秒没人点 | 重试并点第二个「모두 허용」 |
| `HANGUL_REQUIRED` | 本机没有 한글 | 装 한글，或改存 `.hwpx` |
| `CONVERT_TIMEOUT` / `CONVERT_FAILED` | 转换失败 | 用 한글 手动打开确认文件正常 |
| `UNSUPPORTED_FORMAT` | 不是 `.hwp/.hwpx/.docx` | 换文件或另存 |
| `NOT_FOUND` | 路径不存在 | 确认路径 |
| `BAD_MAP` | 译文 JSON 结构不对 | 用 `{"id": "译文"}` |
| `EXTRACT_FAILED` / `APPLY_FAILED` | 读写失败 | 重新抽取后再写回 |

## 运行目录与日志

默认写到 `%LOCALAPPDATA%\Yeobaek\HWP-Tool`（可用环境变量 `YEOBAEK_HOME` 改）：

```
cache/translation_cache.db   # 旧接口的翻译缓存
logs/ 、reports/             # 旧接口的运行日志与质量报告
```

这样插件目录保持只读，也避免 한글 对插件目录再弹一次权限框。

## 安装

在 DSH 的插件安装界面安装，或：

```sh
dsh plugin --profile web add github:Sanshui258/dsh-hwp-translate
```

翻译器随包分发（`bin/HWP_Translator.exe`，16.8 MB，单文件），不需要另外安装 Yeobaek；
也可以用 `YEOBAEK_CLI` 指向自己的构建。

## 卸载

```sh
dsh plugin --profile web remove dsh-hwp-translate
```

## 已知限制

- 仅 Windows；`.hwp` 需要本机 한글（`.hwpx` 不需要）；
- 整段替换：run 级样式（粗体、上下标、混排字体）会塌成首个 run 的格式；
- 长文档要分页抽取，单页默认 50 段；
- 不提供「自己填 Key」的模式：必须由宿主（会话）模型翻译；
- 许可证：本插件 MIT；随包翻译器为个人非商业使用许可。

## 版本记录

| 版本 | 内容 |
|---|---|
| 0.4.0 | 移除自填 API 的旧接口：只允许宿主模型翻译 |
| 0.3.3 | 한글 弹窗指引（点第二个「모두 허용」）、`HANGUL_DIALOG_TIMEOUT`、运行目录移出插件 |
| 0.3.2 | `.hwp` 前必须显式同意（`allow_hangul`） |
| 0.3.1 | `.hwp` 自动转换、结构化错误码、`.hwp` 进 `.hwp` 出 |
| 0.3.0 | 零 Key：翻译改由会话模型完成（`extract` + `apply`） |
| 0.2.0 | X1 离线抽取/写回 |
| 0.1.0 | 首个版本（调用本机 Yeobaek CLI） |
