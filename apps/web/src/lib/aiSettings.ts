/** 用户 new-api 配置：仅存浏览器本地 */

export const AI_SETTINGS_KEY = "yudu_ai_settings";
export const ADULT_CONFIRMED_KEY = "yudu_adult_confirmed";

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
};

export function loadAiSettings(): AiSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_AI_SETTINGS };
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl.trim() : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model.trim() : "",
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  const next: AiSettings = {
    baseUrl: settings.baseUrl.trim().replace(/\/$/, ""),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
  };
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
}

export function isAiSettingsReady(s: AiSettings = loadAiSettings()): boolean {
  return Boolean(s.baseUrl && s.apiKey && s.model);
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
