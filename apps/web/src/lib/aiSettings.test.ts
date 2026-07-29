import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAiModelsCache,
  getCachedModelsForSettings,
  loadAiModelsCache,
  loadAiSettings,
  saveAiModelsCache,
  saveAiSettings,
  setAiModel,
} from "./aiSettings";

function installMemoryStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal("localStorage", memory);
  return memory;
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("aiSettings model cache", () => {
  it("保存并读取模型列表", () => {
    saveAiModelsCache(["b", "a", "a"], "https://api.example.com/v1/");
    const c = loadAiModelsCache();
    expect(c?.baseUrl).toBe("https://api.example.com");
    expect(c?.models).toEqual(["a", "b"]);
    expect(c?.fetchedAt).toBeGreaterThan(0);
  });

  it("setAiModel 只更新模型", () => {
    saveAiSettings({
      baseUrl: "https://x.com",
      apiKey: "sk",
      model: "old",
    });
    const next = setAiModel("gemini-pro");
    expect(next.model).toBe("gemini-pro");
    expect(loadAiSettings().apiKey).toBe("sk");
  });

  it("baseUrl 变化标记 stale", () => {
    saveAiModelsCache(["m1"], "https://old.com");
    saveAiSettings({
      baseUrl: "https://new.com",
      apiKey: "k",
      model: "m1",
    });
    const g = getCachedModelsForSettings();
    expect(g.models).toEqual(["m1"]);
    expect(g.stale).toBe(true);
  });

  it("clearAiModelsCache", () => {
    saveAiModelsCache(["x"], "https://x.com");
    clearAiModelsCache();
    expect(loadAiModelsCache()).toBeNull();
  });
});
