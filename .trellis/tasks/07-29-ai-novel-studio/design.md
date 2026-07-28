# AI 小说创作台 — 技术设计

## Architecture

采用 **路径 1：创作扩展现有 Book**，与 PRD「书架与创作台同一份作品」一致。

```
@yudu/web                          @yudu/api
┌─────────────────────┐            ┌──────────────────────┐
│ 导航 /studio         │  REST     │ books (source=studio) │
│ Studio 工作流 UI     │◄─────────►│ studio assets (JSON)  │
│ Chapter 纯文本编辑   │            │ chapters + R2 text    │
│ localStorage AI cfg  │            │ on_shelf / breakLimit │
│ fetch → user new-api │            └──────────────────────┘
└──────────┬──────────┘
           │ HTTPS Chat Completions (stream)
           ▼
     用户自建 new-api + 可选破限模型
```

**边界：**

- 雨读 API：只负责作品元数据、设定、章节正文的存取与上架可见性；**不**调用 LLM。
- 浏览器：持有 API Key；直连 new-api 做生成；将结果经雨读 API 写入云端。

## Data Model

### Book 扩展（概念字段，具体列名实现时按现有 migration 风格）

| 字段 | 说明 |
|------|------|
| `source` | `import` \| `studio`（既有导入书为 import） |
| `on_shelf` | 是否出现在书架；studio 默认 `false`；import 视为 `true` |
| `break_limit` | 是否破限/18+ 创作模式 |
| 既有字段 | title、format、chapter_count、status 等继续复用 |

`format`：studio 正文按纯文本章节存储，建议固定为与 txt 可读路径兼容的格式（如 `txt` 或新增 `studio`；若新增须同步 shared 与阅读器 contentMode，**优先复用 txt 纯文本阅读路径**以免扩散）。

### Studio 设定资产

挂在 `book_id` 下，建议单行或单对象存储（D1 JSON 文本或 R2 一文件），例如：

```ts
type StudioAssets = {
  premise?: { genre?: string; tone?: string; targetLength?: string; notes?: string };
  characters: Array<{ id: string; name: string; role: string; description: string }>;
  outline: string; // 总大纲
  chapterOutlines: Array<{ index: number; title: string; summary: string }>;
  updatedAt: string;
};
```

正文 **不** 放在 assets 内，仍走现有 chapters + R2。

### 章节写

- 创建章 / 更新章 title+text / 追加章：新 API 或扩展现有 books 路由。
- 更新后维护 `chapter_count` 与章节索引连续性。
- 与细纲：`chapterOutlines[i]` 对应 `chapters.idx = i`（生成时写入 title）。

### 用户成年确认

- 优先：`preferences` 或 user 表字段 `adult_confirmed_at`。
- 降级：`localStorage` key（实现选一，prd 已允许）。

## API 契约（草案）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/studio/books` | 创作列表（含未上架 studio 书） |
| POST | `/api/studio/books` | 新建 studio 书 |
| GET/PATCH | `/api/studio/books/:id` | 读/改立项字段（title、break_limit、on_shelf…） |
| GET/PUT | `/api/studio/books/:id/assets` | 人设/大纲/细纲 |
| PUT | `/api/books/:id/chapters/:idx` | 写/更新章正文（权限：仅 studio + 属主） |
| POST | `/api/books/:id/chapters` | 追加章 |
| POST | `/api/studio/books/:id/shelf` | body `{ onShelf: boolean }` |

书架 `GET /api/books`：**过滤** `on_shelf = true`（import 书保持可见）。

既有 `GET /api/books/:id/chapters/:idx` 阅读路径不变。

## Frontend

| 模块 | 职责 |
|------|------|
| 路由 `/studio`、`/studio/:bookId` | 列表与工作流 |
| `AiSettingsPanel` | baseURL / key / model → localStorage |
| `aiClient.ts` | OpenAI 兼容 chat.completions stream |
| `StudioWizard` | 步骤：立项 / 人设 / 大纲 / 细纲 / 正文 |
| `ChapterEditor` | 章列表 + textarea + 生成/停止/重生成 |
| 导航 | Library 旁增加创作台；深链「继续创作」「去阅读」 |

### 提示词策略（产品）

- 公共：中文网文/长篇助手；遵守用户大纲与人设；禁止未成年人相关性内容。
- `break_limit=true`：允许成人向、露骨描写；仍禁止未成年。
- `break_limit=false`：偏常规向，不主动引导露骨内容。
- 各步骤 system/user 模板分文件维护，便于调优。

### 流式

- `ReadableStream` / fetch SSE 或 `stream: true` 增量拼到编辑器。
- 生成中可取消（AbortController）；完成后显式或自动保存到 API。

## Compatibility

- 导入书：无 `source=studio` 或 source 默认 import；章节写接口拒绝非 studio。
- PDF 等非章节书：与 studio 无关。
- 进度/书签/高亮：沿用 bookId；下架不删进度。

## Security & Privacy

- API Key 仅 localStorage（或 session 级存储），不进雨读 DB、日志。
- 直连 new-api：用户需配置 CORS 允许雨读 Origin；文档/设置页说明。
- 属主校验：所有 studio/章节写与现有 books 一致。
- 破限为产品模式位 + 提示词，**非**安全沙箱；不宣称服务端内容合规扫描。

## Trade-offs

| 决策 | 取舍 |
|------|------|
| 扩展 Book vs 双实体 | 选扩展，避免同步，贴合实时同一份 |
| 直连 vs 代理 | 选直连，Key 不经 Workers；依赖 CORS |
| 纯文本 vs MD | 选纯文本，复用阅读链路 |
| 不审正文 | 满足破限目标；合规靠用户与模型 |

## Rollout / Rollback

- 特性以路由与 API 新增为主；书架过滤需兼容旧数据（import 视为 on_shelf=true）。
- 回滚：隐藏创作台入口 + 拒绝 studio 写；已有 studio 数据保留不影响 import 阅读。

## Testing Notes

- API：studio 建书、assets、写章、上架过滤、非属主 403、import 书禁止写章。
- Web：本地配置持久化、流式 mock、工作流保存、上架后 library 可见。
- 不强制在 CI 真实调用外部 new-api；aiClient 用 mock stream。
