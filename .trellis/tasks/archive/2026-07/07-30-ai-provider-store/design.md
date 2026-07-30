# 技术设计：多提供商基础设施与设置页二级面板

## 1. 改动边界

| 层 | 文件 | 改动 |
|---|---|---|
| 存储 | `apps/web/src/lib/aiSettings.ts` | 全面重构为多提供商 + 迁移 |
| 存储测试 | `apps/web/src/lib/aiSettings.test.ts` | 迁移与增删改查用例 |
| DB | `apps/api/migrations/0009_studio_provider.sql`（新建） | `books` 加列 |
| 类型 | `packages/shared/src/types.ts` | `StudioBookDetail` 加 `providerId?` |
| 后端 | `apps/api/src/services/studioBook.ts` | 读写新列 |
| UI | `apps/web/src/components/AiProviderSettings.tsx`（新建） | 二级面板 |
| UI | `apps/web/src/pages/SettingsPage.tsx` | 删掉内联 AI 段，接线新组件 |
| UI | `apps/web/src/components/StudioModelPicker.tsx` | 跨提供商列出 |
| UI | `apps/web/src/pages/StudioListPage.tsx` | 默认提供商/模型选择 |
| UI | `apps/web/src/pages/StudioWorkPage.tsx` | `requireAi` / `runStream` 改用提供商 |
| 客户端 | `apps/web/src/lib/aiClient.ts` | 签名从 `AiSettings` 改为 `AiProvider` |

不动：创作台五步的业务逻辑、`studioPrompts.ts`、四个创作面板组件。

## 2. 数据契约

```ts
/** 协议类型；本阶段只实现 openai，其余两个留给阶段 2 */
export type AiProtocol = "openai" | "gemini" | "anthropic";

export interface AiProvider {
  /** 稳定 id，创建时生成，用于书级绑定 */
  id: string;
  /** 用户自定义名称，如「我的中转」「Google 官方」 */
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  /** 该提供商独立的模型列表缓存 */
  models: string[];
  modelsFetchedAt: number;
}

export interface AiSettings {
  providers: AiProvider[];
  /** 全局默认，新建作品与未绑定的书回退到这里 */
  defaultProviderId?: string;
  defaultModel?: string;
}
```

**为什么模型缓存内嵌进 provider 而不是单独的 cache key**：现有 `AiModelsCache` 与单个 `baseUrl` 绑定，多提供商后必须按提供商分开存，否则拉取 B 的列表会覆盖 A 的。内嵌后「哪个模型属于哪个提供商」在数据结构上就是明确的，模型选择器不需要额外关联逻辑。

**为什么 `defaultModel` 与 `defaultProviderId` 分开而非合成一个引用对象**：书级也是这对字段（`studio_provider_id` + `studio_model` 两列），保持前后端同构，少一层转换。

### 2.1 存储键

沿用 `yudu_ai_settings` 作为唯一键。旧的 `yudu_ai_models_cache` 迁移后删除。`yudu_adult_confirmed` 不变。

### 2.2 迁移逻辑

`loadAiSettings()` 读到 JSON 后判断形态：

```
有 providers 数组 → 新格式，逐项归一化
否则若有 baseUrl 或 apiKey 或 model → 旧格式：
    造一个 {id: 新 uuid, name: "默认", protocol: "openai", baseUrl, apiKey,
            models: 旧 yudu_ai_models_cache.models ?? [], modelsFetchedAt: 旧 fetchedAt ?? 0}
    defaultProviderId = 该 id；defaultModel = 旧 model
否则 → 空 { providers: [] }
```

迁移在**读取时**完成并立即回写，旧的 models cache 键在回写成功后 `removeItem`。损坏 JSON 走 catch 返回空设置（与现状一致）。

**为什么在读取时迁移而不是写一个一次性迁移函数**：读取是唯一入口（`loadAiSettings` 被所有调用方使用），在这里做保证任何路径进来都拿到新格式，不存在"忘了调迁移"的情况。

## 3. 后端

### 3.1 D1 迁移

`apps/api/migrations/0009_studio_provider.sql`：

```sql
-- 创作台每本书记住使用哪个 AI 提供商（仅提供商 id，非密钥；密钥仍只存浏览器本地）
-- 旧行：studio_provider_id=NULL，生成时回退到浏览器全局默认提供商

ALTER TABLE books ADD COLUMN studio_provider_id TEXT;
```

与 `0008_studio_model.sql` 同一模式：可空、无默认值、老行天然回退。

**为什么加列而不是把 providerId 塞进 `studio_model` 复合串**：`studio_model` 有 `MAX_STUDIO_MODEL_CHARS = 200` 的长度校验，复合串会挤占额度；且复合串需要在前后端两处 split/join，是一个持续的解析负担。加列是 `ALTER TABLE ADD COLUMN`，无数据重写，风险等同 0008。

### 3.2 服务层

`studioBook.ts` 三处：
- `SUMMARY_SELECT` 与详情查询的列清单加 `studio_provider_id`
- `rowToStudioBookDetail` 映射为 `providerId: row.studio_provider_id ?? undefined`
- `patchStudioBook` 接受 `providerId`，与 `model` 同样的 trim + 长度校验（复用 `MAX_STUDIO_MODEL_CHARS`，id 是 uuid 远小于 200）

`providerId` 传空串视为清除（写 NULL），与 `model` 的既有语义一致。

