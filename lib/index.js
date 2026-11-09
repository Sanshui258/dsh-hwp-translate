// dsh-hwp-translate —— DSH 工具注册（只做接线，逻辑在 core.js）
//
// 三个工具：
//   hwp_extract  —— 抽取段落给**当前会话的模型**读（不联网）
//   hwp_apply    —— 把模型给的译文写回文档（不联网）
//   hwp_translate—— 兼容旧用法：让 exe 自己联网翻译（需要 API Key，可选）
//
// 这样做的好处：翻译由宿主模型完成，用户**不需要单独配 API Key**。

import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  applyTranslations,
  extractDocument,
  runYeobaek,
} from "./core.js";

export const name = "hwp-translate";
export const inject = ["tools"];

const jsonOutput = {
  schema: { type: "json" },
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
};

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: "hwp_extract",
      description:
        "Read the translatable segments of a .hwp/.hwpx (Hangul) document as JSON " +
        "(id + Korean/English text). Use this first, then translate the texts yourself, then call " +
        "hwp_apply with {id: translation}. Offline; no API key. Paginated: pass offset to continue " +
        "when next_offset is not null. Windows only.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the .hwp or .hwpx file.",
        },
        offset: {
          type: "number",
          description: "Segment offset for pagination. Defaults to 0.",
        },
        limit: {
          type: "number",
          description: "Segments per page, 1-200. Defaults to 50.",
        },
      },
      output: jsonOutput,
      async execute(args, exec) {
        return extractDocument(args.path, {
          offset: args.offset,
          limit: args.limit,
          signal: exec?.signal,
        });
      },
      presentCall(args) {
        return {
          card: "generic",
          kind: "read",
          title: `Read HWP segments ${args?.path || ""}`,
        };
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: "hwp_apply",
      description:
        "Write translations back into a .hwp/.hwpx (Hangul) document, keeping tables, bullets and " +
        "indentation, and return the output path. Input is an object {segment id: translation} " +
        "obtained from hwp_extract. Offline; no API key. Windows only.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the source .hwp or .hwpx file.",
        },
        translations: {
          type: "json",
          required: true,
          description: 'Object mapping segment ids to translated text, e.g. {"4": "教授姓名"}.',
        },
        out_dir: {
          type: "string",
          description: "Optional output directory; defaults to the file's own directory.",
        },
      },
      output: jsonOutput,
      async execute(args, exec) {
        return applyTranslations(args.path, args.translations, {
          outDir: args.out_dir,
          signal: exec?.signal,
        });
      },
      presentCall(args) {
        return {
          card: "generic",
          kind: "write",
          title: `Write HWP translations ${args?.path || ""}`,
        };
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: "hwp_translate",
      description:
        "Legacy one-shot mode: let the bundled translator call an OpenAI-compatible API itself. " +
        "Requires AI_API_KEY/AI_BASE_URL (the user's own key) — prefer hwp_extract + hwp_apply, " +
        "which use the current session's model and need no key.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the .hwp or .hwpx file.",
        },
        target: {
          type: "string",
          description: "Target language code. Defaults to zh-CN.",
        },
        out_dir: {
          type: "string",
          description: "Optional output directory.",
        },
      },
      output: jsonOutput,
      async execute(args, exec) {
        return runYeobaek(args.path, {
          target: args.target || "zh-CN",
          outDir: args.out_dir,
          signal: exec?.signal,
        });
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
