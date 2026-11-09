// dsh-hwp-translate —— DSH 插件入口
//
// 按 DSH 内置插件的真实写法（对照 asar 里的 dsh-tool-cordis）：
//   export const name / inject / apply(ctx)
//   ctx.tools.register(defineTool({ name, description, parameters, output, execute, presentCall }))
//
// 职责：把「翻译这份 HWP/HWPX」变成对 Yeobaek CLI 的一次调用。
// 翻译与写回逻辑全在 Python 主仓库，这里不复制任何业务逻辑。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "hwp-translate";
export const inject = ["tools"];

const IS_WINDOWS = process.platform === "win32";

/** 找本机安装的 Yeobaek CLI：环境变量优先，其次常见安装位置。 */
export function findCli() {
  const fromEnv = process.env.YEOBAEK_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    // 专用精简版优先（14 MB，只带文档链路）
    join(process.env.LOCALAPPDATA || "", "Programs", "Yeobaek", "HWP_Translator.exe"),
    join(process.env.PROGRAMFILES || "", "Yeobaek", "HWP_Translator.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Yeobaek", "HWP_Translator.exe"),
    // 退回完整版
    join(process.env.LOCALAPPDATA || "", "Programs", "Yeobaek", "PPT_Translator_CLI.exe"),
    join(process.env.PROGRAMFILES || "", "Yeobaek", "PPT_Translator_CLI.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Yeobaek", "PPT_Translator_CLI.exe"),
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}

/** 调用 CLI 翻译一个文件。 */
export function runYeobaek(file, { target = "zh-CN", outDir, signal } = {}) {
  if (!IS_WINDOWS) {
    return Promise.reject(new Error("HWP 翻译依赖 Windows + 한글(HWP) COM"));
  }
  const cli = findCli();
  if (!cli) {
    return Promise.reject(
      new Error(
        "没找到 Yeobaek CLI：请先安装 Yeobaek Translator，或设置 YEOBAEK_CLI 指向 HWP_Translator.exe（或完整版 PPT_Translator_CLI.exe）"
      )
    );
  }
  const args = [file, "--target-lang", target];
  if (outDir) args.push("--output-dir", outDir);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ code, stdout, stderr });
      else reject(new Error(`Yeobaek 退出码 ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: "hwp_translate",
      description:
        "Translate a HWP/HWPX (한글) document into the target language while keeping its original " +
        "layout, then return the output path. Requires Yeobaek Translator installed on this Windows " +
        "machine (or YEOBAEK_CLI pointing at PPT_Translator_CLI.exe). Use it when the user asks to " +
        "translate a Korean or English HWP/HWPX file; do not use it for .pptx or .pdf.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the .hwp or .hwpx file to translate.",
        },
        target: {
          type: "string",
          description: "Target language code. Defaults to zh-CN.",
        },
        out_dir: {
          type: "string",
          description: "Optional output directory; defaults to the file's own directory.",
        },
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [
          { type: "text", text: JSON.stringify(value, null, 2) },
        ],
      },
      async execute(args, exec) {
        const file = resolve(String(args.path || ""));
        if (!existsSync(file)) throw new Error(`文件不存在：${file}`);
        const result = await runYeobaek(file, {
          target: args.target || "zh-CN",
          outDir: args.out_dir,
          signal: exec?.signal,
        });
        const tail = result.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-3);
        return { ok: true, input: file, summary: tail };
      },
      presentCall(args) {
        return {
          card: "generic",
          kind: "write",
          title: `Translate HWP ${args?.path || ""}`,
        };
      },
    })
  );
}

export default { name, inject, apply };
