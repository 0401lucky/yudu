import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_MODELS_CACHE_KEY,
  AI_SETTINGS_KEY,
  addProvider,
  isAiSettingsReady,
  loadAiSettings,
  removeProvider,
  resolveProvider,
  saveAiSettings,
  setDefaultModel,
  updateProvider,
  type AiProvider,
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

/** 造一个最小可用的提供商 */
function provider(patch: Partial<AiProvider> = {}): AiProvider {
  return {
    id: "p1",
    name: "测试",
    protocol: "openai",
    baseUrl: "https://api.example.com",
    apiKey: "sk-test",
    models: [],
    modelsFetchedAt: 0,
    ...patch,
  };
}

describe("aiSettings 旧数据迁移", () => {
  it("旧格式迁移为一个「默认」提供商", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        baseUrl: "https://old-relay.com/v1/",
        apiKey: "sk-old",
        model: "gpt-4o",
      }),
    );

    const s = loadAiSettings();
    expect(s.providers).toHaveLength(1);
    const p = s.providers[0]!;
    expect(p.name).toBe("默认");
    expect(p.protocol).toBe("openai");
    // 尾部 /v1 与斜杠被规范化掉
    expect(p.baseUrl).toBe("https://old-relay.com");
    expect(p.apiKey).toBe("sk-old");
    expect(p.id).toBeTruthy();
    expect(s.defaultProviderId).toBe(p.id);
    expect(s.defaultModel).toBe("gpt-4o");
  });

  it("旧模型缓存并入该提供商", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({ baseUrl: "https://x.com", apiKey: "sk", model: "m1" }),
    );
    localStorage.setItem(
      AI_MODELS_CACHE_KEY,
      JSON.stringify({
        baseUrl: "https://x.com",
        models: ["m2", "m1"],
        fetchedAt: 12345,
      }),
    );

    const s = loadAiSettings();
    expect(s.providers[0]!.models).toEqual(["m1", "m2"]);
    expect(s.providers[0]!.modelsFetchedAt).toBe(12345);
  });

  it("迁移后旧缓存键被清除，且不会重复迁移", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({ baseUrl: "https://x.com", apiKey: "sk", model: "m1" }),
    );
    localStorage.setItem(
      AI_MODELS_CACHE_KEY,
      JSON.stringify({ baseUrl: "https://x.com", models: ["m1"], fetchedAt: 1 }),
    );

    const first = loadAiSettings();
    expect(localStorage.getItem(AI_MODELS_CACHE_KEY)).toBeNull();

    // 二次读取拿到同一个提供商 id，说明已回写为新格式而非每次重新迁移
    const second = loadAiSettings();
    expect(second.providers).toHaveLength(1);
    expect(second.providers[0]!.id).toBe(first.providers[0]!.id);
  });

  it("旧格式但字段全空时不造提供商", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({ baseUrl: "", apiKey: "", model: "" }),
    );
    expect(loadAiSettings().providers).toEqual([]);
  });

  it("新格式原样读出", () => {
    const p = provider({ id: "keep-me", models: ["a"] });
    saveAiSettings({
      providers: [p],
      defaultProviderId: "keep-me",
      defaultModel: "a",
    });
    const s = loadAiSettings();
    expect(s.providers).toHaveLength(1);
    expect(s.providers[0]!.id).toBe("keep-me");
    expect(s.defaultModel).toBe("a");
  });

  it("空 localStorage 与损坏 JSON 都返回空设置", () => {
    expect(loadAiSettings().providers).toEqual([]);
    localStorage.setItem(AI_SETTINGS_KEY, "{ 这不是 JSON");
    expect(loadAiSettings().providers).toEqual([]);
  });

  it("providers 中的非法项被丢弃", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        providers: [
          provider({ id: "good" }),
          null,
          "字符串",
          { id: "no-name-ok", protocol: "openai" },
          { name: "缺 id" },
        ],
      }),
    );
    const ids = loadAiSettings().providers.map((p) => p.id);
    expect(ids).toContain("good");
    expect(ids).toContain("no-name-ok");
    expect(ids).toHaveLength(2);
  });

  it("未知 protocol 降级为 openai", () => {
    localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        providers: [{ id: "p", name: "x", protocol: "grok", baseUrl: "u" }],
      }),
    );
    expect(loadAiSettings().providers[0]!.protocol).toBe("openai");
  });
});

