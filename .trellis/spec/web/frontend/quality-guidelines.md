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

`yudu_ai_settings` 存 `providers[]`（每套自带 `protocol` / `baseUrl` / `apiKey` / 独立 `models` 缓存）加一对全局默认 `defaultProviderId` + `defaultModel`。密钥**只存本浏览器**，任何情况下不入库、不上传。

- **迁移写在 `loadAiSettings()` 里，不做独立迁移函数**：读取是唯一入口，放这里保证任何路径进来都是新格式，不存在「忘了调迁移」。旧的 `{baseUrl, apiKey, model}` 会连同 `yudu_ai_models_cache` 并入一个名为「默认」的提供商，回写后删除旧键。**该迁移不可逆**，改动它前先补 `aiSettings.test.ts`。
- **模型缓存内嵌在 provider 内**，不再有全局 cache 键——拉取 B 的列表不会覆盖 A 的，也就没有「缓存与当前 baseUrl 不匹配」的 stale 概念。
- **书级绑定是 `providerId` + `model` 两列**（D1 `studio_provider_id` / `studio_model`），与前端的一对默认字段同构，两者必须同时落库。解析统一走 `resolveProvider(settings, bookProviderId?, bookModel?)`：书未绑定或绑定的提供商已删除时回退全局默认，拿不到就返回 `null` 让调用方提示。
- 新协议只在 `aiClient.ts` 内分发，`listAiModels` / `streamChatCompletion` 的签名接收 `AiProvider` 而非整个 settings，加协议不改调用方。

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
