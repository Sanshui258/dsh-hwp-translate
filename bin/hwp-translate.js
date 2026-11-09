#!/usr/bin/env node
// 命令行入口：不依赖 DSH 插件 API，先把手动测试跑通。
//   hwp-translate "C:\示例\문서.hwp" --target zh-CN --out-dir "C:\示例\out"
import { resolve } from "node:path";
import { runYeobaek, findCli } from "../lib/index.js";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "用法: hwp-translate <文件.hwp|.hwpx> [--target zh-CN] [--out-dir 目录]",
      "",
      "需要本机安装 Yeobaek Translator，或设置 YEOBAEK_CLI 指向 PPT_Translator_CLI.exe",
      findCli() ? `已找到 CLI: ${findCli()}` : "当前未找到 CLI",
    ].join("\n")
  );
  process.exit(args.length ? 0 : 1);
}

const file = resolve(args[0]);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

try {
  const result = await runYeobaek(file, {
    target: flag("--target", "zh-CN"),
    outDir: flag("--out-dir"),
  });
  console.log(result.stdout.trim());
} catch (error) {
  console.error(String(error.message || error));
  process.exit(1);
}
