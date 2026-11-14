// dsh-hwp-translate —— DSH 工具注册（只做接线，逻辑在 core.js）
//
// 三个工具：
//   hwp_extract  —— 抽取段落给**当前会话的模型**读（离线）
//   hwp_apply    —— 把模型给的译文写回文档（离线）
//   hwp_translate—— 兼容旧用法：让 exe 自己联网翻译（需要 API Key）
//
// `.hwp` 需要启动本机 한글 并通过 COM 打开文档，属于「操作外部程序」：
// 调用方必须先征得用户同意，再传 allow_hangul=true；否则返回
// HANGUL_PERMISSION_REQUIRED，让模型去问用户。

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

/** 把带 code/hint 的异常变成结构化结果，让模型能按码分支。 */
function asResult(error) {
  return {
    ok: false,
    code: error.code || "ERROR",
    hint: error.hint || "",
    error: String(error.message || error),
  };
}

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: "hwp_extract",
      description:
        "Read the translatable segments of a .hwp/.hwpx/.docx (Hangul) document as JSON " +
        "(id + source text). Use this first, translate the texts yourself, then call hwp_apply. " +
        "Offline; no API key. Paginated: pass offset to continue when next_offset is not null. " +
        "IMPORTANT: .hwp needs the local Hangul app driven over COM, which counts as operating " +
        "an external program - ask the user for permission first, then pass allow_hangul=true. " +
        "Without it the tool returns HANGUL_PERMISSION_REQUIRED. Windows only.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the .hwp, .hwpx or .docx file.",
        },
        offset: {
          type: "number",
          description: "Segment offset for pagination. Defaults to 0.",
        },
        limit: {
          type: "number",
          description: "Segments per page, 1-200. Defaults to 50.",
        },
        allow_hangul: {
          type: "boolean",
          description:
            "Set to true only after the user agreed to let an external program drive Hangul " +
            "(needed for legacy .hwp; .hwpx never needs it).",
        },
      },
      output: jsonOutput,
      async execute(args, exec) {
        try {
          return await extractDocument(args.path, {
            offset: args.offset,
            limit: args.limit,
            allowHangul: args.allow_hangul === true,
            signal: exec?.signal,
          });
        } catch (error) {
          return asResult(error);
        }
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
        "Write translations back into a .hwp/.hwpx/.docx (Hangul) document, keeping tables, " +
        "bullets and indentation, and return the output path. Input is {segment id: translation} " +
        "from hwp_extract. .hwp in -> .hwp out when Hangul is available. Offline; no API key. " +
        "IMPORTANT: .hwp drives the local Hangul app over COM - ask the user first, then pass " +
        "allow_hangul=true. Windows only.",
      parameters: {
        path: {
          type: "string",
          required: true,
          description: "Absolute path of the source .hwp, .hwpx or .docx file.",
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
        allow_hangul: {
          type: "boolean",
          description:
            "Set to true only after the user agreed to let an external program drive Hangul.",
        },
      },
      output: jsonOutput,
      async execute(args, exec) {
        try {
          return await applyTranslations(args.path, args.translations, {
            outDir: args.out_dir,
            allowHangul: args.allow_hangul === true,
            signal: exec?.signal,
          });
        } catch (error) {
          return asResult(error);
        }
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
        "Requires AI_API_KEY/AI_BASE_URL (the user's own key) - prefer hwp_extract + hwp_apply, " +
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
        try {
          return await runYeobaek(args.path, {
            target: args.target || "zh-CN",
            outDir: args.out_dir,
            signal: exec?.signal,
          });
        } catch (error) {
          return asResult(error);
        }
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
