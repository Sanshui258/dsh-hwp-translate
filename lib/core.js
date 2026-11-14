// dsh-hwp-translate —— 纯逻辑（不依赖 DSH），可在 Node 里单独测试。
//
// 翻译由**当前会话的模型**完成；插件只做两件本地事：
//   1) hwp_extract：把文档段落抽成 JSON 给模型看；
//   2) hwp_apply：把模型给的 {id: 译文} 写回文档。
// 两者都调用随包的 HWP_Translator.exe（X1 离线接口），全程不联网。
//
// 语言方向：抽取与写回都**与语言无关**——文档里是什么语言就抽什么，
// 译文是哪种语言由调用方（模型/用户）决定。`target_language` 只用于把
// 调用意图记录到返回值里，不改变读写行为。
//
// 注意：.hwp（旧二进制）需要启动本机 한글 并通过 COM 打开文档，属于
// 「操作外部程序」——必须由调用方显式传 allowHangul=true（应先征得用户同意）。

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLED_CLI = join(HERE, "..", "bin", "HWP_Translator.exe");
const IS_WINDOWS = process.platform === "win32";

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

function parseJson(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    /* pretty-printed 或带其它输出 */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/** 跑一次 exe；失败时若 stdout 里有结构化 JSON，把 code/hint 挂到 error 上。 */
export function runCli(args, { timeoutMs = 300000, signal } = {}) {
  const cli = requireCli();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cli, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      const err = new Error(`翻译器超过 ${Math.round(timeoutMs / 1000)}s 未返回`);
      err.code = "TIMEOUT";
      reject(err);
    }, timeoutMs);
    child.stdout.on("data", (b) => (stdout += b.toString("utf8")));
    child.stderr.on("data", (b) => (stderr += b.toString("utf8")));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const payload = parseJson(stdout);
      if (code === 0) {
        resolvePromise(payload ?? { ok: true });
        return;
      }
      const err = new Error(
        (payload && payload.error) || `翻译器退出码 ${code}: ${(stderr || stdout).slice(-300)}`
      );
      err.code = (payload && payload.code) || "EXIT_" + code;
      err.hint = (payload && payload.hint) || "";
      err.payload = payload;
      reject(err);
    });
  });
}

/** X1 抽取：{total, offset, limit, next_offset, segments, target_language?} */
export async function extractDocument(
  file,
  { offset = 0, limit = 50, allowHangul = false, targetLanguage = "" } = {}
) {
  const path = resolve(String(file || ""));
  if (!existsSync(path)) {
    const err = new Error(`文件不存在：${path}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  const args = ["--file", path, "--extract-json"];
  if (allowHangul) args.push("--allow-hangul");
  const payload = await runCli(args);
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  const start = Math.max(0, Math.min(segments.length, Number(offset) || 0));
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const page = segments.slice(start, start + size);
  return {
    source: payload.source || path,
    original_format: payload.original_format || "",
    notice: payload.notice || "",
    target_language: targetLanguage || "",
    total: segments.length,
    offset: start,
    limit: size,
    next_offset: start + page.length < segments.length ? start + page.length : null,
    segments: page,
  };
}

/** X1 写回：translations 形如 {"4": "教授姓名"}。 */
export async function applyTranslations(
  file,
  translations,
  { outDir, allowHangul = false, targetLanguage = "" } = {}
) {
  const path = resolve(String(file || ""));
  if (!existsSync(path)) {
    const err = new Error(`文件不存在：${path}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!translations || typeof translations !== "object") {
    const err = new Error("translations 必须是 {id: 译文} 对象");
    err.code = "BAD_MAP";
    throw err;
  }
  const dir = mkdtempSync(join(tmpdir(), "hwp-apply-"));
  const mapFile = join(dir, "translations.json");
  writeFileSync(mapFile, JSON.stringify({ translations }), "utf8");
  const args = ["--file", path, "--apply-json", mapFile];
  if (outDir) args.push("--output-dir", String(outDir));
  if (allowHangul) args.push("--allow-hangul");
  const result = await runCli(args);
  if (targetLanguage) result.target_language = targetLanguage;
  return result;
}
