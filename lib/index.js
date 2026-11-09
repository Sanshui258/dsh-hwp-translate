// dsh-hwp-translate —— DSH 插件入口
//
// 按 DSH 内置插件的真实写法（对照 asar 里的 dsh-tool-cordis）：
//   export const name / inject / apply(ctx)
//   ctx.tools.register(defineTool({ name, description, parameters, output, execute, presentCall }))
//
// 依赖说明（很重要）：
//   - 运行时只用 Node 内置模块 + DSH 提供的 @deepseek-ai/dsh-tools；
//   - 翻译器本体随包分发：bin/HWP_Translator.exe（14 MB，单文件，无 Qt/Office 依赖）；
//   - 用户**不需要**另外安装 Yeobaek，只要 Windows + 一个 API Key。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "hwp-translate";
export const inject = ["tools"];

const IS_WINDOWS = process.platform === "win32";
const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLED_CLI = join(HERE, "..", "bin", "HWP_Translator.exe");

/** 找翻译器：环境变量 → 随包 exe → 本机已装（PPT Translator / Yeobaek）。 */
export function findCli() {
  const fromEnv = process.env.YEOBAEK_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(BUNDLED_CLI)) return BUNDLED_CLI;

  const installed = [
    join(process.env.LOCALAPPDATA || "", "Programs", "PPT Translator", "HWP_Translator.exe"),
    join(process.env.LOCALAPPDATA || "", "Programs", "Yeobaek", "HWP_Translator.exe"),
    join(process.env.PROGRAMFILES || "", "PPT Translator", "HWP_Translator.exe"),
    join(process.env.PROGRAMFILES || "", "Yeobaek", "HWP_Translator.exe"),
    // 完整版（没有 --target-lang，语言走 TARGET_LANGUAGE 环境变量）
    join(process.env.LOCALAPPDATA || "", "Programs", "PPT Translator", "PPT_Translator_CLI.exe"),
    join(process.env.LOCALAPPDATA || "", "Programs", "Yeobaek", "PPT_Translator_CLI.exe"),
  ];
  return installed.find((p) => p && existsSync(p)) || null;
}

/** 精简版支持 --target-lang/--json；完整版只认 --file/--output-dir。 */
function cliArgs(cli, file, { target, outDir }) {
  const slim = /HWP_Translator\.exe$/i.test(cli);
  const args = ["--file", file];
  if (outDir) args.push("--output-dir", outDir);
  if (slim) {
    if (target) args.push("--target-lang", target);
    args.push("--json");
  }
  return args;
}

/** 调用翻译器；返回 { ok, input, output, summary } 或抛错。 */
export function runYeobaek(file, { target = "zh-CN", outDir, signal } = {}) {
  return new Promise((resolvePromise, reject) => {
    if (!IS_WINDOWS) {
      reject(new Error("HWP 翻译依赖 Windows + 한글(HWP)"));
      return;
    }
    const cli = findCli();
    if (!cli) {
      reject(
        new Error(
          "没找到 HWP 翻译器：随包的 bin/HWP_Translator.exe 不存在。请重新安装本插件，或用 YEOBAEK_CLI 指定可执行文件。"
        )
      );
      return;
    }
    const args = cliArgs(cli, file, { target, outDir });
    const child = spawn(cli, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TARGET_LANGUAGE: target },
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      const text = stdout.trim();
      const jsonLine = text.split(/\r?\n/).filter((l) => l.startsWith("{")).pop();
      if (jsonLine) {
        try {
          const parsed = JSON.parse(jsonLine);
          if (parsed && parsed.ok === false) {
            reject(new Error(parsed.error || "翻译失败"));
            return;
          }
          resolvePromise({ code, ...parsed });
          return;
        } catch {
          /* 落到普通文本分支 */
        }
      }
      if (code === 0) {
        const tail = text.split(/\r?\n/).filter(Boolean).slice(-3);
        resolvePromise({ code, ok: true, input: file, summary: tail });
      } else {
        reject(new Error(`翻译器退出码 ${code}: ${stderr.slice(-400) || text.slice(-400)}`));
      }
    });
  });
}

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: "hwp_translate",
      description:
        "Translate a HWP/HWPX (한글) document into Chinese while keeping tables, bullets and " +
        "indentation, then return the output path. The translator ships with this plugin, so no " +
        "separate app is needed; an API key must be configured (AI_API_KEY/AI_BASE_URL). Windows " +
        "only. Use it for .hwp/.hwpx requests, not for .pptx or .pdf.",
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
        return {
          ok: true,
          input: file,
          output: result.output || "",
          summary: result.summary || [],
        };
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