## 4. 客户端层

`aiClient.ts` 的两个导出函数签名从接收 `AiSettings` 改为接收 `AiProvider`：

```ts
export async function listAiModels(provider: AiProvider, signal?: AbortSignal): Promise<string[]>
export async function streamChatCompletion(options: {
  provider: AiProvider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<string>
```

内部实现本阶段不变（仍是 OpenAI 协议硬编码），只是数据来源换了。阶段 2 在此处插入协议分发，签名不再变——这是本阶段刻意把签名先改到位的原因。

`normalizeAiBaseUrl` 保持不变。

## 5. UI

### 5.1 `AiProviderSettings.tsx`

一个组件内含两个视图，靠 `view` state 切换：

```
view: { mode: "list" } | { mode: "edit", providerId: string } | { mode: "create" }
```

**列表视图**
```
┌─ AI 提供商 ────────────────────────────────┐
│ 密钥只存本浏览器，不会上传到雨读服务器        │
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ 我的中转          OpenAI 兼容   ✓默认  │ │
│ │ 42 个模型                    编辑  删除│ │
│ └────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────┐ │
│ │ Google 官方       Gemini              │ │
│ │ 尚未获取模型         设为默认 编辑 删除│ │
│ └────────────────────────────────────────┘ │
│              ＋ 添加提供商                  │
└────────────────────────────────────────────┘
```

**详情视图**：`← 返回列表` + 名称 / 协议 select / Base URL / API Key / 「获取模型列表」按钮 + 模型数提示 / 保存。协议 select 三项都列出，非 openai 项标注「阶段 2 支持」——本阶段选了也能存，只是生成时会提示不支持。

> 备选方案（未采用）：用 `<details>` 折叠每个提供商，省掉视图切换。否决原因——提供商详情有 5 个字段加一个异步拉取动作，折叠展开后页面会很长，且「编辑中」的状态不明确；用户明确要的是「二级面板」。

### 5.2 `StudioModelPicker` 改造

现在的 `value: string` / `onSelect(model: string)` 改为：

```ts
value?: { providerId: string; model: string };
onSelect?: (providerId: string, model: string) => void;
```

内部把所有提供商的模型摊平成 `{providerId, providerName, model}[]`，显示 `providerName / model`，搜索同时匹配两者。非受控模式（列表页的全局默认）读写 `defaultProviderId` + `defaultModel`。

组件当前 476 行，改造后逻辑更集中（不再需要 stale 判断——每个提供商的模型就是自己的，不存在"缓存与当前 baseUrl 不匹配"的概念）。**`stale` 相关代码整体删除**，这是多提供商化的自然结果，不是顺手重构。

### 5.3 提供商解析

新增一个纯函数，被 `StudioWorkPage` 和其它调用方共用：

```ts
/** 解析某本书实际要用的提供商与模型；书未绑定则回退全局默认 */
export function resolveProvider(
  settings: AiSettings,
  bookProviderId?: string,
  bookModel?: string,
): { provider: AiProvider; model: string } | null
```

返回 null 的三种情况：无任何提供商、指定的提供商已被删除且无默认、提供商存在但模型为空。调用方据此给出可读提示。

`isAiSettingsReady()` 改为 `resolveProvider(settings) !== null`。

## 6. 兼容性

| 场景 | 行为 |
|---|---|
| 改造前配好的用户 | 读取时自动迁移为「默认」提供商，地址/密钥/模型列表全部保留，旧 cache 键清理 |
| 老作品（`studio_provider_id` 为 NULL） | `providerId` 为 undefined → `resolveProvider` 回退全局默认 → 行为等同改造前 |
| 书绑定的提供商被删除 | 回退全局默认；若无默认则提示去设置页配置 |
| 一个提供商都没有 | 生成按钮点击后提示"请先在设置中添加 AI 提供商"，不崩溃 |
| localStorage 损坏 | catch 返回 `{providers: []}`，等同全新用户 |

## 7. 测试

`apps/web/src/lib/aiSettings.test.ts`（现有 4 项，扩充）：

1. 旧格式 `{baseUrl, apiKey, model}` → 迁移出一个「默认」提供商，字段对应正确
2. 旧格式 + 旧 models cache → 模型列表并入该提供商，`modelsFetchedAt` 保留
3. 迁移后旧 cache 键被清除
4. 新格式原样读出，不重复迁移
5. 空 localStorage → `{providers: []}`
6. 损坏 JSON → `{providers: []}`
7. `resolveProvider`：书绑定命中、书绑定的提供商已删除→回退默认、无默认→null、模型为空→null
8. 增删改提供商后 `defaultProviderId` 的维护（删除默认提供商后默认清空）

`apps/api/src/services/studioBook.test.ts`：

9. `patchStudioBook` 写入并读回 `providerId`
10. `providerId` 传空串→清除为 undefined；超长→抛校验错误

命令：`pnpm -r typecheck && pnpm -r test && pnpm --filter @yudu/web build`

## 8. 不做

- Gemini / Anthropic 的请求构造与流式解析（阶段 2）
- 提供商配置的导入 / 导出
- 提供商排序拖拽
- 每个提供商独立的 temperature / max_tokens 等生成参数（阶段 2 视 Anthropic 的 max_tokens 必填需求再定）
- 创作台五步的业务逻辑调整
