// dsh-hwp-translate —— 纯逻辑（不依赖 DSH），可在 Node 里单独测试。
//
// 思路：插件不再自己调模型。翻译由**当前会话的模型**完成（用宿主额度/Key），
// 插件只做两件本地事：
//   1) hwp_extract：把文档段落抽成 JSON 给模型看；
//   2) hwp_apply：把模型给的 {id: 译文} 写回文档。
// 两个都调用随包的 HWP_Translator.exe（X1 离线接口），全程不联网。

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLED_CLI = join(HERE, "..", "bin", "HWP_Translator.exe");
const IS_WINDOWS = process.platform === "win32";

/** 找翻译器：环境变量 → 随包 exe → 本机已装副本。 */
export function findCli() {
  const fromEnv = process.env.YEOBAEK_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  if (existsSync(BUNDLED_CLI)) return BUNDLED_CLI;
  const installed = [
    join(process.env.LOCALAPPDATA || "", "Programs", "PPT Translator", "HWP_Translator.exe"),
    join(process.env.LOCALAPPDATA || "", "Programs", "Yeobaek", "HWP_Translator.exe"),
    join(process.env.PROGRAMFILES || "", "PPT Translator", "HWP_Translator.exe"),
    join(process.env.PROGRAMFILES || "", "Yeobaek", "HWP_Translator.exe"),
    join(process.env.LOCALAPPDATA || "", "Programs", "PPT Translator", "PPT_Translator_CLI.exe"),
  ];
  return installed.find((p) => p && existsSync(p)) || null;
}

function requireCli() {
  if (!IS_WINDOWS) throw new Error("HWP 翻译依赖 Windows + 한글(HWP)");
  const cli = findCli();
  if (!cli) {
    throw new Error(
      "没找到 HWP 翻译器：随包的 bin/HWP_Translator.exe 不存在。请重装插件，或用 YEOBAEK_CLI 指定。"
    );
  }
  return cli;
}

/** 跑一次 exe，返回 stdout（超时/非零退出都抛错）。 */
export function runCli(args, { timeoutMs = 300000, signal } = {}) {
  const cli = requireCli();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`翻译器超过 ${Math.round(timeoutMs / 1000)}s 未返回`));
    }, timeoutMs);
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`翻译器退出码 ${code}: ${(stderr || stdout).slice(-400)}`));
    });
  });
}

function parseJsonLine(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) throw new Error("翻译器没有返回任何内容");
  // 可能是单行 JSON，也可能是 pretty-printed 多行：整体解析 → 取首尾大括号
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("翻译器返回的不是 JSON：" + trimmed.slice(0, 120));
}

/** X1 抽取：返回 {total, offset, limit, next_offset, segments, source}。 */
export async function extractDocument(file, { offset = 0, limit = 50 } = {}) {
  const path = resolve(String(file || ""));
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  const stdout = await runCli(["--file", path, "--extract-json"]);
  const payload = parseJsonLine(stdout);
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const start = Math.max(0, Math.min(segments.length, Number(offset) || 0));
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const page = segments.slice(start, start + size);
  return {
    source: payload.source || path,
    total: segments.length,
    offset: start,
    limit: size,
    next_offset: start + page.length < segments.length ? start + page.length : null,
    segments: page,
  };
}

/** X1 写回：translations 形如 {"4": "教授姓名"}。 */
export async function applyTranslations(file, translations, { outDir } = {}) {
  const path = resolve(String(file || ""));
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  if (!translations || typeof translations !== "object") {
    throw new Error("translations 必须是 {id: 译文} 对象");
  }
  const dir = mkdtempSync(join(tmpdir(), "hwp-apply-"));
  const mapFile = join(dir, "translations.json");
  writeFileSync(mapFile, JSON.stringify({ translations }), "utf8");
  const args = ["--file", path, "--apply-json", mapFile];
  if (outDir) args.push("--output-dir", String(outDir));
  const stdout = await runCli(args);
  return parseJsonLine(stdout);
}

/** 兼容旧接口：用 exe 自己的网络模式翻译（需要 API Key）。 */
export async function runYeobaek(file, { target = "zh-CN", outDir, signal } = {}) {
  const path = resolve(String(file || ""));
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
  const args = ["--file", path, "--target-lang", target, "--json"];
  if (outDir) args.push("--output-dir", String(outDir));
  const stdout = await runCli(args, { signal });
  return parseJsonLine(stdout);
}

export { readFileSync };
