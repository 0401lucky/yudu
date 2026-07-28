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
 * 浏览器直连 OpenAI 兼容 Chat Completions（new-api），流式回调 onDelta。
 * 需中转配置 CORS 允许当前 Origin。
 */
export async function streamChatCompletion(options: {
  settings: AiSettings;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<string> {
  const { settings, messages, temperature = 0.85, signal, onDelta } = options;
  const base = settings.baseUrl.replace(/\/$/, "");
  if (!base || !settings.apiKey || !settings.model) {
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
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
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
