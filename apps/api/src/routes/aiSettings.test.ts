import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE, type AiProviderMeta, type AiSettingsDto } from "@yudu/shared";
import type { Env } from "../env";
import { aiSettingsRoutes } from "./aiSettings";

type ProviderRow = {
  id: string;
  user_id: string;
  name: string;
  protocol: string;
  base_url: string;
  api_key_enc: string;
  api_key_mask: string;
  models: string;
  models_fetched_at: number;
  created_at: number;
  updated_at: number;
};

type SettingsRow = {
  default_provider_id: string | null;
  default_model: string | null;
};

const USER_A = "user-a";
const USER_B = "user-b";

/**
 * Mock D1：
 * - sessions 查询返回「当前用户」，用 `_setUser` 切换以验证跨用户隔离
 * - ai_providers / user_ai_settings 存内存 Map，模拟主键冲突与 meta.changes
 */
function createMockDb() {
  const providers = new Map<string, ProviderRow>();
  const settings = new Map<string, SettingsRow>();
  let currentUser = USER_A;

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT INTO ai_providers")) {
              const id = args[0] as string;
              if (providers.has(id)) {
                throw new Error("UNIQUE constraint failed: ai_providers.id");
              }
              providers.set(id, {
                id,
                user_id: args[1] as string,
                name: args[2] as string,
                protocol: args[3] as string,
                base_url: args[4] as string,
                api_key_enc: args[5] as string,
                api_key_mask: args[6] as string,
                models: args[7] as string,
                models_fetched_at: args[8] as number,
                created_at: args[9] as number,
                updated_at: args[10] as number,
              });
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes("INSERT INTO user_ai_settings")) {
              const [userId, providerId, model] = args as [
                string,
                string | null,
                string | null,
              ];
              settings.set(userId, {
                default_provider_id: providerId,
                default_model: model,
              });
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes("UPDATE ai_providers")) {
              const withKey = sql.includes("api_key_enc = ?");
              const tail = args.slice(withKey ? 8 : 6) as [string, string];
              const [id, userId] = tail;
              const row = providers.get(id);
              if (!row || row.user_id !== userId) {
                return { success: true, meta: { changes: 0 } };
              }
              row.name = args[0] as string;
              row.protocol = args[1] as string;
              row.base_url = args[2] as string;
              row.models = args[3] as string;
              row.models_fetched_at = args[4] as number;
              row.updated_at = args[5] as number;
              if (withKey) {
                row.api_key_enc = args[6] as string;
                row.api_key_mask = args[7] as string;
              }
              return { success: true, meta: { changes: 1 } };
            }

            if (sql.includes("DELETE FROM ai_providers")) {
              const [id, userId] = args as [string, string];
              const row = providers.get(id);
              if (row && row.user_id === userId) {
                providers.delete(id);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }

            throw new Error(`unexpected run sql: ${sql}`);
          },

          async first<T>() {
            if (sql.includes("FROM sessions")) {
              return { id: "sess-1", user_id: currentUser } as T;
            }
            if (sql.includes("FROM user_ai_settings")) {
              return (settings.get(args[0] as string) ?? null) as T | null;
            }
            if (sql.includes("COUNT(*)")) {
              const userId = args[0] as string;
              let n = 0;
              for (const row of providers.values()) {
                if (row.user_id === userId) n++;
              }
              return { n } as T;
            }
            if (sql.includes("FROM ai_providers")) {
              const [id, userId] = args as [string, string];
              const row = providers.get(id);
              if (!row || row.user_id !== userId) return null;
              return row as T;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },

          async all<T>() {
            if (sql.includes("FROM ai_providers")) {
              const userId = args[0] as string;
              const rows = [...providers.values()]
                .filter((row) => row.user_id === userId)
                .sort((a, b) => a.created_at - b.created_at);
              return { results: rows as T[] };
            }
            throw new Error(`unexpected all sql: ${sql}`);
          },
        };
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    _providers: providers,
    _setUser(id: string) {
      currentUser = id;
    },
  };

  return db as unknown as D1Database & {
    _providers: Map<string, ProviderRow>;
    _setUser: (id: string) => void;
  };
}