describe("aiSettings 提供商增删改", () => {
  it("addProvider 首个自动设为默认", () => {
    const s = addProvider(provider({ id: "a" }));
    expect(s.defaultProviderId).toBe("a");
    const s2 = addProvider(provider({ id: "b" }), s);
    expect(s2.defaultProviderId).toBe("a");
  });

  it("updateProvider 只改目标项", () => {
    let s = addProvider(provider({ id: "a", name: "甲" }));
    s = addProvider(provider({ id: "b", name: "乙" }), s);
    s = updateProvider("b", { name: "乙改", models: ["m"] }, s);
    expect(s.providers.find((p) => p.id === "a")!.name).toBe("甲");
    expect(s.providers.find((p) => p.id === "b")!.name).toBe("乙改");
    expect(s.providers.find((p) => p.id === "b")!.models).toEqual(["m"]);
  });

  it("removeProvider 删掉默认时清空默认指向", () => {
    let s = addProvider(provider({ id: "a" }));
    s = addProvider(provider({ id: "b" }), s);
    s = setDefaultModel("a", "m1", s);
    expect(s.defaultProviderId).toBe("a");

    s = removeProvider("a", s);
    expect(s.providers.map((p) => p.id)).toEqual(["b"]);
    expect(s.defaultProviderId).toBeUndefined();
    expect(s.defaultModel).toBeUndefined();
  });

  it("removeProvider 删掉非默认时默认不变", () => {
    let s = addProvider(provider({ id: "a" }));
    s = addProvider(provider({ id: "b" }), s);
    s = removeProvider("b", s);
    expect(s.defaultProviderId).toBe("a");
  });
});

describe("resolveProvider", () => {
  const pa = provider({ id: "a", name: "甲", models: ["m1"] });
  const pb = provider({ id: "b", name: "乙", models: ["m2"] });

  it("书级绑定命中时用书的提供商", () => {
    const s = {
      providers: [pa, pb],
      defaultProviderId: "a",
      defaultModel: "m1",
    };
    const r = resolveProvider(s, "b", "m2");
    expect(r?.provider.id).toBe("b");
    expect(r?.model).toBe("m2");
  });

  it("书绑定的提供商已被删除时回退全局默认", () => {
    const s = {
      providers: [pa],
      defaultProviderId: "a",
      defaultModel: "m1",
    };
    const r = resolveProvider(s, "已删除的id", "m2");
    expect(r?.provider.id).toBe("a");
    expect(r?.model).toBe("m1");
  });

  it("没有任何提供商时返回 null", () => {
    expect(resolveProvider({ providers: [] })).toBeNull();
  });

  it("提供商存在但模型为空时返回 null", () => {
    const s = { providers: [pa], defaultProviderId: "a" };
    expect(resolveProvider(s)).toBeNull();
  });

  it("提供商缺 baseUrl 或 apiKey 时返回 null", () => {
    const noKey = provider({ id: "c", apiKey: "" });
    const s = { providers: [noKey], defaultProviderId: "c", defaultModel: "m" };
    expect(resolveProvider(s)).toBeNull();
  });

  it("isAiSettingsReady 与 resolveProvider 一致", () => {
    expect(isAiSettingsReady({ providers: [] })).toBe(false);
    expect(
      isAiSettingsReady({
        providers: [pa],
        defaultProviderId: "a",
        defaultModel: "m1",
      }),
    ).toBe(true);
  });
});
