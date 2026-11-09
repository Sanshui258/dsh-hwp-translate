# HWP/한글 翻译插件（DSH 市场包）—— 骨架

> 这是**待发布的独立仓库**，不放进主仓库的构建产物里。
> 主仓库继续持有 HWP 翻译逻辑（Python），这里只是"DSH 适配层"。

## 为什么单独一个仓库

1. 市场条目 = **一个 npm 包或 git 仓库**，一个仓库对应一个插件；
2. 主仓库是 Python 桌面程序（73 MB 运行时），不适合作为插件包；
3. 独立仓库可以用 `dsh plugin --profile web add link:<path>` 本地联调，不影响主线发版。

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | 插件清单：`dsh.bundle.patch` 指向 `cordis.patch.yml` |
| `cordis.patch.yml` | 加载声明（`insert: [{id, name}]`） |
| `lib/index.js` | 适配层：注册工具 → 调用本机 `PPT_Translator_CLI.exe` |
| `icon.png` | 市场列表图标（从 `assets/icon/yeobaek_mark.png` 复制） |
| `README.md` | 安装/使用/已知限制 |
| `PROVENANCE.md` | 来源说明（市场惯例：说明代码出处与构建方式） |

## 发布步骤

1. 在 GitHub 建空仓库 `dsh-hwp-translate`（公开，MIT）；
2. 提交本目录内容，打 tag `v0.1.0`；
3. 市场索引用 **commit 哈希**固定：`git+https://github.com/<你>/dsh-hwp-translate.git#<commit>`；
4. 用户侧：DSH 设置 → 市场 → 添加索引 URL（这份 `index.json` 的 raw 地址）；
5. 升级：改代码 → 新 tag → 更新 index 的版本/commit。

## 本地联调（不用发布）

```powershell
dsh plugin --profile web add link:C:\path\to\dsh-hwp-translate
```

## 前提（尚未完成）

- 主仓库要有 **X1 接口**：`PPT_Translator_CLI.exe --extract-json` / `--apply-json`；
- 插件要么要求用户先装 Yeobaek 桌面版，要么首次运行时从 Releases 下载 zip（体积大，建议前者）。