function createApp(db: D1Database, aiKeySecret = "test-ai-key-secret") {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/ai", aiSettingsRoutes);
  const env: Env = {
    DB: db,
    BOOKS_BUCKET: {} as R2Bucket,
    SESSION_SECRET: "test-session-secret",
    AI_KEY_SECRET: aiKeySecret,
  };
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init, env);
    },
  };
}

const authedHeaders = {
  Cookie: `${SESSION_COOKIE}=any-token`,
  "Content-Type": "application/json",
};

const PLAIN_KEY = "sk-plaintext-should-never-persist";

function providerBody(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: "我的中转",
    protocol: "openai",
    baseUrl: "https://relay.example.com",
    apiKey: PLAIN_KEY,
    ...over,
  });
}

async function createProvider(
  app: ReturnType<typeof createApp>,
  over: Record<string, unknown> = {},
) {
  const res = await app.request("/api/ai/providers", {
    method: "POST",
    headers: authedHeaders,
    body: providerBody(over),
  });
  return { res, meta: (await res.json()) as AiProviderMeta };
}

describe("ai settings routes", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createMockDb();
    app = createApp(db);
  });

  it("未登录一律 401", async () => {
    for (const [path, method] of [
      ["/api/ai/settings", "GET"],
      ["/api/ai/providers", "POST"],
      ["/api/ai/providers/x", "PATCH"],
      ["/api/ai/providers/x", "DELETE"],
      ["/api/ai/providers/x/key", "GET"],
    ] as const) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    }
  });

  it("落库的是密文，明文不入 D1，且同一密钥两次写入密文不同", async () => {
    const { res, meta } = await createProvider(app);
    expect(res.status).toBe(201);
    expect(meta.keyMask).toBe("sk-…sist");

    const rows = [...db._providers.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.api_key_enc).not.toContain(PLAIN_KEY);
    expect(rows[0]!.api_key_enc.startsWith("v1.")).toBe(true);

    await createProvider(app, { id: "second" });
    const [a, b] = [...db._providers.values()];
    expect(a!.api_key_enc).not.toBe(b!.api_key_enc);
  });

  it("GET /settings 不下发任何明文密钥", async () => {
    await createProvider(app);
    const res = await app.request("/api/ai/settings", { headers: authedHeaders });
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain(PLAIN_KEY);

    const body = JSON.parse(text) as AiSettingsDto;
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0]!.keyMask).toBe("sk-…sist");
    expect(body.providers[0]).not.toHaveProperty("apiKey");
  });

  it("按需取明文密钥", async () => {
    const { meta } = await createProvider(app);
    const res = await app.request(`/api/ai/providers/${meta.id}/key`, {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { apiKey: string }).apiKey).toBe(PLAIN_KEY);
  });

  it("PATCH 不传 apiKey 时保留原密钥", async () => {
    const { meta } = await createProvider(app);
    const patched = await app.request(`/api/ai/providers/${meta.id}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ name: "改名了" }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as AiProviderMeta).name).toBe("改名了");

    const key = await app.request(`/api/ai/providers/${meta.id}/key`, {
      headers: authedHeaders,
    });
    expect(((await key.json()) as { apiKey: string }).apiKey).toBe(PLAIN_KEY);
  });

  it("PATCH 传了 apiKey 才改密钥与掩码", async () => {
    const { meta } = await createProvider(app);
    await app.request(`/api/ai/providers/${meta.id}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ apiKey: "sk-brand-new-value" }),
    });

    const key = await app.request(`/api/ai/providers/${meta.id}/key`, {
      headers: authedHeaders,
    });
    expect(((await key.json()) as { apiKey: string }).apiKey).toBe(
      "sk-brand-new-value",
    );
    expect([...db._providers.values()][0]!.api_key_mask).toBe("sk-…alue");
  });

  it("跨用户访问一律 404，且看不到对方的提供商", async () => {
    const { meta } = await createProvider(app);
    db._setUser(USER_B);

    for (const [path, method] of [
      [`/api/ai/providers/${meta.id}/key`, "GET"],
      [`/api/ai/providers/${meta.id}`, "PATCH"],
      [`/api/ai/providers/${meta.id}`, "DELETE"],
    ] as const) {
      const res = await app.request(path, {
        method,
        headers: authedHeaders,
        body: method === "PATCH" ? JSON.stringify({ name: "偷改" }) : undefined,
      });
      expect(res.status).toBe(404);
    }

    const list = await app.request("/api/ai/settings", { headers: authedHeaders });
    expect(((await list.json()) as AiSettingsDto).providers).toHaveLength(0);
  });

  it("主密钥缺失时 fail fast，不写入任何行", async () => {
    const noSecret = createApp(db, "");
    const res = await noSecret.request("/api/ai/providers", {
      method: "POST",
      headers: authedHeaders,
      body: providerBody(),
    });

    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "AI_KEY_SECRET_MISSING",
    );
    expect(db._providers.size).toBe(0);
  });

  it("字段校验", async () => {
    const cases = [
      { over: { name: "  " }, hint: "空名称" },
      { over: { name: "n".repeat(51) }, hint: "超长名称" },
      { over: { protocol: "claude" }, hint: "非法协议" },
      { over: { apiKey: "k".repeat(501) }, hint: "超长密钥" },
      { over: { models: "not-an-array" }, hint: "模型列表非数组" },
      { over: { modelsFetchedAt: -1 }, hint: "负时间戳" },
    ];
    for (const { over, hint } of cases) {
      const res = await app.request("/api/ai/providers", {
        method: "POST",
        headers: authedHeaders,
        body: providerBody(over),
      });
      expect(res.status, hint).toBe(400);
    }

    const badJson = await app.request("/api/ai/providers", {
      method: "POST",
      headers: authedHeaders,
      body: "{",
    });
    expect(badJson.status).toBe(400);
  });

  it("客户端指定的 id 被保留（迁移依赖），重复则 409", async () => {
    const { meta } = await createProvider(app, { id: "kept-id" });
    expect(meta.id).toBe("kept-id");

    const dup = await app.request("/api/ai/providers", {
      method: "POST",
      headers: authedHeaders,
      body: providerBody({ id: "kept-id" }),
    });
    expect(dup.status).toBe(409);
  });

  it("超出提供商数量上限返回 400", async () => {
    for (let i = 0; i < 20; i++) {
      await createProvider(app, { id: `p-${i}` });
    }
    const res = await app.request("/api/ai/providers", {
      method: "POST",
      headers: authedHeaders,
      body: providerBody({ id: "overflow" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "AI_PROVIDER_LIMIT",
    );
  });

  it("默认选择：写入、校验归属、删除后归零", async () => {
    const { meta } = await createProvider(app);

    const ok = await app.request("/api/ai/settings", {
      method: "PUT",
      headers: authedHeaders,
      body: JSON.stringify({ defaultProviderId: meta.id, defaultModel: "gpt-4o" }),
    });
    expect(ok.status).toBe(200);

    const read = await app.request("/api/ai/settings", { headers: authedHeaders });
    const body = (await read.json()) as AiSettingsDto;
    expect(body.defaultProviderId).toBe(meta.id);
    expect(body.defaultModel).toBe("gpt-4o");

    const bad = await app.request("/api/ai/settings", {
      method: "PUT",
      headers: authedHeaders,
      body: JSON.stringify({ defaultProviderId: "不存在", defaultModel: "x" }),
    });
    expect(bad.status).toBe(400);

    // 删掉提供商后，悬空的默认在读取时归零
    await app.request(`/api/ai/providers/${meta.id}`, {
      method: "DELETE",
      headers: authedHeaders,
    });
    const after = await app.request("/api/ai/settings", { headers: authedHeaders });
    const afterBody = (await after.json()) as AiSettingsDto;
    expect(afterBody.defaultProviderId).toBeNull();
    expect(afterBody.defaultModel).toBeNull();
  });

  it("删除不存在的提供商返回 404", async () => {
    const res = await app.request("/api/ai/providers/nope", {
      method: "DELETE",
      headers: authedHeaders,
    });
    expect(res.status).toBe(404);
  });
});
