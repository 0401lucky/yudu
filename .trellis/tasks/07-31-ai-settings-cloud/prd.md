# AI 配置跟随账号云端同步

## Goal

把 AI 提供商配置（名称 / 协议 / 地址 / API Key / 模型列表 / 默认选择）从浏览器 localStorage 迁到服务端，按账号加密存取，使同一账号在任意设备登录后无需重复配置即可使用创作台。

## Background

### 用户痛点

用户有多台设备，换设备就要把 API 地址与密钥重配一遍。

### 现存缺陷（本任务顺带修复）

书级绑定已上云、密钥没上云，形成断层：

- `books.studio_provider_id`（`apps/api/migrations/0009_studio_provider.sql`）与 `books.studio_model`（`0008_studio_model.sql`）在服务端。
- `AiProvider`（含 `apiKey`）只在 localStorage（`apps/web/src/lib/aiSettings.ts:2`）。
- 后果：换设备后 `resolveProvider()`（`aiSettings.ts:255`）按 `bookProviderId` 找不到本地 provider，静默回退全局默认；新设备无配置时直接不可用。

## Confirmed Facts

### 前端存储现状

- 存储键 `yudu_ai_settings`（`aiSettings.ts:6`），读写 API 全同步。
- 结构：`AiSettings { providers: AiProvider[]; defaultProviderId?; defaultModel? }`；`AiProvider { id, name, protocol, baseUrl, apiKey, models[], modelsFetchedAt }`（`aiSettings.ts:20-39`）。
- `protocol` 三值：`openai` | `gemini` | `anthropic`（`aiSettings.ts:12`）。
- 已有一次历史迁移先例：旧版单套 `{baseUrl, apiKey, model}` → 多提供商，在读取入口自动完成并回写（`migrateLegacy`，`aiSettings.ts:90-121`）。
- `ADULT_CONFIRMED_KEY`（`aiSettings.ts:9`）同文件但属纯本地 UI 状态，**不在本任务范围**。

### 调用点（改造影响面）

| 文件 | 行数 | 用法 |
|---|---|---|
| `apps/web/src/components/AiProviderSettings.tsx` | 384 | 设置面板增删改查；`useState(() => loadAiSettings())`（:41） |
| `apps/web/src/components/StudioModelPicker.tsx` | 492 | 模型选择器（:49）；`refresh()` 批量拉模型列表（:113-139） |
| `apps/web/src/pages/StudioWorkPage.tsx` | 883 | `requireAi()` 同步调 `loadAiSettings()`（:150-152） |
| `apps/web/src/pages/StudioListPage.tsx` | 220 | `isAiSettingsReady()` 判断能否创作（:21, :36, :113） |
| `apps/web/src/lib/aiSettings.test.ts` | 265 | 现有单测 |

- 跨组件同步靠 `window` 自定义事件 `yudu-ai-settings-changed` + `storage` 事件（`StudioModelPicker.tsx:53-65`、`AiProviderSettings.tsx:48-51`）。
- `aiClient.ts` 只消费 `AiProvider` 对象、不读存储，存储层改造不影响其内部逻辑。

### 后端现状

- Hono + D1 + R2；Cookie session 鉴权（`apps/api/src/middleware/auth.ts`）设置 `userId`。
- `user_preferences` 表 + `/api/preferences`（`apps/api/src/routes/preferences.ts`）是「跟随账号的用户设置」现成模板。
- `SESSION_SECRET` 已是 Worker secret 用法（`apps/api/src/env.ts`），未写入 `wrangler.toml`，新增 `AI_KEY_SECRET` 同构。
- `session.ts` 已用 WebCrypto（`crypto.subtle` HMAC-SHA256）并自带 `bytesToBase64Url` / `bytesToHex` helper；AES-GCM 同属 WebCrypto，Workers 原生支持，**无需新依赖**。
- 后端测试用 vitest + 手写 Mock D1（`bookmarks.test.ts:27-45` 模式），不依赖 miniflare。
- 前端 API 层为纯函数式 fetch 封装（`apps/web/src/lib/api.ts`），`credentials: "include"`；无 React Query 等数据层。
- 共享 DTO 类型放 `packages/shared/src/types.ts`，常量放 `constants.ts`。

### 关键约束

