import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderMeta, AiSettingsDto } from "@yudu/shared";

vi.mock("./api", () => ({
  getAiSettings: vi.fn(),
  createAiProvider: vi.fn(),
  patchAiProvider: vi.fn(),
  deleteAiProvider: vi.fn(),
  getAiProviderKey: vi.fn(),
  putAiDefaults: vi.fn(),
}));

const apiMock = vi.mocked(await import("./api"));

function installMemoryStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
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
  });
}

/**
 * 模块内有「是否已尝试迁移」的一次性标记，测试间必须重新加载模块才能隔离。
 * 同理，缓存与内存密钥也随新模块实例重置。
 */
async function freshModule() {
  vi.resetModules();
  return import("./aiSettings");
}

beforeEach(() => {
  installMemoryStorage();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function meta(patch: Partial<AiProviderMeta> = {}): AiProviderMeta {
  return {
    id: "p1",
    name: "测试",
    protocol: "openai",
    baseUrl: "https://api.example.com",
    keyMask: "sk-…test",
    models: [],
    modelsFetchedAt: 0,
    ...patch,
  };
}

function dto(over: Partial<AiSettingsDto> = {}): AiSettingsDto {
  return {
    providers: [],
    defaultProviderId: null,
    defaultModel: null,
    ...over,
  };
}

/** 旧版本地明文配置 */
function legacyProvider(patch: Record<string, unknown> = {}) {
  return {
    id: "legacy-1",
    name: "老中转",
    protocol: "openai",
    baseUrl: "https://old-relay.com/v1/",
    apiKey: "sk-legacy-plain",
    models: ["m1"],
    modelsFetchedAt: 100,
    ...patch,
  };
}

describe("resolveProvider（纯逻辑，行为与改造前一致）", () => {
  const pa = meta({ id: "a", name: "甲", models: ["m1"] });
  const pb = meta({ id: "b", name: "乙", models: ["m2"] });

  it("书级绑定命中时用书的提供商", async () => {
    const { resolveProvider } = await freshModule();
    const r = resolveProvider(
      { providers: [pa, pb], defaultProviderId: "a", defaultModel: "m1" },
      "b",
      "m2",
    );
    expect(r?.provider.id).toBe("b");
    expect(r?.model).toBe("m2");
  });

  it("书绑定的提供商已被删除时回退全局默认", async () => {
    const { resolveProvider } = await freshModule();
    const r = resolveProvider(
      { providers: [pa], defaultProviderId: "a", defaultModel: "m1" },
      "已删除的id",
      "m2",
    );
    expect(r?.provider.id).toBe("a");
    expect(r?.model).toBe("m1");
  });

  it("没有提供商 / 模型为空 / 无凭证都返回 null", async () => {
    const { resolveProvider } = await freshModule();
    expect(resolveProvider({ providers: [] })).toBeNull();
    expect(
      resolveProvider({ providers: [pa], defaultProviderId: "a" }),
    ).toBeNull();

    const noKey = meta({ id: "c", keyMask: "" });
    expect(
      resolveProvider({
        providers: [noKey],
        defaultProviderId: "c",
        defaultModel: "m",
      }),
    ).toBeNull();
  });

  it("OpenAI 兼容缺 baseUrl 判为无凭证，官方协议留空可用", async () => {
    const { hasCredentials } = await freshModule();
    expect(hasCredentials(meta({ protocol: "openai", baseUrl: "" }))).toBe(false);
    expect(hasCredentials(meta({ protocol: "gemini", baseUrl: "" }))).toBe(true);
  });

  it("isAiSettingsReady 与 resolveProvider 一致", async () => {
    const { isAiSettingsReady } = await freshModule();
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

describe("normalizeSettings", () => {
  it("丢弃非法项、未知协议降级、悬空默认归零", async () => {
    const { normalizeSettings } = await freshModule();
    const s = normalizeSettings({
      providers: [
        meta({ id: "good" }),
        null,
        "字符串",
        { id: "grok-p", name: "x", protocol: "grok", baseUrl: "u" },
        { name: "缺 id" },
      ],
      defaultProviderId: "已删除",
      defaultModel: "m",
    });

    expect(s.providers.map((p) => p.id)).toEqual(["good", "grok-p"]);
    expect(s.providers[1]!.protocol).toBe("openai");
    expect(s.defaultProviderId).toBeUndefined();
    expect(s.defaultModel).toBeUndefined();
  });
});

describe("readLegacyAiSettings", () => {
  it("读多提供商旧格式，并规范化尾部 /v1", async () => {
    const { readLegacyAiSettings, LEGACY_AI_SETTINGS_KEY } = await freshModule();
    localStorage.setItem(
      LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({
        providers: [legacyProvider()],
        defaultProviderId: "legacy-1",
        defaultModel: "m1",
      }),
    );

    const snap = readLegacyAiSettings();
    expect(snap?.providers).toHaveLength(1);
    expect(snap?.providers[0]!.baseUrl).toBe("https://old-relay.com");
    expect(snap?.providers[0]!.apiKey).toBe("sk-legacy-plain");
    expect(snap?.defaultModel).toBe("m1");
  });

  it("兼容更早的单套格式", async () => {
    const { readLegacyAiSettings, LEGACY_AI_SETTINGS_KEY } = await freshModule();
    localStorage.setItem(
      LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({
        baseUrl: "https://old.com/v1/",
        apiKey: "sk-old",
        model: "gpt-4o",
      }),
    );

    const snap = readLegacyAiSettings();
    expect(snap?.providers).toHaveLength(1);
    expect(snap?.providers[0]!.name).toBe("默认");
    expect(snap?.providers[0]!.baseUrl).toBe("https://old.com");
    expect(snap?.defaultModel).toBe("gpt-4o");
  });

  it("无数据 / 字段全空 / 损坏 JSON 都不产出提供商", async () => {
    const { readLegacyAiSettings, LEGACY_AI_SETTINGS_KEY } = await freshModule();
    expect(readLegacyAiSettings()).toBeNull();

    localStorage.setItem(
      LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ baseUrl: "", apiKey: "", model: "" }),
    );
    expect(readLegacyAiSettings()?.providers).toEqual([]);

    localStorage.setItem(LEGACY_AI_SETTINGS_KEY, "{ 这不是 JSON");
    expect(readLegacyAiSettings()).toBeNull();
  });
});

describe("fetchAiSettings 的旧数据迁移", () => {
  it("云端为空时静默上传，成功后清除本地明文", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({
        providers: [legacyProvider()],
        defaultProviderId: "legacy-1",
        defaultModel: "m1",
      }),
    );

    const uploaded = meta({ id: "legacy-1", name: "老中转", models: ["m1"] });
    apiMock.getAiSettings
      .mockResolvedValueOnce(dto())
      .mockResolvedValueOnce(
        dto({
          providers: [uploaded],
          defaultProviderId: "legacy-1",
          defaultModel: "m1",
        }),
      );
    apiMock.createAiProvider.mockResolvedValue(uploaded);
    apiMock.putAiDefaults.mockResolvedValue({
      defaultProviderId: "legacy-1",
      defaultModel: "m1",
    });

    const settings = await mod.fetchAiSettings();

    // 原样带上 id，否则 books.studio_provider_id 的绑定会失效
    expect(apiMock.createAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "legacy-1", apiKey: "sk-legacy-plain" }),
    );
    expect(settings.providers).toHaveLength(1);
    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).toBeNull();
    expect(mod.getPendingLegacyCount()).toBe(0);
  });

  it("上传失败时保留本地明文，挂起等重试", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [legacyProvider()] }),
    );

    apiMock.getAiSettings.mockResolvedValue(dto());
    apiMock.createAiProvider.mockRejectedValue(new Error("网络炸了"));

    await mod.fetchAiSettings();

    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).not.toBeNull();
    expect(mod.getPendingLegacyCount()).toBe(1);
  });

  it("云端已有配置时不自动上传，挂起等用户决定", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [legacyProvider(), legacyProvider({ id: "l2" })] }),
    );
    apiMock.getAiSettings.mockResolvedValue(
      dto({ providers: [meta({ id: "cloud-1" })] }),
    );

    const settings = await mod.fetchAiSettings();

    expect(apiMock.createAiProvider).not.toHaveBeenCalled();
    expect(settings.providers.map((p) => p.id)).toEqual(["cloud-1"]);
    expect(mod.getPendingLegacyCount()).toBe(2);
    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).not.toBeNull();
  });

  it("挂起后可手动导入，导入成功即清除本地", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [legacyProvider()] }),
    );
    apiMock.getAiSettings.mockResolvedValue(
      dto({ providers: [meta({ id: "cloud-1" })] }),
    );
    await mod.fetchAiSettings();

    apiMock.createAiProvider.mockResolvedValue(meta({ id: "legacy-1" }));
    apiMock.getAiSettings.mockResolvedValue(
      dto({ providers: [meta({ id: "cloud-1" }), meta({ id: "legacy-1" })] }),
    );

    const after = await mod.importLegacyProviders();
    expect(after.providers).toHaveLength(2);
    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).toBeNull();
    expect(mod.getPendingLegacyCount()).toBe(0);
  });

  it("可放弃本机残留配置", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [legacyProvider()] }),
    );
    apiMock.getAiSettings.mockResolvedValue(
      dto({ providers: [meta({ id: "cloud-1" })] }),
    );
    await mod.fetchAiSettings();
    expect(mod.getPendingLegacyCount()).toBe(1);

    mod.discardLegacyProviders();
    expect(mod.getPendingLegacyCount()).toBe(0);
    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).toBeNull();
  });

  it("空的旧数据直接清理，不触发上传", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [] }),
    );
    apiMock.getAiSettings.mockResolvedValue(dto());

    await mod.fetchAiSettings();
    expect(apiMock.createAiProvider).not.toHaveBeenCalled();
    expect(localStorage.getItem(mod.LEGACY_AI_SETTINGS_KEY)).toBeNull();
  });

  it("迁移只尝试一次，重复调用不重复上传", async () => {
    const mod = await freshModule();
    localStorage.setItem(
      mod.LEGACY_AI_SETTINGS_KEY,
      JSON.stringify({ providers: [legacyProvider()] }),
    );
    apiMock.getAiSettings.mockResolvedValue(dto());
    apiMock.createAiProvider.mockResolvedValue(meta({ id: "legacy-1" }));

    await mod.fetchAiSettings();
    await mod.fetchAiSettings();
    await mod.fetchAiSettings();

    expect(apiMock.createAiProvider).toHaveBeenCalledTimes(1);
  });
});

