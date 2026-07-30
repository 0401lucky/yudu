/**
 * 用户 AI 提供商配置：仅存浏览器本地，不上传雨读服务器。
 * 支持多套配置（自建中转 / 官方 API），每套记住自己的协议、地址、密钥与模型列表。
 */

export const AI_SETTINGS_KEY = "yudu_ai_settings";
/** 旧版单套配置的模型缓存键；迁移后清除，保留常量供迁移与测试引用 */
export const AI_MODELS_CACHE_KEY = "yudu_ai_models_cache";
export const ADULT_CONFIRMED_KEY = "yudu_adult_confirmed";

/** 请求协议；决定 aiClient 如何构造请求与解析流式响应 */
export type AiProtocol = "openai" | "gemini" | "anthropic";

export const AI_PROTOCOL_LABELS: Record<AiProtocol, string> = {
  openai: "OpenAI 兼容",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
};

export interface AiProvider {
  /** 稳定 id，创建时生成；书级绑定引用它 */
  id: string;
  /** 用户自定义名称，如「我的中转」「Google 官方」 */
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  /** 该提供商独立的模型列表缓存 */
  models: string[];
  /** 模型列表拉取时间；0 表示从未拉取 */
  modelsFetchedAt: number;
}

export interface AiSettings {
  providers: AiProvider[];
  /** 全局默认；新建作品与未绑定的书回退到这里 */
  defaultProviderId?: string;
  defaultModel?: string;
}

export const EMPTY_AI_SETTINGS: AiSettings = { providers: [] };

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");
}

function sortModels(models: string[]): string[] {
  return [...new Set(models.map((m) => m.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

function normalizeProtocol(raw: unknown): AiProtocol {
  return raw === "gemini" || raw === "anthropic" ? raw : "openai";
}

/** 归一化单个提供商；缺 id 视为非法项由调用方丢弃 */
function normalizeProvider(raw: unknown): AiProvider | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<AiProvider>;
  if (typeof p.id !== "string" || !p.id) return null;
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name ? p.name : "未命名提供商",
    protocol: normalizeProtocol(p.protocol),
    baseUrl: typeof p.baseUrl === "string" ? normalizeBaseUrl(p.baseUrl) : "",
    apiKey: typeof p.apiKey === "string" ? p.apiKey.trim() : "",
    models: Array.isArray(p.models) ? sortModels(p.models.filter((m): m is string => typeof m === "string")) : [],
    modelsFetchedAt:
      typeof p.modelsFetchedAt === "number" && Number.isFinite(p.modelsFetchedAt)
        ? p.modelsFetchedAt
        : 0,
  };
}

/** 旧版单套配置的形状 */
interface LegacyAiSettings {
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
}

/**
 * 把旧版 `{baseUrl, apiKey, model}` + 独立模型缓存迁移成一个「默认」提供商。
 * 字段全空时返回 null（全新用户，没什么可迁的）。
 */
function migrateLegacy(legacy: LegacyAiSettings): AiSettings | null {
  const baseUrl = typeof legacy.baseUrl === "string" ? normalizeBaseUrl(legacy.baseUrl) : "";
  const apiKey = typeof legacy.apiKey === "string" ? legacy.apiKey.trim() : "";
  const model = typeof legacy.model === "string" ? legacy.model.trim() : "";
  if (!baseUrl && !apiKey && !model) return null;

  let models: string[] = [];
  let modelsFetchedAt = 0;
  try {
    const rawCache = localStorage.getItem(AI_MODELS_CACHE_KEY);
    if (rawCache) {
      const cache = JSON.parse(rawCache) as { models?: unknown; fetchedAt?: unknown };
      if (Array.isArray(cache.models)) {
        models = sortModels(cache.models.filter((m): m is string => typeof m === "string"));
      }
      if (typeof cache.fetchedAt === "number" && Number.isFinite(cache.fetchedAt)) {
        modelsFetchedAt = cache.fetchedAt;
      }
    }
  } catch {
    // 缓存损坏就当没有，不影响主配置迁移
  }

  const id = crypto.randomUUID();
  return {
    providers: [
      { id, name: "默认", protocol: "openai", baseUrl, apiKey, models, modelsFetchedAt },
    ],
    defaultProviderId: id,
    defaultModel: model || undefined,
  };
}

/**
 * 读取设置；遇到旧格式自动迁移并回写，调用方永远拿到新格式。
 * 迁移放在读取入口而非独立函数，保证任何路径进来都已是新格式。
 */
export function loadAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...EMPTY_AI_SETTINGS };
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return { ...EMPTY_AI_SETTINGS };
    parsed = JSON.parse(raw);
  } catch {
    return { ...EMPTY_AI_SETTINGS };
  }
  if (!parsed || typeof parsed !== "object") return { ...EMPTY_AI_SETTINGS };

  const obj = parsed as Partial<AiSettings> & LegacyAiSettings;

  if (Array.isArray(obj.providers)) {
    const providers = obj.providers
      .map(normalizeProvider)
      .filter((p): p is AiProvider => p != null);
    const defaultProviderId =
      typeof obj.defaultProviderId === "string" &&
      providers.some((p) => p.id === obj.defaultProviderId)
        ? obj.defaultProviderId
        : undefined;
    return {
      providers,
      defaultProviderId,
      defaultModel:
        defaultProviderId && typeof obj.defaultModel === "string" && obj.defaultModel
          ? obj.defaultModel
          : undefined,
    };
  }

  const migrated = migrateLegacy(obj);
  if (!migrated) return { ...EMPTY_AI_SETTINGS };
  saveAiSettings(migrated);
  localStorage.removeItem(AI_MODELS_CACHE_KEY);
  return migrated;
}

