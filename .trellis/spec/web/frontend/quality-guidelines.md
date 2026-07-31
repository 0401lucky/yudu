# 质量约定 — @yudu/web

## 必须遵守

1. **API 只经 `lib/api.ts`**，且 `credentials: "include"`
2. **类型与常量对齐 `@yudu/shared`**
3. **鉴权路由**放在 `RequireAuth` 下；401 时登录态清空（`auth.tsx`）
4. **导入响应**按 `BookSummary[]` 处理（`importBooks` 兼容单对象历史形状）
5. **中文产品文案**；错误优先展示服务端 `message`

## 移动端与阅读体验

- 布局响应式（书架网格、阅读工具栏）
- `overscroll-behavior: none` 减少 iOS 整页拖动
- 安全区 padding；阅读区 `100dvh`
- 键盘左右键翻页（`ReaderPage`）；触控区由 Viewport/Chrome 处理

## 性能与动效

- **新页面必须 `React.lazy`** 懒加载（App.tsx 全部页面已按路由分割；主包 gzip ≈65KB）
- 动效只用 `transform`/`opacity`，时长 ≤300ms（`--motion-*`/`--ease-out`），尊重 `prefers-reduced-motion`
- 弹层优先复用 `DrawerShell`/`SheetShell`（常驻挂载 + 过渡 + 卸载时序已封装）；页面根元素加 `yudu-page-in`
- 大列表容器加 `content-visibility: auto`；封面图 `loading="lazy"` + 淡入

## 创作台 AI 输出解析（`lib/studioPrompts.ts`）

用户自配中转 API，模型能力与听话程度不可控。因此：

- **不用 JSON mode**，用「纯文本 + `字段名：值` 行」约定；行扫描统一走 `scanFields`（会剥掉 markdown 星号与列表符号）。
- **必须有退化路径**：主解析出 0 条时退回旧格式或更宽松的切分（见 `parseCharactersFromAi` → `parseLegacyCharacters`、`parseTitlesFromAi` 的裸列表兜底）。
- **解析失败不清空用户数据**：报可读错误并保留原值；多字段结果逐项「有值才覆盖」（见 `genPremise`）。
- 提示词里的字段名与解析、UI 标签共用一张常量表（`CHARACTER_FIELDS` / `OUTLINE_FIELDS` / `CHAPTER_FIELDS`），避免三处漂移。

### 结构化字段与旧字符串共存

创作台把自由文本升级为结构化字段时，**保留原字符串字段装历史数据，不做迁移**。已按此模式做过三次：

| 结构化字段 | 旧字符串 | 界面 |
|---|---|---|
| `StudioCharacter` 8 维度 | `description` | 展开区底部「旧描述」虚线框 |
| `StudioAssets.outlineDetail` | `outline` | 面板底部「旧大纲」虚线框 |
| `StudioChapterOutline` 的 `conflict`/`hook` | `summary` | `summary` 仍作主字段「本章梗概」 |

理由：旧数据全在 D1 的 `studio_assets` JSON 里，改字段类型或删除都要写迁移分支。保留后零迁移，且给下游的格式化函数（`formatCharacters` / `formatOutline`）统一处理「有结构化用结构化，否则回退旧字符串」，老作品行为与改造前完全一致。

## AI 提供商配置（`lib/aiSettings.ts`）

配置**跟随账号存服务端**：`ai_providers` 表存 `providers[]`（每套自带 `protocol` / `baseUrl` / 加密密钥 / 独立 `models` 缓存），`user_ai_settings` 表存一对全局默认 `defaultProviderId` + `defaultModel`。密钥经 AES-GCM 加密后落库（主密钥 = Worker Secret `AI_KEY_SECRET`），明文不入库。