- **AI 请求是浏览器直连第三方**（`aiClient.ts:315`；Anthropic 还需 `anthropic-dangerous-direct-browser-access` 头，:58）。浏览器最终必须持有明文 API Key，服务端加密只保护静态存储。
- **创作台要求登录**（`/api/studio/*` 全挂 `authMiddleware`），不存在「未登录也要用 AI 配置」的场景。
- 注册接口开放无邀请码（`apps/api/src/routes/auth.ts:89`），线上实例理论上可能有其他用户。

## Decisions

| ID | 决策 | 理由 |
|---|---|---|
| D1 | **服务端加密存储**：Worker Secret `AI_KEY_SECRET` + AES-GCM，密文存 D1 | D1 数据/备份泄露不足以还原密钥；不选端到端加密是因为改密码/忘密码会导致配置丢失，与「省事」的初衷相悖 |
| D2 | **分层读取**：列表接口只返回掩码，明文密钥单独按需取 | 进页面/看设置/切模型不传密钥，XSS 暴露窗口最小；非敏感部分可本地缓存，UI 首屏不闪烁 |
| D3 | **智能迁移**：云端为空则静默上传并清本地明文；云端非空则不动手，设置页提示可手动导入或丢弃 | 多设备各有本地配置时不静默丢失，也不自动制造重复项 |
| D4 | **直接改为云端**，更新全部隐私文案，不做本地/云端双模式开关 | 双模式会让读取、保存、迁移、书级绑定解析全部分成两套路径，复杂度翻倍 |
| D5 | **冲突处理用 last-write-wins**，不做版本号或乐观锁 | 单人多设备、配置极少变更，并发编辑窗口趋近于零 |
| D6 | **删除 provider 后书级绑定沿用现有回退**，不额外清理 `books.studio_provider_id` | `resolveProvider()` 已有回退逻辑且行为合理，无需新增清理路径 |

## Requirements

### 后端

- **R1** 新增 `ai_providers` 表（按 `user_id` 隔离）与 `user_ai_settings` 表（默认提供商/模型），随 migration 交付。
- **R2** API Key 使用 AES-GCM 加密后落库，每条记录独立随机 IV；密钥由 `AI_KEY_SECRET` 派生。明文不得进入 D1。
- **R3** `AI_KEY_SECRET` 缺失时接口 fail fast 返回明确错误，**不得**降级为明文存储。
- **R4** 提供以下端点，全部经 `authMiddleware` 且严格按 `userId` 过滤：
  - `GET /api/ai/settings` — 返回全部 provider（含 `keyMask`，**不含明文**）+ 默认选择
  - `POST /api/ai/providers` — 新建（body 含明文 apiKey）
  - `PATCH /api/ai/providers/:id` — 更新；`apiKey` 缺省表示不改动已存密钥
  - `DELETE /api/ai/providers/:id`
  - `GET /api/ai/providers/:id/key` — 返回单个明文密钥
  - `PUT /api/ai/settings` — 只写默认 providerId / model
- **R5** 跨用户访问他人 provider 返回 404（不泄露存在性）。

### 前端

- **R6** `aiSettings.ts` 存储层改为云端读写；`resolveProvider` / `hasCredentials` / `normalizeProvider` 等纯逻辑保留并继续单测。
- **R7** 类型拆分：列表态 provider 不携带明文 apiKey（改持 `keyMask`），仅在发起 AI 请求前按需取明文组装。
- **R8** 非敏感配置（名称/协议/地址/模型列表/默认选择/掩码）缓存到 localStorage，供首屏同步渲染，避免进创作台闪烁。
- **R9** 实现 D3 迁移：云端为空且本地有配置 → 自动上传并清除本地明文；云端非空且本地仍有残留 → 设置页顶部显示「本机还有 N 个未同步配置」+ 导入 / 丢弃。
- **R10** 更新全部隐私文案（6 处）：`AiProviderSettings.tsx:38`、`:88`、`:184`、`:360`、`:374`，以及 `aiSettings.ts:2`。

### 规范文档（本次改动推翻了既有 spec 约定，必须同步）

- **R11** 更新以下 spec，否则规范与实现互相矛盾：
  - `.trellis/spec/api/backend/database-guidelines.md:13` —「只存提供商 id，密钥与地址**永远不入库**」已被推翻；改写并补充 `ai_providers` / `user_ai_settings` 两张新表。
  - `.trellis/spec/web/frontend/quality-guidelines.md:39-43` —「AI 提供商配置」整节，「密钥**只存本浏览器**，任何情况下不入库、不上传」需重写为云端加密存储 + 分层读取。
  - `.trellis/spec/web/frontend/index.md:46` —「设置（含**本机** AI 提供商配置）」去掉「本机」。
  - `.trellis/spec/web/frontend/state-management.md:47-50` —「服务端 vs 本地」表把 AI 配置归入 API / D1 侧。

