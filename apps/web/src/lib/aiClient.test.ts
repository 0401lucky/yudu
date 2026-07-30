import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_MAX_TOKENS,
  buildAnthropicBody,
  buildGeminiBody,
  extractDelta,
  normalizeAiBaseUrl,
  parseGeminiModelsResponse,
  parseModelsResponse,
} from "./aiClient";

describe("normalizeAiBaseUrl", () => {
  it("去掉尾斜杠与末尾 /v1", () => {
    expect(normalizeAiBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeAiBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com",
    );
    expect(normalizeAiBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com",
    );
  });

  it("去掉末尾 /v1beta（Gemini 用户容易连版本段一起填）", () => {
    expect(normalizeAiBaseUrl("https://generativelanguage.googleapis.com/v1beta/")).toBe(
      "https://generativelanguage.googleapis.com",
    );
  });
});

describe("parseModelsResponse", () => {
  it("解析 OpenAI data 数组", () => {
    const ids = parseModelsResponse({
      data: [{ id: "gpt-4o" }, { id: "claude-3" }, { id: "gpt-4o" }],
    });
    expect(ids).toEqual(["claude-3", "gpt-4o"]);
  });

  it("解析 models 字段与纯数组", () => {
    expect(parseModelsResponse({ models: ["b", "a"] })).toEqual(["a", "b"]);
    expect(parseModelsResponse(["z", "y"])).toEqual(["y", "z"]);
  });

  it("非法结构返回空", () => {
    expect(parseModelsResponse(null)).toEqual([]);
    expect(parseModelsResponse({ foo: 1 })).toEqual([]);
  });
});

describe("parseGeminiModelsResponse", () => {
  it("剥掉 models/ 前缀并按 id 排序", () => {
    expect(
      parseGeminiModelsResponse({
        models: [
          { name: "models/gemini-2.5-pro" },
          { name: "models/gemini-2.0-flash" },
        ],
      }),
    ).toEqual(["gemini-2.0-flash", "gemini-2.5-pro"]);
  });

  it("过滤掉不支持 generateContent 的模型", () => {
    expect(
      parseGeminiModelsResponse({
        models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        ],
      }),
    ).toEqual(["gemini-2.0-flash"]);
  });

  it("非法结构返回空", () => {
    expect(parseGeminiModelsResponse({ data: [{ id: "x" }] })).toEqual([]);
    expect(parseGeminiModelsResponse(null)).toEqual([]);
  });
});

const MESSAGES = [
  { role: "system" as const, content: "你是小说家" },
  { role: "user" as const, content: "写开头" },
  { role: "assistant" as const, content: "从前" },
];

describe("buildGeminiBody", () => {
  it("system 提到 systemInstruction，assistant 映射为 model", () => {
    const body = buildGeminiBody(MESSAGES, 0.7);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "你是小说家" }] });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "写开头" }] },
      { role: "model", parts: [{ text: "从前" }] },
    ]);
    expect(body.generationConfig).toEqual({ temperature: 0.7 });
  });

  it("四类安全过滤全部关闭，避免正常情节被拦", () => {
    const settings = buildGeminiBody(MESSAGES, 0.7).safetySettings as Array<{
      threshold: string;
    }>;
    expect(settings).toHaveLength(4);
    expect(settings.every((s) => s.threshold === "BLOCK_NONE")).toBe(true);
  });

  it("没有 system 时不发 systemInstruction 字段", () => {
    const body = buildGeminiBody([{ role: "user", content: "hi" }], 0.5);
    expect(body).not.toHaveProperty("systemInstruction");
  });
});

describe("buildAnthropicBody", () => {
  it("system 提到顶层，max_tokens 必填", () => {
    const body = buildAnthropicBody("claude-x", MESSAGES, 0.7);
    expect(body.system).toBe("你是小说家");
    expect(body.max_tokens).toBe(ANTHROPIC_MAX_TOKENS);
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: "user", content: "写开头" },
      { role: "assistant", content: "从前" },
    ]);
  });
});

describe("extractDelta", () => {
  it("OpenAI 取 choices[0].delta.content", () => {
    expect(
      extractDelta("openai", { choices: [{ delta: { content: "甲" } }] }),
    ).toBe("甲");
    expect(extractDelta("openai", { choices: [{ delta: {} }] })).toBe("");
  });

  it("Gemini 拼接 candidates[0].content.parts", () => {
    expect(
      extractDelta("gemini", {
        candidates: [{ content: { parts: [{ text: "甲" }, { text: "乙" }] } }],
      }),
    ).toBe("甲乙");
    // 被安全策略拦截时没有 content 字段，不能抛错
    expect(extractDelta("gemini", { candidates: [{ finishReason: "SAFETY" }] })).toBe("");
  });

  it("Anthropic 只认 content_block_delta 的 text_delta", () => {
    expect(
      extractDelta("anthropic", {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "甲" },
      }),
    ).toBe("甲");
    expect(extractDelta("anthropic", { type: "message_start" })).toBe("");
    expect(
      extractDelta("anthropic", {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: "{" },
      }),
    ).toBe("");
  });

  it("非对象输入返回空串", () => {
    expect(extractDelta("openai", null)).toBe("");
    expect(extractDelta("gemini", "x")).toBe("");
  });
});
