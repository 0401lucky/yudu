import { Hono } from "hono";
import {
  AI_PROTOCOLS,
  MAX_AI_API_KEY_CHARS,
  MAX_AI_BASE_URL_CHARS,
  MAX_AI_MODELS,
  MAX_AI_PROVIDER_NAME_CHARS,
  MAX_AI_PROVIDERS,
  type AiProtocol,
  type AiProviderMeta,
  type AiSettingsDto,
} from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import {
  AiKeyCryptoError,
  decryptApiKey,
  encryptApiKey,
  maskApiKey,
} from "../services/aiKeyCrypto";

type AiProviderRow = {
  id: string;
  name: string;
  protocol: string;
  base_url: string;
  api_key_mask: string;
  models: string;
  models_fetched_at: number;
};

export const aiSettingsRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

aiSettingsRoutes.use("*", authMiddleware);

const PROTOCOLS = new Set<string>(AI_PROTOCOLS);

const COLUMNS =
  "id, name, protocol, base_url, api_key_mask, models, models_fetched_at";

function parseModelsColumn(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m): m is string => typeof m === "string");
  } catch {
    // 列损坏就当没有模型；用户重新拉一次即可，不该让整个配置读不出来
    return [];
  }
}

function rowToMeta(row: AiProviderRow): AiProviderMeta {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as AiProtocol,
    baseUrl: row.base_url,
    keyMask: row.api_key_mask,
    models: parseModelsColumn(row.models),
    modelsFetchedAt: row.models_fetched_at,
  };
}

function invalid(message: string) {
  return { error: { code: "INVALID_AI_PROVIDER", message } } as const;
}

/** 加解密失败属服务端问题（主密钥未配 / 密文损坏），统一 500 并带上具体 code */
function cryptoError(err: unknown) {
  if (err instanceof AiKeyCryptoError) {
    return { error: { code: err.code, message: err.message } } as const;
  }
  return null;
}

type ProviderInput = {
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  models: string[];
  modelsFetchedAt: number;
};

/**
 * 校验可写字段。`partial` 为真时（PATCH）缺省字段返回 undefined 表示不改动，
 * 为假时（POST）缺省字段用默认值补齐。
 */
function parseProviderFields(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; value: Partial<ProviderInput> } | { ok: false; message: string } {
  const value: Partial<ProviderInput> = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { ok: false, message: "请填写提供商名称" };
    if (name.length > MAX_AI_PROVIDER_NAME_CHARS) {
      return {
        ok: false,
        message: `名称不能超过 ${MAX_AI_PROVIDER_NAME_CHARS} 字`,
      };
    }
    value.name = name;
  }

  if (body.protocol !== undefined || !partial) {
    if (typeof body.protocol !== "string" || !PROTOCOLS.has(body.protocol)) {
      return { ok: false, message: "协议无效" };
    }
    value.protocol = body.protocol as AiProtocol;
  }

  if (body.baseUrl !== undefined || !partial) {
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    if (baseUrl.length > MAX_AI_BASE_URL_CHARS) {
      return {
        ok: false,
        message: `API 地址不能超过 ${MAX_AI_BASE_URL_CHARS} 字符`,
      };
    }
    value.baseUrl = baseUrl;
  }

  if (body.models !== undefined || !partial) {
    const raw = body.models === undefined ? [] : body.models;
    if (!Array.isArray(raw)) return { ok: false, message: "模型列表格式无效" };
    const models = [
      ...new Set(
        raw
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    ];
    if (models.length > MAX_AI_MODELS) {
      return { ok: false, message: `模型数量不能超过 ${MAX_AI_MODELS}` };
    }
    value.models = models;
  }

  if (body.modelsFetchedAt !== undefined || !partial) {
    const at = body.modelsFetchedAt === undefined ? 0 : body.modelsFetchedAt;
    if (typeof at !== "number" || !Number.isFinite(at) || at < 0) {
      return { ok: false, message: "模型拉取时间无效" };
    }
    value.modelsFetchedAt = Math.floor(at);
  }

  return { ok: true, value };
}

/** 校验密钥字段；返回 undefined 表示本次不改动密钥（仅 PATCH 可能） */
function parseApiKey(
  raw: unknown,
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false, message: "密钥格式无效" };
  const key = raw.trim();
  if (key.length > MAX_AI_API_KEY_CHARS) {
    return { ok: false, message: `密钥不能超过 ${MAX_AI_API_KEY_CHARS} 字符` };
  }
  return { ok: true, value: key };
}

