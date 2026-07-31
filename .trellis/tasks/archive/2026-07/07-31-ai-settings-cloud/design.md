# 技术设计 — AI 配置跟随账号云端同步

## 架构边界

```
apps/web/src/lib/aiSettings.ts     纯逻辑（resolve/normalize/mask 判断）+ 云端存储层 + 本地缓存
apps/web/src/lib/api.ts            新增 6 个 AI 配置端点的 fetch 封装
apps/web/src/lib/aiClient.ts       不改内部逻辑，仅因类型拆分受影响
apps/api/src/services/aiKeyCrypto.ts   新增：AES-GCM 加解密（唯一接触明文的服务端模块）
apps/api/src/routes/aiSettings.ts      新增：6 个端点
apps/api/migrations/0010_ai_providers.sql  新增两张表
packages/shared/src/types.ts       新增 DTO 类型
```

依赖方向：`routes/aiSettings` → `services/aiKeyCrypto` → WebCrypto。加解密不被其他模块引用，明文只在路由层的请求/响应边界短暂存在。

## 数据模型

```sql
-- 0010_ai_providers.sql
CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL,            -- v1.<iv_b64url>.<cipher_b64url>
  models TEXT NOT NULL DEFAULT '[]',    -- JSON 数组
  models_fetched_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_providers_user ON ai_providers(user_id);

CREATE TABLE user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_provider_id TEXT,
  default_model TEXT,
  updated_at INTEGER NOT NULL
);
```

设计取舍：

- **默认选择独立成表，不塞进 `user_preferences`**：后者语义是阅读器外观（主题/字号/行距/页边距），且 `PUT /api/preferences` 会对 4 个字段全量校验回写（`preferences.ts:65-167`），混入 AI 字段会让该路由复杂化。
- **`default_provider_id` 不加外键约束**：provider 删除后允许悬空，由 `resolveProvider()` 的既有回退逻辑兜底（D6），与 `books.studio_provider_id` 的现有行为保持一致。
- **`models` 存 JSON 字符串**：与 `books.studio_assets`（`0007_studio_books.sql`）同款做法，无需额外关联表。
- **provider id 由前端生成**：沿用 `emptyProvider()` 的 `crypto.randomUUID()`（`AiProviderSettings.tsx:26`）。**这是迁移正确性的前提**——`books.studio_provider_id` 引用着这些 id，迁移必须原样保留，否则已绑定的书全部失效。

## 加密方案

```
密钥派生   AES_KEY = SHA-256(AI_KEY_SECRET)        → 32 字节 → importKey("raw", …, "AES-GCM")
每次加密   IV = crypto.getRandomValues(12 字节)     → 随机，不复用
存储格式   "v1." + b64url(IV) + "." + b64url(密文)  → 单列 TEXT
```

- 复用 `session.ts:5-11` 的 `bytesToBase64Url`，抽到共用位置或在 `aiKeyCrypto.ts` 内重写一份小工具（视 lint 对重复的容忍度定，倾向抽出）。
- **版本前缀 `v1.`** 是为将来换算法/轮换密钥留的解析锚点，当前只需在解密时校验前缀、不匹配即报错。不实现轮换逻辑（Out of Scope）。
- `AI_KEY_SECRET` 通过 `wrangler secret put` 注入，与 `SESSION_SECRET` 同构，不写进 `wrangler.toml`。
- **缺失时 fail fast**（R3）：`env.AI_KEY_SECRET` 为空则路由直接返回 500 + `AI_KEY_SECRET_MISSING`，绝不降级明文写库。

`Env` 类型扩展（`apps/api/src/env.ts`）：

```ts
/** AI 提供商密钥的加密主密钥；wrangler secret put AI_KEY_SECRET */
AI_KEY_SECRET: string;
```

## API 契约

统一走 `authMiddleware`，错误体沿用 `{ error: { code, message } }`。所有查询强制带 `WHERE user_id = ?`。

