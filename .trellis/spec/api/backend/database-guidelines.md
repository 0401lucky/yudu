# 数据库与对象存储 — @yudu/api

## D1（元数据）

### Schema 来源

唯一迁移：`apps/api/migrations/0001_init.sql`。

表：`users`、`sessions`、`books`、`chapters`、`reading_progress`、`user_preferences`。

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

新增列/表：新增 `migrations/0002_*.sql`，不要改写已应用的 `0001_init.sql`。

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