describe("本地缓存", () => {
  it("缓存只写掩码，绝不含明文密钥", async () => {
    const mod = await freshModule();
    apiMock.getAiSettings.mockResolvedValue(
      dto({
        providers: [meta({ id: "a", keyMask: "sk-…9xyz" })],
        defaultProviderId: "a",
        defaultModel: "m1",
      }),
    );

    await mod.fetchAiSettings();
    const raw = localStorage.getItem(mod.AI_SETTINGS_CACHE_KEY)!;

    expect(raw).toContain("sk-…9xyz");
    expect(raw).not.toContain("apiKey");
    expect(mod.getCachedAiSettings().defaultProviderId).toBe("a");
  });

  it("无缓存或缓存损坏时返回空配置", async () => {
    const mod = await freshModule();
    expect(mod.getCachedAiSettings().providers).toEqual([]);
    localStorage.setItem(mod.AI_SETTINGS_CACHE_KEY, "{ 坏掉的 JSON");
    expect(mod.getCachedAiSettings().providers).toEqual([]);
  });
});

describe("明文密钥按需取", () => {
  it("同一提供商在会话内只请求一次，改密钥后作废", async () => {
    const mod = await freshModule();
    apiMock.getAiProviderKey.mockResolvedValue("sk-real-key");

    expect(await mod.getProviderKey("a")).toBe("sk-real-key");
    expect(await mod.getProviderKey("a")).toBe("sk-real-key");
    expect(apiMock.getAiProviderKey).toHaveBeenCalledTimes(1);

    mod.clearProviderKeyCache("a");
    await mod.getProviderKey("a");
    expect(apiMock.getAiProviderKey).toHaveBeenCalledTimes(2);
  });

  it("withApiKey 组装出可直接发请求的提供商", async () => {
    const mod = await freshModule();
    apiMock.getAiProviderKey.mockResolvedValue("sk-real-key");

    const full = await mod.withApiKey(meta({ id: "a" }));
    expect(full.apiKey).toBe("sk-real-key");
    expect(full.id).toBe("a");
  });
});