- **分层读取，列表不带明文**：`GET /api/ai/settings` 只回 `keyMask`（如 `sk-…a1b2`），明文密钥经 `GET /api/ai/providers/:id/key` 单独取，仅在即将调用第三方 API 时请求，取回后在内存 Map 缓存到本次会话结束。因此 `hasCredentials()` 判据是 `keyMask` 而非明文。
- **两个 localStorage 键职责不同，绝不可合并**：`yudu_ai_settings` 是旧版明文配置、只作迁移来源；`yudu_ai_settings_cache` 是不含密钥的首屏缓存。合用一个键会让迁移检测把自己写的缓存当成待迁移数据，陷入重复上传。
- **迁移仍写在读取入口 `fetchAiSettings()` 里，不做独立迁移函数**：保证任何路径进来都已处理。云端为空则静默上传本机旧配置并清除本地明文；云端已有则挂起，由设置页提示手动导入或丢弃。**上传全部成功才清本地**，部分失败保留下次重试（同 `useBookmarks` 的书签迁移口径）。上传必须原样带上旧 `id`——`books.studio_provider_id` 引用着它们，换 id 会让已绑定的书失效。
- **模型缓存内嵌在 provider 内**，不再有全局 cache 键——拉取 B 的列表不会覆盖 A 的，也就没有「缓存与当前 baseUrl 不匹配」的 stale 概念。
- **书级绑定是 `providerId` + `model` 两列**（D1 `studio_provider_id` / `studio_model`），与全局默认字段同构，两者必须同时落库。解析统一走 `resolveProvider(settings, bookProviderId?, bookModel?)`：书未绑定或绑定的提供商已删除时回退全局默认，拿不到就返回 `null` 让调用方提示。
- **写操作后广播 `yudu-ai-settings-changed`**，其余组件只重读缓存、不重新请求；`fetchAiSettings()` 刷新缓存后同样广播，让同页面组件（如创作台列表页的「AI 就绪」判断）同步。
- **登出必须调 `resetAiSettingsState()`**，清掉内存密钥、本地缓存与迁移标记，否则换账号后首屏会串到上一个账号的提供商列表。
- 新协议只在 `aiClient.ts` 内分发，`listAiModels` / `streamChatCompletion` 的签名接收 `AiProvider`（= `AiProviderMeta` + 明文 `apiKey`）而非整个 settings，加协议不改调用方。

### 三种协议的差异（`lib/aiClient.ts`）

对外只有两个函数，内部按 `provider.protocol` 分发。加新协议时改这四处：`protocolHeaders`、请求 URL/body 分支、`extractDelta`、模型列表解析。

| | OpenAI 兼容 | Gemini 原生 | Anthropic Messages |
|---|---|---|---|
| 鉴权 | `Authorization: Bearer` | `x-goog-api-key` | `x-api-key` + `anthropic-version` |
| 模型列表 | `/v1/models`，取 `data[].id` | `/v1beta/models`，取 `models[].name` 去 `models/` 前缀，按 `supportedGenerationMethods` 滤掉 embedding | `/v1/models`，同 OpenAI |
| 流式端点 | `/v1/chat/completions` | `/v1beta/models/{model}:streamGenerateContent?alt=sse` | `/v1/messages` |
| system | 留在 `messages` 里 | 提到 `systemInstruction` | 提到顶层 `system` |
| 增量字段 | `choices[0].delta.content` | `candidates[0].content.parts[].text` | `content_block_delta` 的 `delta.text` |

踩过的坑：

- Gemini 不带 `alt=sse` 会返回一整个 JSON 数组而非逐包 SSE，前端会一直等到结束才出字。
- Anthropic 浏览器直连必须带 `anthropic-dangerous-direct-browser-access: true`，否则直接被拒；且 `max_tokens` 是必填项（`ANTHROPIC_MAX_TOKENS`）。
- Gemini 的 `safetySettings` 四类全设 `BLOCK_NONE`：默认阈值会把长篇小说里正常的冲突/暴力情节判为拦截。尺度由提示词侧的破限模式控制，不在传输层做二次限制。
- 被安全策略拦截时 `candidates[0]` 没有 `content` 字段，`extractDelta` 必须容忍缺字段而不是抛错。
- Gemini / Anthropic 的地址是固定的，`baseUrl` 留空即回落 `PROTOCOL_DEFAULT_BASE_URLS`；因此「凭证是否齐全」要走 `hasCredentials()`，只有 OpenAI 兼容才强制要求填地址。

## 依赖纪律

当前 runtime 依赖仅：`react`、`react-dom`、`react-router-dom`、`@yudu/shared`。

新增 UI/状态库前需明确理由；默认用现有 Tailwind + 自研组件。

## 测试

- `vitest run --passWithNoTests`：web 包测试较少
- 改 `lib/api` 契约时同步跑 api 测试与手动验收导入/阅读
- 关键逻辑优先在 shared 或 api 单测覆盖

## 调试日志

导入路径允许 `console.info` / `console.error` 带 `[雨读]` 前缀（`LibraryPage`）。不要在翻页热路径打 log。

## 构建与部署

```bash
pnpm --filter @yudu/web build   # 产出 apps/web/dist
# API wrangler assets.directory = "../web/dist"
```

改 `base` 或路由 mode 会影响 Workers SPA 回退，需与 `wrangler.toml` `not_found_handling` 一致。

## 反模式

- `localStorage` 存密码或 session token（会话在 HttpOnly Cookie）
- 阅读页阻塞在每次翻页 await 进度 API（应走 debounce schedule）
- 删除书籍不二次确认
- 忽略 `book.status !== "ready"` 仍进入阅读器（`BookCard` 已限制）