### 文案对照（R10）

| 位置 | 旧 | 新 |
|---|---|---|
| `AiProviderSettings.tsx:184` | 地址与密钥只保存在本浏览器，不会上传到雨读服务器。 | 地址与密钥加密后保存在你的账号下，换设备登录即可直接使用。 |
| `:374` | 保存到本机 | 保存 |
| `:88` | 地址、密钥与模型列表都会从本机移除。 | 地址、密钥与模型列表都会从账号中删除。 |
| `:360` | 本机已存 N 个模型 | 已存 N 个模型 |
| `:38`、`aiSettings.ts:2` | 只写浏览器 localStorage，不上传雨读服务器 | 加密后随账号存储在服务端 |

## Acceptance Criteria

- [x] **AC1**（R1、R2）新建 provider 后直接查 D1，`api_key_enc` 列不含明文密钥子串；同一密钥两次写入产生不同密文（IV 随机）。
- [x] **AC2**（R2）加解密往返测试：`decrypt(encrypt(k)) === k`，覆盖空串、超长串、含非 ASCII 字符的密钥。
- [x] **AC3**（R3）未配置 `AI_KEY_SECRET` 时，写入类接口返回 5xx 且响应体带明确错误码，D1 中不出现新记录。
- [x] **AC4**（R4）`GET /api/ai/settings` 响应体全文不含任何明文密钥，每个 provider 带 `keyMask`。
- [x] **AC5**（R4）`PATCH` 不传 `apiKey` 时，改完再 `GET .../key` 仍返回原密钥。
- [x] **AC6**（R5）用户 B 访问用户 A 的 provider（GET key / PATCH / DELETE）一律 404。
- [x] **AC7**（R6）`aiSettings.test.ts` 全绿；`resolveProvider` 的书级绑定回退行为与改造前一致。
- [x] **AC8**（R8）已登录且有缓存时，进入 `/studio` 首屏即渲染出模型选择器，无「无配置」闪烁。
- [x] **AC9**（R9）云端为空 + 本地有配置 → 登录后自动出现在设置页，且 localStorage 中不再有明文密钥。
- [x] **AC10**（R9）云端非空 + 本地有残留 → 设置页显示未同步提示；点导入后合并成功，点丢弃后提示消失且不再出现。
      *验证范围：`aiSettings.test.ts` 覆盖挂起 / 导入 / 丢弃三条逻辑路径；提示条 UI 未在浏览器实测。*
- [x] **AC11**（R10）全仓库检索不到「不会上传到雨读服务器」「保存到本机」等旧文案。
- [x] **AC12** 端到端：浏览器 1 配置 → 浏览器 2（不同 profile）登录同账号 → 直接可见配置并成功生成正文。
      *验证范围：以「清空全部 localStorage」模拟换设备，配置从云端完整恢复、模型选择器直接可用；「生成正文」需真实第三方 API Key，未实测。*
- [x] **AC13** `pnpm typecheck`、`pnpm test`、`pnpm build` 全通过。
- [x] **AC14**（R11）4 处 spec 更新完成，全仓检索不到「密钥与地址永远不入库」「只存本浏览器」等已失效表述。
- [x] **AC15**（R7、R8）正常使用后检查 `localStorage` 的 `yudu_ai_settings_cache`，内容只含 `keyMask`，不含任何明文密钥。

## Out of Scope

- 后端代理 AI 请求（key 永不出服务端 + 顺带解决 CORS）——工作量是本方案 2–3 倍，另行评估。
- 端到端加密（用户密码派生密钥）。
- `AI_KEY_SECRET` 轮换与历史密文重加密流程。
- `ADULT_CONFIRMED_KEY` 等纯本地 UI 状态上云。
- 多设备并发编辑的版本控制（见 D5）。

## Deployment Note

上线前必须先执行 `cd apps/api && pnpm exec wrangler secret put AI_KEY_SECRET`（值取足够长的随机串），再应用远程 migration、最后部署。顺序颠倒会导致 AI 配置接口全部 5xx。完整步骤见 `implement.md` 阶段 E。