describe("提供商增删改", () => {
  it("首个提供商自动成为默认", async () => {
    const mod = await freshModule();
    const created = meta({ id: "a", models: ["m1"] });
    apiMock.createAiProvider.mockResolvedValue(created);
    apiMock.putAiDefaults.mockResolvedValue({
      defaultProviderId: "a",
      defaultModel: "m1",
    });

    const s = await mod.addProvider({
      name: "甲",
      protocol: "openai",
      baseUrl: "https://x.com",
      apiKey: "sk-1",
    });

    expect(s.defaultProviderId).toBe("a");
    expect(apiMock.putAiDefaults).toHaveBeenCalledTimes(1);
  });

  it("已有默认时新增不抢默认", async () => {
    const mod = await freshModule();
    apiMock.getAiSettings.mockResolvedValue(
      dto({
        providers: [meta({ id: "a", models: ["m1"] })],
        defaultProviderId: "a",
        defaultModel: "m1",
      }),
    );
    await mod.fetchAiSettings();

    apiMock.createAiProvider.mockResolvedValue(meta({ id: "b" }));
    const s = await mod.addProvider({
      name: "乙",
      protocol: "openai",
      baseUrl: "https://y.com",
      apiKey: "sk-2",
    });

    expect(s.defaultProviderId).toBe("a");
    expect(apiMock.putAiDefaults).not.toHaveBeenCalled();
  });

  it("updateProvider 只改目标项，改密钥会作废密钥缓存", async () => {
    const mod = await freshModule();
    apiMock.getAiSettings.mockResolvedValue(
      dto({
        providers: [meta({ id: "a", name: "甲" }), meta({ id: "b", name: "乙" })],
      }),
    );
    await mod.fetchAiSettings();

    apiMock.getAiProviderKey.mockResolvedValue("sk-old");
    await mod.getProviderKey("b");

    apiMock.patchAiProvider.mockResolvedValue(
      meta({ id: "b", name: "乙改", keyMask: "sk-…new1" }),
    );
    const s = await mod.updateProvider("b", { apiKey: "sk-new1" });

    expect(s.providers.find((p) => p.id === "a")!.name).toBe("甲");
    expect(s.providers.find((p) => p.id === "b")!.name).toBe("乙改");

    apiMock.getAiProviderKey.mockResolvedValue("sk-new1");
    expect(await mod.getProviderKey("b")).toBe("sk-new1");
  });

  it("removeProvider 删掉默认时默认一并归零", async () => {
    const mod = await freshModule();
    apiMock.getAiSettings.mockResolvedValue(
      dto({
        providers: [meta({ id: "a", models: ["m1"] }), meta({ id: "b" })],
        defaultProviderId: "a",
        defaultModel: "m1",
      }),
    );
    await mod.fetchAiSettings();

    apiMock.deleteAiProvider.mockResolvedValue(undefined);
    const s = await mod.removeProvider("a");

    expect(s.providers.map((p) => p.id)).toEqual(["b"]);
    expect(s.defaultProviderId).toBeUndefined();
    expect(s.defaultModel).toBeUndefined();
  });

  it("setProviderModels 排序去重后写回", async () => {
    const mod = await freshModule();
    apiMock.patchAiProvider.mockResolvedValue(meta({ id: "a", models: ["m1", "m2"] }));

    await mod.setProviderModels("a", ["m2", "m1", "m2", "  "]);
    expect(apiMock.patchAiProvider).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ models: ["m1", "m2"] }),
    );
  });

  it("提交前规范化 baseUrl，不把 /v1/ 尾巴写进库", async () => {
    const mod = await freshModule();
    apiMock.createAiProvider.mockResolvedValue(meta({ id: "a" }));
    apiMock.putAiDefaults.mockResolvedValue({
      defaultProviderId: "a",
      defaultModel: null,
    });

    await mod.addProvider({
      name: "甲",
      protocol: "openai",
      baseUrl: "https://relay.example.com/v1/",
      apiKey: "sk-1",
    });
    expect(apiMock.createAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://relay.example.com" }),
    );

    apiMock.patchAiProvider.mockResolvedValue(meta({ id: "a" }));
    await mod.updateProvider("a", { baseUrl: "https://other.com/v1beta//" });
    expect(apiMock.patchAiProvider).toHaveBeenCalledWith(
      "a",
      expect.objectContaining({ baseUrl: "https://other.com" }),
    );
  });
});
