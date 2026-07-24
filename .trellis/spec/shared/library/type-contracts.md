# 类型与常量契约 — @yudu/shared

## 常量（`constants.ts`）

| 符号 | 值 / 含义 | 使用方 |
|------|-----------|--------|
| `MAX_UPLOAD_BYTES` | 30MB | api 导入校验；web 可做前端提示 |
| `SUPPORTED_FORMATS` | `["txt","md","epub","pdf"]` | 导入白名单（pdf 为非章节化：仅存源文件） |
| `BookFormat` | 由 `SUPPORTED_FORMATS` 推导 | 元数据 format |
| `SESSION_COOKIE` | `"yudu_session"` | api 设/读 Cookie；与 web 间接一致 |
| `SESSION_DAYS` | `30` | 会话过期与 Cookie maxAge |

改常量前必须全仓搜索引用（api `importBook` / `session` / `auth`，web 若有校验）。

## DTO（`types.ts`）

字段均为 **camelCase**（JSON API 响应形状）。D1 的 snake_case 不得泄漏到这些接口。

| 类型 | 用途 |
|------|------|
| `UserPublic` | 注册/登录/me：`id` `email` `displayName` |
| `BookSummary` | 书架列表项（「Book」= 任意可阅读作品，非仅小说） |
| `BookDetail` | 作品元数据 + `chapters: ChapterMeta[]` |
| `ChapterMeta` / `ChapterContent` | 目录 vs 正文 |
| `ReadingProgress` | 进度读写 |
| `UserPreferences` | 主题/字号/行距/页边距 |
| `BookStatus` | `"processing" \| "ready" \| "failed"` |
| `ThemeId` | `"night" \| "paper"` |
| `ApiErrorBody` | `{ error: { code, message } }` |

### 偏好枚举

- `pageMargin`: `"compact" \| "normal" \| "relaxed"`
- 字号服务端限制 14–28，行距 1.4–2.2（api `preferences.ts`，改范围须双边一致）

### 进度语义

- `chapterIndex` / `charOffset`：非负整数
- `pageInChapter`：可 null；阅读器用于恢复页
- 书架 `progressPercent`：由 api 根据章节字数估算，可为 null

## 文件名系列（`filenameSeries.ts`）

| 函数 | 行为 |
|------|------|
| `parseFilenameSeries` | 识别 `书名-01` / `_02` / ` 3` / `-第04章` |
| `seriesGroupKey` | 有序：`seq:小写书名`；独立：`solo:小写文件名` |
| `compareBySequence` | 同组排序 |

导入合并依赖此逻辑；改正则必须更新 `filenameSeries.test.ts` 并回归批量导入。

## 错误体契约

前端 `ApiError` 依赖：

```typescript
body?.error?.code
body?.error?.message
```

api 不得改成 `error: string` 或 `{ code, msg }` 而不改 shared + web。

## 变更清单（改 shared 时）

- [ ] 更新 `types.ts` / `constants.ts`
- [ ] `pnpm --filter @yudu/shared test`
- [ ] 修 api 映射与校验（routes/services）
- [ ] 修 web `lib/api.ts` 与使用处
- [ ] `pnpm typecheck` 全仓

## 反模式

- 在 DTO 中使用 `Date` 对象（JSON 用 number 时间戳）
- 把 `password_hash`、R2 原始 key 暴露进 `UserPublic` / `BookSummary`（封面用 URL 路径即可）
- 同一概念两个可选字段名（如同时 `display_name` 与 `displayName` 出现在 API JSON）
