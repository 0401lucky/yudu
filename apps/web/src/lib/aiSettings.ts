/**
 * 用户 AI 提供商配置：**跟随账号存服务端**，密钥经 AES-GCM 加密后落库。
 *
 * 本地只留一份不含密钥的缓存（`yudu_ai_settings_cache`）供首屏同步渲染，
 * 明文密钥仅在即将调用第三方 AI 接口前按需取回并缓存在内存。
 *
 * 注意两个 localStorage 键职责不同、**不可合并**：
 * `yudu_ai_settings` 是旧版明文配置，只作迁移来源；缓存写入另一个键，
 * 否则迁移检测会把自己写的缓存当成待迁移数据，陷入重复上传。
 */

import type { AiProtocol, AiProviderMeta, AiSettingsDto } from "@yudu/shared";
import {
  createAiProvider,
  deleteAiProvider,
  getAiProviderKey,
  getAiSettings,
  patchAiProvider,
  putAiDefaults,
} from "./api";

export type { AiProtocol, AiProviderMeta };

/** 旧版本地明文配置键；仅作迁移来源，迁移成功后删除 */
export const LEGACY_AI_SETTINGS_KEY = "yudu_ai_settings";
/** 更旧的单套配置的模型缓存键；随迁移一并清理 */
export const LEGACY_AI_MODELS_CACHE_KEY = "yudu_ai_models_cache";
/** 首屏缓存键；只含掩码，**绝不**写入明文密钥 */
export const AI_SETTINGS_CACHE_KEY = "yudu_ai_settings_cache";
export const ADULT_CONFIRMED_KEY = "yudu_adult_confirmed";

/** 配置变更广播事件；跨组件同步用 */
export const AI_SETTINGS_CHANGED_EVENT = "yudu-ai-settings-changed";

export const AI_PROTOCOL_LABELS: Record<AiProtocol, string> = {
  openai: "OpenAI 兼容",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
};

/** 发起 AI 请求时用的完整提供商：列表态的 meta 加上按需取回的明文密钥 */
export interface AiProvider extends AiProviderMeta {
  apiKey: string;
}

export interface AiSettings {
  providers: AiProviderMeta[];
  /** 全局默认；新建作品与未绑定的书回退到这里 */
  defaultProviderId?: string;
  defaultModel?: string;
}

export const EMPTY_AI_SETTINGS: AiSettings = { providers: [] };

/* —— 纯逻辑（与存储位置无关，可直接单测） —— */

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1(beta)?$/i, "");
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
export function normalizeProviderMeta(raw: unknown): AiProviderMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<AiProviderMeta>;
  if (typeof p.id !== "string" || !p.id) return null;
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name ? p.name : "未命名提供商",
    protocol: normalizeProtocol(p.protocol),
    baseUrl: typeof p.baseUrl === "string" ? normalizeBaseUrl(p.baseUrl) : "",
    keyMask: typeof p.keyMask === "string" ? p.keyMask : "",
    models: Array.isArray(p.models)
      ? sortModels(p.models.filter((m): m is string => typeof m === "string"))
      : [],
    modelsFetchedAt:
      typeof p.modelsFetchedAt === "number" && Number.isFinite(p.modelsFetchedAt)
        ? p.modelsFetchedAt
        : 0,
  };
}

/** 归一化整份配置：丢弃非法项，默认指向不存在的提供商时一并清空 */
export function normalizeSettings(raw: unknown): AiSettings {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AI_SETTINGS };
  const obj = raw as Partial<AiSettings>;
  const providers = Array.isArray(obj.providers)
    ? obj.providers
        .map(normalizeProviderMeta)
        .filter((p): p is AiProviderMeta => p != null)
    : [];
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

/**
 * 是否已配好凭证。判据是掩码而非明文——列表态本来就拿不到明文，
 * 有掩码即说明服务端存着密钥。
 * OpenAI 兼容中转必须自填地址；Gemini / Anthropic 留空时走各自官方地址。
 */
export function hasCredentials(p: AiProviderMeta): boolean {
  return (
    Boolean(p.keyMask.trim()) &&
    (p.protocol !== "openai" || Boolean(p.baseUrl.trim()))
  );
}