async function readJson(
  parse: () => Promise<unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await parse();
    if (!body || typeof body !== "object") return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** GET /api/ai/settings — 提供商列表（仅掩码）+ 全局默认 */
aiSettingsRoutes.get("/settings", async (c) => {
  const userId = c.get("userId");

  const { results } = await c.env.DB.prepare(
    `SELECT ${COLUMNS} FROM ai_providers WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<AiProviderRow>();

  const row = await c.env.DB.prepare(
    `SELECT default_provider_id, default_model FROM user_ai_settings WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ default_provider_id: string | null; default_model: string | null }>();

  const providers = (results ?? []).map(rowToMeta);
  // 默认指向已删除的提供商时归零，与前端既有归一化口径一致，避免下发悬空 id
  const valid =
    row?.default_provider_id != null &&
    providers.some((p) => p.id === row.default_provider_id);

  const dto: AiSettingsDto = {
    providers,
    defaultProviderId: valid ? row!.default_provider_id : null,
    defaultModel: valid ? (row!.default_model ?? null) : null,
  };
  return c.json(dto);
});

/** PUT /api/ai/settings — 只写全局默认提供商与模型 */
aiSettingsRoutes.put("/settings", async (c) => {
  const userId = c.get("userId");
  const body = await readJson(() => c.req.json());
  if (!body) {
    return c.json({ error: { code: "INVALID_BODY", message: "请求体无效" } }, 400);
  }

  const rawId = body.defaultProviderId;
  if (rawId !== null && typeof rawId !== "string") {
    return c.json(invalid("默认提供商无效"), 400);
  }
  const rawModel = body.defaultModel;
  if (rawModel !== null && rawModel !== undefined && typeof rawModel !== "string") {
    return c.json(invalid("默认模型无效"), 400);
  }

  let providerId: string | null = rawId;
  let model: string | null =
    typeof rawModel === "string" ? rawModel.trim() || null : null;

  if (providerId) {
    const owned = await c.env.DB.prepare(
      `SELECT id FROM ai_providers WHERE id = ? AND user_id = ?`,
    )
      .bind(providerId, userId)
      .first<{ id: string }>();
    if (!owned) {
      return c.json(invalid("默认提供商不存在"), 400);
    }
  } else {
    // 没有默认提供商时保留模型没有意义
    providerId = null;
    model = null;
  }

  await c.env.DB.prepare(
    `INSERT INTO user_ai_settings (user_id, default_provider_id, default_model, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       default_provider_id = excluded.default_provider_id,
       default_model = excluded.default_model,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, providerId, model, Date.now())
    .run();

  return c.json({ defaultProviderId: providerId, defaultModel: model });
});

/** POST /api/ai/providers — 新建；id 可由客户端指定（迁移时须保留原 id） */
aiSettingsRoutes.post("/providers", async (c) => {
  const userId = c.get("userId");
  const body = await readJson(() => c.req.json());
  if (!body) {
    return c.json({ error: { code: "INVALID_BODY", message: "请求体无效" } }, 400);
  }

  const parsed = parseProviderFields(body, false);
  if (!parsed.ok) return c.json(invalid(parsed.message), 400);
  const key = parseApiKey(body.apiKey);
  if (!key.ok) return c.json(invalid(key.message), 400);

  if (body.id !== undefined && (typeof body.id !== "string" || !body.id.trim())) {
    return c.json(invalid("提供商 id 无效"), 400);
  }
  const id = typeof body.id === "string" ? body.id.trim() : crypto.randomUUID();

  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ai_providers WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_AI_PROVIDERS) {
    return c.json(
      {
        error: {
          code: "AI_PROVIDER_LIMIT",
          message: `最多只能添加 ${MAX_AI_PROVIDERS} 个提供商`,
        },
      },
      400,
    );
  }

  const plainKey = key.value ?? "";
  let encrypted: string;
  try {
    encrypted = await encryptApiKey(plainKey, c.env.AI_KEY_SECRET);
  } catch (err) {
    const mapped = cryptoError(err);
    if (mapped) return c.json(mapped, 500);
    throw err;
  }

  const now = Date.now();
  const fields = parsed.value;
  try {
    await c.env.DB.prepare(
      `INSERT INTO ai_providers
         (id, user_id, name, protocol, base_url, api_key_enc, api_key_mask,
          models, models_fetched_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        fields.name!,
        fields.protocol!,
        fields.baseUrl ?? "",
        encrypted,
        maskApiKey(plainKey),
        JSON.stringify(fields.models ?? []),
        fields.modelsFetchedAt ?? 0,
        now,
        now,
      )
      .run();
  } catch (err) {
    // 客户端自带 id 时可能撞已存在的行（含他人的）；一律按冲突处理，不透露归属
    if (err instanceof Error && /UNIQUE|constraint/i.test(err.message)) {
      return c.json(
        { error: { code: "PROVIDER_EXISTS", message: "该提供商已存在" } },
        409,
      );
    }
    throw err;
  }

  const meta: AiProviderMeta = {
    id,
    name: fields.name!,
    protocol: fields.protocol!,
    baseUrl: fields.baseUrl ?? "",
    keyMask: maskApiKey(plainKey),
    models: fields.models ?? [],
    modelsFetchedAt: fields.modelsFetchedAt ?? 0,
  };
  return c.json(meta, 201);
});

/** PATCH /api/ai/providers/:id — 局部更新；apiKey 缺省表示不改动已存密钥 */
aiSettingsRoutes.patch("/providers/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await readJson(() => c.req.json());
  if (!body) {
    return c.json({ error: { code: "INVALID_BODY", message: "请求体无效" } }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT ${COLUMNS} FROM ai_providers WHERE id = ? AND user_id = ?`,
  )
    .bind(id, userId)
    .first<AiProviderRow>();
  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "提供商不存在" } }, 404);
  }

  const parsed = parseProviderFields(body, true);
  if (!parsed.ok) return c.json(invalid(parsed.message), 400);
  const key = parseApiKey(body.apiKey);
  if (!key.ok) return c.json(invalid(key.message), 400);

  const current = rowToMeta(existing);
  const next: AiProviderMeta = {
    ...current,
    ...parsed.value,
  };

  const sets = [
    "name = ?",
    "protocol = ?",
    "base_url = ?",
    "models = ?",
    "models_fetched_at = ?",
    "updated_at = ?",
  ];
  const binds: unknown[] = [
    next.name,
    next.protocol,
    next.baseUrl,
    JSON.stringify(next.models),
    next.modelsFetchedAt,
    Date.now(),
  ];

  if (key.value !== undefined) {
    try {
      binds.push(await encryptApiKey(key.value, c.env.AI_KEY_SECRET));
    } catch (err) {
      const mapped = cryptoError(err);
      if (mapped) return c.json(mapped, 500);
      throw err;
    }
    sets.push("api_key_enc = ?");
    next.keyMask = maskApiKey(key.value);
    binds.push(next.keyMask);
    sets.push("api_key_mask = ?");
  }

  binds.push(id, userId);
  await c.env.DB.prepare(
    `UPDATE ai_providers SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
  )
    .bind(...binds)
    .run();

  return c.json(next);
});

/** DELETE /api/ai/providers/:id */
aiSettingsRoutes.delete("/providers/:id", async (c) => {
  const userId = c.get("userId");
  const res = await c.env.DB.prepare(
    `DELETE FROM ai_providers WHERE id = ? AND user_id = ?`,
  )
    .bind(c.req.param("id"), userId)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: { code: "NOT_FOUND", message: "提供商不存在" } }, 404);
  }
  // 默认指向被删提供商时不额外清理，GET /settings 会把悬空的默认归零
  return c.body(null, 204);
});

/** GET /api/ai/providers/:id/key — 明文密钥，仅在即将调用第三方 API 时取 */
aiSettingsRoutes.get("/providers/:id/key", async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    `SELECT api_key_enc FROM ai_providers WHERE id = ? AND user_id = ?`,
  )
    .bind(c.req.param("id"), userId)
    .first<{ api_key_enc: string }>();

  if (!row) {
    return c.json({ error: { code: "NOT_FOUND", message: "提供商不存在" } }, 404);
  }

  try {
    return c.json({ apiKey: await decryptApiKey(row.api_key_enc, c.env.AI_KEY_SECRET) });
  } catch (err) {
    const mapped = cryptoError(err);
    if (mapped) return c.json(mapped, 500);
    throw err;
  }
});
