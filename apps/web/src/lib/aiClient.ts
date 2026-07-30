import type { AiProtocol, AiProvider } from "./aiSettings";

export class AiClientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiClientError";
    this.status = status;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 官方固定地址的协议可留空 baseUrl；OpenAI 兼容中转必须用户自填 */
export const PROTOCOL_DEFAULT_BASE_URLS: Record<AiProtocol, string> = {
  openai: "",
  gemini: "https://generativelanguage.googleapis.com",
  anthropic: "https://api.anthropic.com",
};

/** Anthropic 的 max_tokens 是必填项；按整章正文的长度给足 */
export const ANTHROPIC_MAX_TOKENS = 8192;
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * 规范化 Base URL：去尾斜杠，并去掉末尾多余的版本段
 *（避免用户填了 …/v1 或 …/v1beta 后再拼路径变成双版本段）。
 */
export function normalizeAiBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1(beta)?$/i, "");
}

/** 取实际请求地址：用户填了用用户的，否则回落协议官方地址 */
function resolveBaseUrl(provider: AiProvider): string {
  return (
    normalizeAiBaseUrl(provider.baseUrl) ||
    PROTOCOL_DEFAULT_BASE_URLS[provider.protocol]
  );
}

/** 三个协议的鉴权头各不相同；Anthropic 浏览器直连还需显式放行 */
function protocolHeaders(provider: AiProvider): Record<string, string> {
  const apiKey = provider.apiKey.trim();
  switch (provider.protocol) {
    case "gemini":
      return { "x-goog-api-key": apiKey };
    case "anthropic":
      return {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        // 不带这个头，Anthropic 会直接拒绝来自浏览器的请求
        "anthropic-dangerous-direct-browser-access": "true",
      };
    default:
      return { Authorization: `Bearer ${apiKey}` };
  }
}

function connectError(err: unknown): AiClientError {
  const msg = err instanceof Error ? err.message : String(err);
  return new AiClientError(
    `无法连接 API（${msg}）。请确认地址正确，且服务端已允许本站 CORS。`,
  );
}

async function failureDetail(res: Response): Promise<string> {
  try {
    const t = await res.text();
    if (t) return t.slice(0, 300);
  } catch {
    // 读不出正文就用状态文本
  }
  return res.statusText;
}

/**
 * 拉取该提供商可用的模型 id 列表。浏览器直连，需 CORS。
 * 路径与响应形状按协议分发，返回值统一为已排序去重的 id 数组。
 */
export async function listAiModels(options: {
  provider: AiProvider;
  signal?: AbortSignal;
}): Promise<string[]> {
  const { provider, signal } = options;
  const base = resolveBaseUrl(provider);
  const apiKey = provider.apiKey.trim();
  if (!base || !apiKey) {
    throw new AiClientError("请先填写 API 地址与密钥");
  }

  const url =
    provider.protocol === "gemini" ? `${base}/v1beta/models` : `${base}/v1/models`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal,
      headers: protocolHeaders(provider),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw connectError(err);
  }

  if (!res.ok) {
    throw new AiClientError(`拉取模型列表失败：${await failureDetail(res)}`, res.status);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new AiClientError("模型列表响应不是合法 JSON");
  }

  return provider.protocol === "gemini"
    ? parseGeminiModelsResponse(data)
    : parseModelsResponse(data);
}

function sortIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

/** 解析 OpenAI / new-api / Anthropic 的 models 响应为 id 列表（已排序、去重） */
export function parseModelsResponse(data: unknown): string[] {
  const ids = new Set<string>();

  const pushId = (raw: unknown) => {
    if (typeof raw === "string" && raw.trim()) ids.add(raw.trim());
  };

  const collect = (list: unknown[]) => {
    for (const item of list) {
      if (typeof item === "string") pushId(item);
      else if (item && typeof item === "object" && "id" in item) {
        pushId((item as { id: unknown }).id);
      }
    }
  };

  if (Array.isArray(data)) {
    collect(data);
  } else if (data && typeof data === "object") {
    const root = data as { data?: unknown; models?: unknown };
    const list = Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.models)
        ? root.models
        : null;
    if (list) collect(list);
  }

  return sortIds(ids);
}