/**
 * 解析某本书实际要用的提供商与模型。
 * 书未绑定、或绑定的提供商已被删除时回退到全局默认；无法解析返回 null。
 */
export function resolveProvider(
  settings: AiSettings = getCachedAiSettings(),
  bookProviderId?: string,
  bookModel?: string,
): { provider: AiProviderMeta; model: string } | null {
  const byBook = bookProviderId
    ? settings.providers.find((p) => p.id === bookProviderId)
    : undefined;
  const provider =
    byBook ?? settings.providers.find((p) => p.id === settings.defaultProviderId);
  if (!provider || !hasCredentials(provider)) return null;

  // 绑定命中才用书的模型；回退到默认提供商时用默认模型
  const model = (byBook ? bookModel : undefined)?.trim() || settings.defaultModel?.trim();
  if (!model) return null;
  return { provider, model };
}

export function isAiSettingsReady(settings: AiSettings = getCachedAiSettings()): boolean {
  return resolveProvider(settings) != null;
}

/* —— 本地缓存（不含明文密钥） —— */

function dtoToSettings(dto: AiSettingsDto): AiSettings {
  return normalizeSettings({
    providers: dto.providers,
    defaultProviderId: dto.defaultProviderId ?? undefined,
    defaultModel: dto.defaultModel ?? undefined,
  });
}

/** 同步读缓存供首屏渲染；无缓存或损坏返回空配置 */
export function getCachedAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...EMPTY_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(AI_SETTINGS_CACHE_KEY);
    if (!raw) return { ...EMPTY_AI_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...EMPTY_AI_SETTINGS };
  }
}

function writeCache(settings: AiSettings): AiSettings {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(AI_SETTINGS_CACHE_KEY, JSON.stringify(settings));
    } catch {
      // 缓存写不进去（隐私模式 / 配额满）不影响主流程，下次仍从服务端拉
    }
  }
  return settings;
}

/** 广播给其他组件（如创作台的模型选择器）重新读缓存 */
export function notifyAiSettingsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
  }
}

/* —— 明文密钥（按需取，内存缓存） —— */

const keyCache = new Map<string, string>();

/** 取明文密钥；同一提供商在本次会话内只请求一次 */
export async function getProviderKey(id: string): Promise<string> {
  const cached = keyCache.get(id);
  if (cached !== undefined) return cached;
  const key = await getAiProviderKey(id);
  keyCache.set(id, key);
  return key;
}

/** 提供商改动或登出后作废内存中的明文密钥 */
export function clearProviderKeyCache(id?: string): void {
  if (id) keyCache.delete(id);
  else keyCache.clear();
}

/**
 * 登出时整体清理：内存密钥、本地缓存与迁移标记一并复位，
 * 避免换账号后首屏串到上一个账号的提供商列表。
 */
export function resetAiSettingsState(): void {
  clearProviderKeyCache();
  legacyChecked = false;
  pendingLegacy = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(AI_SETTINGS_CACHE_KEY);
  }
}

/** 组装可直接交给 aiClient 的完整提供商 */
export async function withApiKey(provider: AiProviderMeta): Promise<AiProvider> {
  return { ...provider, apiKey: await getProviderKey(provider.id) };
}

/* —— 旧版本地配置迁移 —— */

interface LegacyProvider {
  id: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  models: string[];
  modelsFetchedAt: number;
}

interface LegacySnapshot {
  providers: LegacyProvider[];
  defaultProviderId?: string;
  defaultModel?: string;
}

/** 已尝试过自动迁移；防止 StrictMode 双调用或并发入口重复上传 */
let legacyChecked = false;
/** 云端已有配置、本地还剩下的旧数据；设置页据此提示手动导入 */
let pendingLegacy: LegacySnapshot | null = null;

function normalizeLegacyProvider(raw: unknown): LegacyProvider | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<LegacyProvider>;
  if (typeof p.id !== "string" || !p.id) return null;
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name ? p.name : "未命名提供商",
    protocol: normalizeProtocol(p.protocol),
    baseUrl: typeof p.baseUrl === "string" ? normalizeBaseUrl(p.baseUrl) : "",
    apiKey: typeof p.apiKey === "string" ? p.apiKey.trim() : "",
    models: Array.isArray(p.models)
      ? sortModels(p.models.filter((m): m is string => typeof m === "string"))
      : [],
    modelsFetchedAt:
      typeof p.modelsFetchedAt === "number" && Number.isFinite(p.modelsFetchedAt)
        ? p.modelsFetchedAt
        : 0,
  };
}