export function saveAiSettings(settings: AiSettings): AiSettings {
  const providers = settings.providers
    .map(normalizeProvider)
    .filter((p): p is AiProvider => p != null);
  const defaultProviderId = providers.some((p) => p.id === settings.defaultProviderId)
    ? settings.defaultProviderId
    : undefined;
  const next: AiSettings = {
    providers,
    defaultProviderId,
    defaultModel: defaultProviderId ? settings.defaultModel?.trim() || undefined : undefined,
  };
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** 新建一个提供商；首个自动成为默认 */
export function addProvider(
  provider: AiProvider,
  settings: AiSettings = loadAiSettings(),
): AiSettings {
  const providers = [...settings.providers, provider];
  return saveAiSettings({
    ...settings,
    providers,
    defaultProviderId: settings.defaultProviderId ?? provider.id,
  });
}

export function updateProvider(
  id: string,
  patch: Partial<Omit<AiProvider, "id">>,
  settings: AiSettings = loadAiSettings(),
): AiSettings {
  return saveAiSettings({
    ...settings,
    providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

/** 删除提供商；删掉的若是默认，默认指向一并清空 */
export function removeProvider(
  id: string,
  settings: AiSettings = loadAiSettings(),
): AiSettings {
  const providers = settings.providers.filter((p) => p.id !== id);
  const wasDefault = settings.defaultProviderId === id;
  return saveAiSettings({
    providers,
    defaultProviderId: wasDefault ? undefined : settings.defaultProviderId,
    defaultModel: wasDefault ? undefined : settings.defaultModel,
  });
}

/** 设置全局默认的提供商与模型 */
export function setDefaultModel(
  providerId: string,
  model: string,
  settings: AiSettings = loadAiSettings(),
): AiSettings {
  return saveAiSettings({ ...settings, defaultProviderId: providerId, defaultModel: model });
}

/** 把新拉取的模型列表写回某个提供商 */
export function setProviderModels(
  id: string,
  models: string[],
  settings: AiSettings = loadAiSettings(),
): AiSettings {
  return updateProvider(
    id,
    { models: sortModels(models), modelsFetchedAt: Date.now() },
    settings,
  );
}

/**
 * 解析某本书实际要用的提供商与模型。
 * 书未绑定、或绑定的提供商已被删除时回退到全局默认；无法解析返回 null。
 */
export function resolveProvider(
  settings: AiSettings = loadAiSettings(),
  bookProviderId?: string,
  bookModel?: string,
): { provider: AiProvider; model: string } | null {
  const byBook = bookProviderId
    ? settings.providers.find((p) => p.id === bookProviderId)
    : undefined;
  const provider =
    byBook ?? settings.providers.find((p) => p.id === settings.defaultProviderId);
  if (!provider || !provider.baseUrl || !provider.apiKey) return null;

  // 绑定命中才用书的模型；回退到默认提供商时用默认模型
  const model = (byBook ? bookModel : undefined)?.trim() || settings.defaultModel?.trim();
  if (!model) return null;
  return { provider, model };
}

export function isAiSettingsReady(settings: AiSettings = loadAiSettings()): boolean {
  return resolveProvider(settings) != null;
}

export function isAdultConfirmed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(ADULT_CONFIRMED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdultConfirmed(confirmed = true): void {
  localStorage.setItem(ADULT_CONFIRMED_KEY, confirmed ? "1" : "0");
}