/**
 * 解析 Gemini 的 `GET /v1beta/models` 响应。
 * 与 OpenAI 的差异：id 在 `name` 里且带 `models/` 前缀，
 * 且列表混有仅支持 embedding 的模型——按 `supportedGenerationMethods` 过滤掉。
 */
export function parseGeminiModelsResponse(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const list = (data as { models?: unknown }).models;
  if (!Array.isArray(list)) return [];

  const ids = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const m = item as { name?: unknown; supportedGenerationMethods?: unknown };
    if (typeof m.name !== "string" || !m.name.trim()) continue;
    if (
      Array.isArray(m.supportedGenerationMethods) &&
      !m.supportedGenerationMethods.includes("generateContent")
    ) {
      continue;
    }
    ids.add(m.name.trim().replace(/^models\//, ""));
  }
  return sortIds(ids);
}

/** 从消息里分出顶层 system 文本与其余对话（Gemini / Anthropic 都要求这样分） */
function splitSystem(messages: ChatMessage[]): {
  system: string;
  rest: ChatMessage[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  return { system, rest: messages.filter((m) => m.role !== "system") };
}

/**
 * Gemini 的安全过滤：创作台是长篇小说生成场景，
 * 默认阈值会把大量正常的冲突/暴力情节判为拦截，故全部设为 BLOCK_NONE。
 * 破限与否由提示词侧控制，不在这里做二次限制。
 */
const GEMINI_SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_NONE" }));

export function buildGeminiBody(
  messages: ChatMessage[],
  temperature: number,
): Record<string, unknown> {
  const { system, rest } = splitSystem(messages);
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: rest.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature },
    safetySettings: GEMINI_SAFETY_SETTINGS,
  };
}

export function buildAnthropicBody(
  model: string,
  messages: ChatMessage[],
  temperature: number,
): Record<string, unknown> {
  const { system, rest } = splitSystem(messages);
  return {
    model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: rest.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    temperature,
    stream: true,
  };
}

/** 从一个 SSE data 包里取出增量文本；非文本包（心跳、用量统计等）返回空串 */
export function extractDelta(protocol: AiProtocol, json: unknown): string {
  if (!json || typeof json !== "object") return "";

  if (protocol === "gemini") {
    const parts = (
      json as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
      }
    ).candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  }

  if (protocol === "anthropic") {
    const evt = json as { type?: unknown; delta?: { type?: unknown; text?: unknown } };
    if (evt.type !== "content_block_delta") return "";
    if (evt.delta?.type !== "text_delta") return "";
    return typeof evt.delta.text === "string" ? evt.delta.text : "";
  }

  const piece = (json as { choices?: Array<{ delta?: { content?: unknown } }> })
    .choices?.[0]?.delta?.content;
  return typeof piece === "string" ? piece : "";
}

/**
 * 浏览器直连各家的流式对话接口，逐段回调 onDelta，返回完整文本。
 * 需要目标服务允许当前 Origin 的 CORS。
 */
export async function streamChatCompletion(options: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<string> {
  const { provider, messages, temperature = 0.85, signal, onDelta } = options;
  const base = resolveBaseUrl(provider);
  const model = options.model.trim();
  if (!base || !provider.apiKey || !model) {
    throw new AiClientError("请先在设置中添加 AI 提供商并选择模型");
  }

  let url: string;
  let body: Record<string, unknown>;
  switch (provider.protocol) {
    case "gemini":
      // alt=sse 才是逐包的 SSE；不带它 Gemini 返回一整个 JSON 数组
      url = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      body = buildGeminiBody(messages, temperature);
      break;
    case "anthropic":
      url = `${base}/v1/messages`;
      body = buildAnthropicBody(model, messages, temperature);
      break;
    default:
      url = `${base}/v1/chat/completions`;
      body = { model, messages, temperature, stream: true };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...protocolHeaders(provider),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw connectError(err);
  }

  if (!res.ok) {
    throw new AiClientError(`模型请求失败：${await failureDetail(res)}`, res.status);
  }

  if (!res.body) {
    throw new AiClientError("响应无正文流");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      // 空行、注释心跳、Anthropic 的 `event:` 行都不含数据
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const piece = extractDelta(provider.protocol, JSON.parse(data));
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch {
        // 忽略非整包 JSON 行
      }
    }
  }

  return full;
}