| 方法 | 路径 | 请求 | 响应 |
|---|---|---|---|
| GET | `/api/ai/settings` | — | `{ providers: ProviderMeta[], defaultProviderId, defaultModel }` |
| POST | `/api/ai/providers` | `{ id?, name, protocol, baseUrl?, apiKey, models?, modelsFetchedAt? }` | 201 `ProviderMeta` / 409 `PROVIDER_EXISTS` |
| PATCH | `/api/ai/providers/:id` | 同上各字段皆可选 | 200 `ProviderMeta` / 404 |
| DELETE | `/api/ai/providers/:id` | — | 204 / 404 |
| GET | `/api/ai/providers/:id/key` | — | `{ apiKey: string }` / 404 |
| PUT | `/api/ai/settings` | `{ defaultProviderId, defaultModel }` | 200 同 body / 400 `INVALID_PROVIDER` |

```ts
// packages/shared/src/types.ts
export interface AiProviderMeta {
  id: string;
  name: string;
  protocol: "openai" | "gemini" | "anthropic";
  baseUrl: string;
  /** 掩码，如 "sk-…a1b2"；空串表示未设置密钥 */
  keyMask: string;
  models: string[];
  modelsFetchedAt: number;
}
```

关键语义：

- **`PATCH` 的 `apiKey` 缺省 = 不改动**（AC5）。前端只持有掩码，若把掩码当值写回会摧毁真实密钥——因此不设计「全量 PUT 覆盖」端点。
- **越权一律 404**，不用 403（R5，不泄露资源存在性）。
- 掩码规则：`key.length <= 8 → "…"`，否则 `key.slice(0,3) + "…" + key.slice(-4)`。
- 迁移走「循环 POST」，不加批量端点：provider 通常 1–3 个，为一次性场景造接口不划算。

## 前端类型拆分

```ts
/** 列表态：无明文密钥，可安全缓存到 localStorage */
export interface AiProviderMeta { id; name; protocol; baseUrl; keyMask; models; modelsFetchedAt }

/** 发请求态：仅在即将调用第三方 API 时组装 */
export interface AiProvider extends AiProviderMeta { apiKey: string }
```

`aiClient.ts` 的 `listAiModels` / `streamChatCompletion` 签名仍收 `AiProvider`，内部逻辑零改动。

受影响的纯函数：

- `hasCredentials()` 改判 `keyMask` 而非 `apiKey`（`aiSettings.ts:244`）：`Boolean(p.keyMask) && (p.protocol !== "openai" || Boolean(p.baseUrl.trim()))`。
- `resolveProvider()` 返回 `{ provider: AiProviderMeta; model: string }`，**回退语义与分支结构完全不变**（`aiSettings.ts:255-271`），保证 AC7。

## 数据流

```
首屏     getCachedAiSettings()  同步读 localStorage 缓存 → 立即渲染（无闪烁，R8）
            ↓ 同时发起
         fetchAiSettings()      → setState + 写缓存 + dispatch "yudu-ai-settings-changed"

生成前   resolveProvider(settings, bookProviderId, bookModel) → { meta, model }
            ↓
         getProviderKey(meta.id)   模块级 Map<id, string> 会话内缓存，未命中才请求
            ↓
         streamChatCompletion({ provider: { ...meta, apiKey }, model, … })
```

- 密钥内存缓存在 provider 被 PATCH / DELETE 时按 id 清除，登出时整体清空。
- 现有的 `yudu-ai-settings-changed` 自定义事件机制**保留**（跨组件同步仍需要）；`storage` 事件监听可保留（多标签页共享缓存时仍会触发），成本为零。

### localStorage 两个键必须分开

| 键 | 内容 | 用途 |
|---|---|---|
| `yudu_ai_settings` | **旧**格式，含明文 apiKey | 只读，迁移源；迁移成功后删除 |
| `yudu_ai_settings_cache` | 新格式，**无**明文（只有 keyMask） | R8 首屏缓存 |

复用同一个键会让迁移检测把自己写的缓存误判为「待迁移的本地配置」，造成重复上传死循环。**这是本设计最易踩的坑。**

## 迁移流程（D3 / R9）

### 直接复用项目内已验证的先例