/**
 * 读本地旧配置。同时兼容两代格式：
 * 多提供商 `{providers:[…]}`，以及更早的单套 `{baseUrl, apiKey, model}`。
 */
export function readLegacyAiSettings(): LegacySnapshot | null {
  if (typeof localStorage === "undefined") return null;
  let parsed: unknown;
  try {
    const raw = localStorage.getItem(LEGACY_AI_SETTINGS_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as {
    providers?: unknown;
    baseUrl?: unknown;
    apiKey?: unknown;
    model?: unknown;
    defaultProviderId?: unknown;
    defaultModel?: unknown;
  };

  if (Array.isArray(obj.providers)) {
    const providers = obj.providers
      .map(normalizeLegacyProvider)
      .filter((p): p is LegacyProvider => p != null);
    return {
      providers,
      defaultProviderId:
        typeof obj.defaultProviderId === "string" ? obj.defaultProviderId : undefined,
      defaultModel:
        typeof obj.defaultModel === "string" ? obj.defaultModel : undefined,
    };
  }

  // 最早的单套格式：并成一个名为「默认」的提供商，模型列表让用户重新拉
  const baseUrl = typeof obj.baseUrl === "string" ? normalizeBaseUrl(obj.baseUrl) : "";
  const apiKey = typeof obj.apiKey === "string" ? obj.apiKey.trim() : "";
  const model = typeof obj.model === "string" ? obj.model.trim() : "";
  if (!baseUrl && !apiKey && !model) return { providers: [] };

  const id = crypto.randomUUID();
  return {
    providers: [
      { id, name: "默认", protocol: "openai", baseUrl, apiKey, models: [], modelsFetchedAt: 0 },
    ],
    defaultProviderId: id,
    defaultModel: model || undefined,
  };
}

function clearLegacy(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LEGACY_AI_SETTINGS_KEY);
  localStorage.removeItem(LEGACY_AI_MODELS_CACHE_KEY);
  pendingLegacy = null;
}

/**
 * 把旧配置逐条上传。**全部成功才返回 true**——部分失败时保留本地数据下次重试，
 * 宁可重复提示也不能丢配置（同 `useBookmarks` 的书签迁移口径）。
 * 原样带上 id：`books.studio_provider_id` 引用着它们，换 id 会让已绑定的书失效。
 */
async function uploadLegacy(snapshot: LegacySnapshot): Promise<boolean> {
  let allOk = true;
  for (const p of snapshot.providers) {
    try {
      await createAiProvider({
        id: p.id,
        name: p.name,
        protocol: p.protocol,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        models: p.models,
        modelsFetchedAt: p.modelsFetchedAt,
      });
    } catch {
      allOk = false;
    }
  }

  if (allOk && snapshot.defaultProviderId) {
    try {
      await putAiDefaults({
        defaultProviderId: snapshot.defaultProviderId,
        defaultModel: snapshot.defaultModel ?? null,
      });
    } catch {
      allOk = false;
    }
  }
  return allOk;
}

/** 云端已有配置时，本机还剩多少条未同步的旧配置 */
export function getPendingLegacyCount(): number {
  return pendingLegacy?.providers.length ?? 0;
}

/** 手动把本机残留的旧配置并入账号 */
export async function importLegacyProviders(): Promise<AiSettings> {
  const snapshot = pendingLegacy;
  if (!snapshot) return getCachedAiSettings();

  const ok = await uploadLegacy(snapshot);
  if (ok) clearLegacy();

  const settings = dtoToSettings(await getAiSettings());
  writeCache(settings);
  notifyAiSettingsChanged();
  if (!ok) throw new Error("部分配置导入失败，请重试");
  return settings;
}

/** 放弃本机残留的旧配置 */
export function discardLegacyProviders(): void {
  clearLegacy();
  notifyAiSettingsChanged();
}

/* —— 服务端读写 —— */

/**
 * 从服务端拉取完整配置并刷新缓存。首次调用时顺带处理旧数据迁移：
 * 云端为空则静默上传本机旧配置，云端已有则挂起等用户决定。
 */
export async function fetchAiSettings(): Promise<AiSettings> {
  let settings = dtoToSettings(await getAiSettings());

  if (!legacyChecked) {
    legacyChecked = true;
    const legacy = readLegacyAiSettings();
    if (legacy && legacy.providers.length > 0) {
      if (settings.providers.length === 0) {
        if (await uploadLegacy(legacy)) {
          clearLegacy();
          settings = dtoToSettings(await getAiSettings());
        } else {
          pendingLegacy = legacy;
        }
      } else {
        pendingLegacy = legacy;
      }
    } else if (legacy) {
      // 空的或已损坏的旧数据没有迁移价值，直接清掉
      clearLegacy();
    }
  }

  writeCache(settings);
  // 缓存已刷新，广播给同页面其他组件（如创作台列表页的「AI 就绪」判断）
  notifyAiSettingsChanged();
  return settings;
}

/** 用服务端返回的最新 meta 就地更新缓存，省掉一次全量拉取 */
function mergeProvider(meta: AiProviderMeta): AiSettings {
  const current = getCachedAiSettings();
  const exists = current.providers.some((p) => p.id === meta.id);
  const providers = exists
    ? current.providers.map((p) => (p.id === meta.id ? meta : p))
    : [...current.providers, meta];
  const next = normalizeSettings({ ...current, providers });
  writeCache(next);
  notifyAiSettingsChanged();
  return next;
}

export interface ProviderDraft {
  id?: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  models?: string[];
  modelsFetchedAt?: number;
}

/** 新建提供商；账号内首个自动成为默认 */
export async function addProvider(draft: ProviderDraft): Promise<AiSettings> {
  const meta = await createAiProvider({
    id: draft.id,
    name: draft.name,
    protocol: draft.protocol,
    // 提交前就规范化，避免库里存着 `…/v1/` 这类未归一的地址
    baseUrl: normalizeBaseUrl(draft.baseUrl),
    apiKey: draft.apiKey,
    models: draft.models ?? [],
    modelsFetchedAt: draft.modelsFetchedAt ?? 0,
  });

  let next = mergeProvider(meta);
  if (!next.defaultProviderId) {
    next = await setDefaultModel(meta.id, meta.models[0] ?? "");
  }
  return next;
}

/** 更新提供商；`apiKey` 缺省表示保留原密钥 */
export async function updateProvider(
  id: string,
  patch: Partial<Omit<ProviderDraft, "id">>,
): Promise<AiSettings> {
  const meta = await patchAiProvider(id, {
    ...patch,
    ...(patch.baseUrl !== undefined
      ? { baseUrl: normalizeBaseUrl(patch.baseUrl) }
      : {}),
  });
  if (patch.apiKey !== undefined) clearProviderKeyCache(id);
  return mergeProvider(meta);
}

/** 删除提供商；删掉的若是默认，服务端读取时会把悬空默认归零 */
export async function removeProvider(id: string): Promise<AiSettings> {
  await deleteAiProvider(id);
  clearProviderKeyCache(id);

  const current = getCachedAiSettings();
  const next = normalizeSettings({
    ...current,
    providers: current.providers.filter((p) => p.id !== id),
  });
  writeCache(next);
  notifyAiSettingsChanged();
  return next;
}

/** 设置全局默认的提供商与模型 */
export async function setDefaultModel(
  providerId: string,
  model: string,
): Promise<AiSettings> {
  const res = await putAiDefaults({
    defaultProviderId: providerId,
    defaultModel: model.trim() || null,
  });

  const next = normalizeSettings({
    ...getCachedAiSettings(),
    defaultProviderId: res.defaultProviderId ?? undefined,
    defaultModel: res.defaultModel ?? undefined,
  });
  writeCache(next);
  notifyAiSettingsChanged();
  return next;
}

/** 把新拉取的模型列表写回某个提供商 */
export async function setProviderModels(
  id: string,
  models: string[],
): Promise<AiSettings> {
  return updateProvider(id, {
    models: sortModels(models),
    modelsFetchedAt: Date.now(),
  });
}

/* —— 与配置无关的本机 UI 状态 —— */

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
