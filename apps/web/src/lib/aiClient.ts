import type { AiSettings } from "./aiSettings";

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

/**
 * 规范化 Base URL：去尾斜杠，并去掉末尾多余的 `/v1`
 *（避免用户填了 …/v1 后再拼 /v1/models 变成双 v1）。
 */
export function normalizeAiBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
  };
}

/**
 * 从 OpenAI 兼容中转拉取模型 id 列表（GET /v1/models）。
 * 浏览器直连，需 CORS。
 */
export async function listAiModels(options: {
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const base = normalizeAiBaseUrl(options.baseUrl);
  const apiKey = options.apiKey.trim();
  if (!base || !apiKey) {
    throw new AiClientError("请先填写 API 地址与密钥");
  }

  const url = `${base}/v1/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: options.signal,
      headers: authHeaders(apiKey),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AiClientError(
      `无法连接 new-api（${msg}）。请确认地址正确，且中转已允许本站 CORS。`,
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const t = await res.text();
      if (t) detail = t.slice(0, 300);
    } catch {
      // ignore
    }
    throw new AiClientError(`拉取模型列表失败：${detail}`, res.status);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new AiClientError("模型列表响应不是合法 JSON");
  }

  return parseModelsResponse(data);
}

/** 解析 OpenAI / new-api 的 models 响应为 id 列表（已排序、去重） */
export function parseModelsResponse(data: unknown): string[] {
  const ids = new Set<string>();

  const pushId = (raw: unknown) => {
    if (typeof raw === "string" && raw.trim()) ids.add(raw.trim());
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string") pushId(item);
      else if (item && typeof item === "object" && "id" in item) {
        pushId((item as { id: unknown }).id);
      }
    }
  } else if (data && typeof data === "object") {
    const root = data as { data?: unknown; models?: unknown };
    const list = Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.models)
        ? root.models
        : null;
    if (list) {
      for (const item of list) {
        if (typeof item === "string") pushId(item);
        else if (item && typeof item === "object" && "id" in item) {
          pushId((item as { id: unknown }).id);
        }
      }
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/**
 * 浏览器直连 OpenAI 兼容 Chat Completions（new-api），流式回调 onDelta。
 * 需中转配置 CORS 允许当前 Origin。
 */
export async function streamChatCompletion(options: {
  settings: AiSettings;
  messages: ChatMessage[];
  /** 覆盖 settings.model；创作台按「本书模型」生成时传入 */
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<string> {
  const { settings, messages, temperature = 0.85, signal, onDelta } = options;
  const base = normalizeAiBaseUrl(settings.baseUrl);
  const model = (options.model ?? settings.model).trim();
  if (!base || !settings.apiKey || !model) {
    throw new AiClientError("请先在设置中填写 API 地址、密钥与模型");
  }

  const url = `${base}/v1/chat/completions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(settings.apiKey),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: true,
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AiClientError(
      `无法连接 new-api（${msg}）。请确认地址正确，且中转已允许本站 CORS。`,
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const t = await res.text();
      if (t) detail = t.slice(0, 300);
    } catch {
      // ignore
    }
    throw new AiClientError(`模型请求失败：${detail}`, res.status);
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
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (typeof piece === "string" && piece) {
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
