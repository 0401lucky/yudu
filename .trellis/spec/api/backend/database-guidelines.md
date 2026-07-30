# 数据库与对象存储 — @yudu/api

## D1（元数据）

### Schema 来源

迁移目录：`apps/api/migrations/`（`0001_init` → … → `0006_book_groups` → `0007_studio_books`，按序追加）。

表：`users`、`sessions`、`books`、`chapters`、`reading_progress`、`user_preferences`、`bookmarks`、`reading_stats_daily`、`highlights`。

`books` 创作台扩展列（0007）：`source`（`import`|`studio`）、`on_shelf`、`break_limit`、`studio_assets`（JSON 文本）。书架列表仅返回 `on_shelf=1`；导入书默认上架。

> ⚠️ `studio_assets` 走 `normalizeAssets`（`services/studioBook.ts`）逐字段 `typeof` 白名单，**未列出的字段会被静默丢弃**。给 `StudioPremise` / `StudioCharacter` 等加字段时，必须同步补白名单，否则前端能填能发、存进去就没了，且不报错。这类字段是 JSON 内的，无需 D1 迁移。

### 约定

| 规则 | 说明 |
|------|------|
| 主键 | 文本 UUID（`crypto.randomUUID()`） |
| 时间戳 | **毫秒**整数 `Date.now()`（`created_at` / `updated_at` / `expires_at`） |
| 列名 | **snake_case**（`user_id`、`chapter_count`） |
| 用户隔离 | `books` / `chapters`（经 book）/ `reading_progress` / `user_preferences` 均按用户 |
| 外键 | SQL 中声明 `ON DELETE CASCADE`；应用层删书仍应清 R2（见 `deleteBook`） |

### 查询模式

使用 D1 prepared statements，**禁止**拼接用户输入进 SQL：

```typescript
await c.env.DB.prepare(
  `SELECT id FROM books WHERE id = ? AND user_id = ?`,
)
  .bind(bookId, userId)
  .first<{ id: string }>();
```

- 单行：`.first<T>()`
- 列表：`.all<T>()` → `results`
- 批量：`c.env.DB.batch([...])`（注册时 users + preferences，见 `routes/auth.ts`）
- Upsert：`ON CONFLICT(...) DO UPDATE SET ...`（进度、偏好）

行类型在路由/服务内用本地 `type XxxRow = { ... }` 描述 **snake_case** 列，再映射到 `@yudu/shared` 的 camelCase DTO。

### 书籍状态

`books.status`：`processing` | `ready` | `failed`（与 `BookStatus` 一致）。失败时写 `error_message`。

### 进度与偏好默认值

- 无进度行时 API 返回零进度（`chapterIndex: 0`, `charOffset: 0`），见 `routes/progress.ts`
- 无偏好行时返回代码内 `defaults()`（theme night、fontSize 18 等），与注册时插入的初始偏好一致

### 迁移

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply yudu --local
# 远程库名见 wrangler.toml database_name
pnpm exec wrangler d1 migrations apply novel-reading-platform-db --remote
```

新增列/表：追加新序号迁移文件（如 `migrations/0005_*.sql`），不要改写已应用的迁移。

### 用户标注类表的既定模式（bookmarks / highlights）

按用户 + 书隔离的标注数据(书签、高亮)遵循同一套契约,新增同类表照抄:

- 锚点列 + `UNIQUE(user_id, book_id, <锚点列...>)`,配 `idx_<表>_user_book` 索引
- 路由:归属校验(越权视同 404)→ 参数校验(非负整数、白名单、长度截断)→ 同锚点幂等预查 → 单书上限 → INSERT,catch UNIQUE 冲突后二次查询兜底并发
- 上限检查放在幂等之后:同锚点重复添加不应被上限拒绝
- 常量(上限、长度)与 DTO 定义在 `@yudu/shared`,前后端共用

---

## R2（大对象）

封装：`apps/api/src/services/storage.ts`。

### Key 布局

```
users/{userId}/books/{bookId}/source/{filename}
users/{userId}/books/{bookId}/chapters/{idx}.json
users/{userId}/books/{bookId}/cover
```

- 前缀删除：`deletePrefix(bucket, r2Key.bookPrefix(userId, bookId))`
- 文件名：`sanitizeFilename` 去掉路径分量，限制危险字符

### 章节载荷

章节 JSON（`ChapterPayload`）：`{ title, text, sequence?, sourceFile? }`。API 读出后映射为 `ChapterContent`。

### 封面

- EPUB 可带解析封面；否则 `generateCoverSvg`（`cover.ts`）写 `image/svg+xml`
- 对外 URL 形如 `/api/books/:id/cover`（需 Cookie，非公开 CDN）

---

## 导入与系列合并

`services/importBook.ts` + `@yudu/shared` 的 `parseFilenameSeries` / `seriesGroupKey`：

- 同批「书名-序号」合并为一本书
- 书架已有同名 **ready** 系列书时 **追加章节** 而非新建
- 单文件大小上限：`MAX_UPLOAD_BYTES`（30MB）
- 支持格式：`txt` / `md` / `epub`（`pdf` 仅在类型上预留，导入拒绝）

---

## 反模式

- 在前端或 shared 里写 SQL
- 只按 `book_id` 查书不校验 `user_id`（越权）
- 把整章正文塞进 D1
- 手写 R2 key 字符串而不用 `r2Key.*`
