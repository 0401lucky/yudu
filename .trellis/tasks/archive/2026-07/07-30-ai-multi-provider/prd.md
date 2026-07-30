# 多提供商与多协议 AI 配置（父任务）

## Goal

让用户存多套 API 配置（自建中转、Google 官方、Anthropic 官方…），在创作台直接挑「哪个服务的哪个模型」，不必每次换服务重填地址和密钥。同时把 `aiClient` 从写死 OpenAI 协议改为三协议适配。

## 源需求

用户原话：**「我可以配置多个中转或者官方的 API，有需要的话我再切换不同的服务的模型」**，并明确要「设置里那个提供商做成二级面板」「增加谷歌的协议」「增加 Claude 的协议」。

## 背景 / 为什么必须动书级数据

`AiSettings` 目前是单个 `{baseUrl, apiKey, model}`，`aiClient` 把 OpenAI 协议硬编码：`Bearer` 认证、`/v1/chat/completions`、SSE 读 `choices[0].delta.content`。

**关键约束**：`StudioBookDetail.model` 已经是书级的（DB `books.studio_model` 列），但只存模型名字符串。一旦有多个提供商，出现「这本书存的是 `gemini-2.5-pro`，当前激活的是 OpenAI 中转」时，请求会用错协议直接失败。**不补 `providerId` 功能就是坏的**，这不是可选优化。

## 三协议实测规格（2026-07-30 实测确认，非文档推断）

### CORS（决定可行性）

| 协议 | 浏览器直连 | 证据 |
|---|---|---|
| Anthropic | **必须带 `anthropic-dangerous-direct-browser-access: true`** | 不带该 header 的 OPTIONS 预检返回 **400 且响应无 `access-control-allow-origin`**（浏览器拦下）；带上后返回 **200 + `access-control-allow-origin: *`** |
| Gemini | 开箱可用，无需特殊 header | OPTIONS 预检 200，`Access-Control-Allow-Origin` 回显 Origin |
| OpenAI 兼容 | 取决于用户的中转配置 | 现状，已在用 |

> Anthropic 这条在官方 API 概览与流式文档中均未提及，属于必须实测才能发现的坑。

### 请求形状

| | OpenAI 兼容 | Gemini 原生 | Anthropic Messages |
|---|---|---|---|
| 路径 | `POST {base}/v1/chat/completions` | `POST {base}/v1beta/models/{model}:streamGenerateContent?alt=sse` | `POST {base}/v1/messages` |
| 认证 | `Authorization: Bearer {key}` | `x-goog-api-key: {key}` | `x-api-key: {key}` + `anthropic-version: 2023-06-01` |
| system | `messages` 里 `role:"system"` 一条 | 顶层 `systemInstruction: {parts:[{text}]}` | 顶层 `system: "…"` 字符串 |
| assistant 角色名 | `assistant` | **`model`** | `assistant` |
| max_tokens | 可选 | `generationConfig.maxOutputTokens` 可选 | **必填** |
| 额外 | — | 可传 `safetySettings` 全 `BLOCK_NONE`（破限模式的实质收益） | 浏览器需上表的 CORS header |

### 流式增量提取

| 协议 | 取值路径 | 需跳过 |
|---|---|---|
| OpenAI | `choices[0].delta.content` | `data: [DONE]` |
| Gemini | `candidates[0].content.parts[].text` | — |
| Anthropic | `delta.text`，仅当 `type === "content_block_delta"` 且 `delta.type === "text_delta"` | `ping` / `thinking_delta` / `signature_delta` / `input_json_delta` / `message_start` / `message_stop`；`event: error` 行需报错 |

### 模型列表

| 协议 | 请求 | 响应 |
|---|---|---|
| OpenAI | `GET {base}/v1/models` | `{data:[{id}]}` |
| Gemini | `GET {base}/v1beta/models` + `x-goog-api-key` | `{models:[{name:"models/gemini-…"}]}`，需剥 `models/` 前缀 |
| Anthropic | `GET {base}/v1/models?limit=1000` + 三个 header | `{data:[{id, display_name, max_tokens}]}` |

### 错误体形状

| 协议 | 形状 |
|---|---|
| OpenAI | `{error:{message}}` |
| Gemini | `{error:{code, message, status}}` |
| Anthropic | `{type:"error", error:{type, message}}` |

## 子任务

| 子任务 | 范围 | 独立验收 |
|---|---|---|
| `07-30-ai-provider-store` | `AiSettings` 改 `providers[]`、老数据迁移、设置页二级面板、书级 `providerId`（D1 加列）。仅 OpenAI 协议 | 能存多套中转并在创作台切换 |
| `07-30-ai-protocol-adapters` | `aiClient` 拆协议适配层，新增 Gemini 与 Anthropic 适配器 | 能用 Gemini 原生和 Claude 官方生成 |

**拆分理由**：阶段 1 动存储与数据模型，影响面广；阶段 2 是新增代码路径，不改已有的。混做出问题不好定位。阶段 1 完成后功能自洽（多套中转可切换），阶段 2 是纯增量。

**顺序约束**：必须先 1 后 2 —— 适配器需要 `AiProvider.protocol` 字段才有分发依据。

## 跨子任务验收标准

- [ ] 能添加/编辑/删除多个提供商，每个有独立的名称、协议、地址、密钥、模型缓存
- [ ] 创作台模型选择器跨提供商列出，形如「我的中转 / gpt-4o」
- [ ] 每本书记住自己的提供商 + 模型，切换其它书不受影响
- [ ] 改造前的单套配置自动迁移为一个提供商，老作品仍能生成
- [ ] 用 Gemini 原生协议生成时安全过滤可关闭（破限模式实质可用）
- [ ] 用 Anthropic 协议在浏览器中生成成功（验证 CORS header 生效）
- [ ] 三种协议的流式增量都能正确逐字显示
- [ ] `pnpm -r typecheck` 与 `pnpm -r test` 全绿

## 约束

- 密钥仍只存浏览器 localStorage，不上传雨读服务器（现有承诺不变）。
- 不改动创作台五个步骤（立项/人设/大纲/细纲/正文）的业务逻辑与提示词。
- 不引入新的 runtime 依赖（见 `.trellis/spec/web/frontend/quality-guidelines.md` 依赖纪律）。
- 老数据必须自动迁移，用户不需要重填任何东西。