`useBookmarks.ts:120-174` 做过结构完全相同的「旧 localStorage 数据一次性迁移」，其注释即本方案的策略：**「全部上传成功才清 key，部分失败保留下次重试」**。照抄其三个要点：

- `migratedRef`（`useBookmarks.ts:94`）防重入，避免 StrictMode 双调用或并发入口重复上传。
- 空数组 / 已损坏的旧数据直接清理，不进上传循环（`:129-130`）。
- 全量成功才 `removeItem`（`:59`），失败保留原键等下次。

在 `fetchAiSettings()` 内部完成，任何入口进来都会走到（沿用 `loadAiSettings` 在读取入口自动迁移的既有约定，见 `spec/web/frontend/quality-guidelines.md:43`「迁移写在 loadAiSettings() 里，不做独立迁移函数」）：

```
1. cloud = await GET /api/ai/settings
2. legacy = 读 localStorage["yudu_ai_settings"]（旧格式，含明文）
3. 无 legacy 或 legacy.providers 为空  → 直接返回 cloud
4. cloud.providers.length === 0（首台设备）：
     for p of legacy.providers: await POST /api/ai/providers（原样带 id）
     await PUT /api/ai/settings（默认选择）
     全部 2xx 才 removeItem("yudu_ai_settings")     ← 失败则保留，下次重试
     return await GET /api/ai/settings
5. cloud 非空（后续设备）：
     不动手，返回 cloud 并置 pendingLocalCount = legacy.providers.length
     → 设置页顶部渲染「本机还有 N 个未同步配置 [导入到账号] [丢弃]」
     导入 = 走第 4 步的上传循环；丢弃 = removeItem 后提示消失
```

**清除本地明文前必须确认全部上传成功**——这是迁移唯一的不可逆点，上传失败就保留本地，宁可重复提示也不丢配置。

## 与既有规范的冲突（必须同步改 spec）

本改动**推翻了两条写死在 spec 里的约定**，不同步更新会让规范与实现互相矛盾，后续 AI 协作者会照旧规范写出错误代码：

| spec 位置 | 失效表述 | 处理 |
|---|---|---|
| `spec/api/backend/database-guidelines.md:13` | 「只存提供商 id，密钥与地址**永远不入库**」 | 改写为「密钥经 AES-GCM 加密后存 `ai_providers.api_key_enc`」，并把两张新表补进表清单 |
| `spec/web/frontend/quality-guidelines.md:39-43` | 「密钥**只存本浏览器**，任何情况下不入库、不上传」 | 整节重写为云端加密存储 + 分层读取 + 两键分离的缓存策略 |
| `spec/web/frontend/index.md:46` | 「设置（含**本机** AI 提供商配置）」 | 去掉「本机」 |
| `spec/web/frontend/state-management.md:47-50` | 「服务端 vs 本地」表中 AI 配置归本地 | 移到 API / D1 侧 |

同时**保留仍然成立的约定**：`resolveProvider` 的书级绑定回退语义、模型缓存内嵌 provider、新协议只在 `aiClient.ts` 分发——这些不受本次改动影响，重写时不要一并删掉。

## 兼容性与回滚

- migration 只新增两张表，不 ALTER 现有表 → 对旧代码完全透明。
- 回滚代码即可恢复旧行为；新表留着无害，无需 down migration。
- **唯一不可逆**：已完成迁移的设备本地明文已删，回滚旧版本后需重新配置。缓解手段是上述「2xx 才删除」，以及回滚窗口内云端数据仍完整、可手工导出。

## 风险

| 风险 | 处理 |
|---|---|
| 部署时忘记设 `AI_KEY_SECRET` | 接口 fail fast + 明确错误码；implement.md 把设 secret 列为部署第一步 |
| 迁移丢失 provider id 导致书级绑定失效 | POST 原样带 id；AC12 端到端验证 |
| 缓存键与迁移源键混用导致重复上传 | 两键分离（见上表），迁移只读 `yudu_ai_settings` |
| 密钥内存缓存在 provider 更新后过期 | PATCH/DELETE 成功后按 id 清除缓存条目 |
