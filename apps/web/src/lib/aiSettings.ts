/** 用户 new-api 配置：仅存浏览器本地 */

export const AI_SETTINGS_KEY = "yudu_ai_settings";
export const AI_MODELS_CACHE_KEY = "yudu_ai_models_cache";
export const ADULT_CONFIRMED_KEY = "yudu_adult_confirmed";

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 拉取到的模型列表缓存（与 baseUrl 绑定） */
export interface AiModelsCache {
  baseUrl: string;
  models: string[];
  fetchedAt: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "");
}

export function loadAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string"
          ? normalizeBaseUrl(parsed.baseUrl)
          : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model.trim() : "",
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  const next: AiSettings = {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
  };
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
}

/** 只改当前模型并立刻落盘（创作台切换用） */
export function setAiModel(model: string): AiSettings {
  const next = { ...loadAiSettings(), model: model.trim() };
  saveAiSettings(next);
  return next;
}

export function isAiSettingsReady(s: AiSettings = loadAiSettings()): boolean {
  return Boolean(s.baseUrl && s.apiKey && s.model);
}

export function loadAiModelsCache(): AiModelsCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(AI_MODELS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AiModelsCache>;
    if (!Array.isArray(parsed.models)) return null;
    const models = parsed.models
      .filter((m): m is string => typeof m === "string" && m.trim().length > 0)
      .map((m) => m.trim());
    if (!models.length) return null;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string"
          ? normalizeBaseUrl(parsed.baseUrl)
          : "",
      models,
      fetchedAt:
        typeof parsed.fetchedAt === "number" && Number.isFinite(parsed.fetchedAt)
          ? parsed.fetchedAt
          : 0,
    };
  } catch {
    return null;
  }
}

export function saveAiModelsCache(models: string[], baseUrl: string): AiModelsCache {
  const cache: AiModelsCache = {
    baseUrl: normalizeBaseUrl(baseUrl),
    models: [...new Set(models.map((m) => m.trim()).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "en", { sensitivity: "base" }),
    ),
    fetchedAt: Date.now(),
  };
  localStorage.setItem(AI_MODELS_CACHE_KEY, JSON.stringify(cache));
  return cache;
}

export function clearAiModelsCache(): void {
  localStorage.removeItem(AI_MODELS_CACHE_KEY);
}

/**
 * 当前设置下可用的模型列表：
 * - 优先返回与当前 baseUrl 匹配的缓存
 * - baseUrl 变了仍返回旧列表（方便临时看），调用方可用 isModelsCacheStale 提示
 */
export function getCachedModelsForSettings(
  settings: AiSettings = loadAiSettings(),
): { models: string[]; stale: boolean; fetchedAt: number } {
  const cache = loadAiModelsCache();
  if (!cache) return { models: [], stale: false, fetchedAt: 0 };
  const current = normalizeBaseUrl(settings.baseUrl);
  const stale = Boolean(current && cache.baseUrl && current !== cache.baseUrl);
  return { models: cache.models, stale, fetchedAt: cache.fetchedAt };
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
