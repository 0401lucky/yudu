# Task 8 报告：R2 存储、封面、导入服务与书籍 API

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/src/services/storage.ts` |
| 新建 | `apps/api/src/services/cover.ts` |
| 新建 | `apps/api/src/services/importBook.ts` |
| 新建 | `apps/api/src/routes/books.ts` |
| 修改 | `apps/api/src/index.ts`（挂载 `/api/books`） |

### 接口

```ts
// storage
r2Key.source / chapter / cover / bookPrefix
putText / getText / putBytes / getObject / deletePrefix

// cover
generateCoverSvg(title, author): string  // image/svg+xml

// importBook
importBook(env, userId, { name, bytes }): Promise<BookSummary>
deleteBook(env, userId, bookId): Promise<boolean>
ImportValidationError  // 扩展名/大小等校验失败

// routes（全部 authMiddleware）
POST   /api/books/import
GET    /api/books
GET    /api/books/:id
DELETE /api/books/:id
GET    /api/books/:id/chapters/:idx
GET    /api/books/:id/cover
```

### R2 键

```
users/{userId}/books/{bookId}/source/{filename}
users/{userId}/books/{bookId}/chapters/{idx}.json
users/{userId}/books/{bookId}/cover
```

章节 JSON：`{ title, text }`

### importBook 流程

1. 校验扩展名（`txt`/`md`/`epub`；**拒绝 pdf**）与 `MAX_UPLOAD_BYTES`（30MB）
2. 插入 `books`（`processing`）
3. 上传 source → 按格式解析（`parseTxt` / `parseMd` / `parseEpub`）
4. 每章 put R2 JSON + batch insert `chapters`
5. 封面：EPUB 自带优先，否则 `generateCoverSvg`（深色 + 琥珀线 + 书名）
6. 更新 `ready`；catch → `failed` + `error_message`（仍返回 `BookSummary`）

### 列表进度

```
((chapterIndex + charOffset / max(charCount,1)) / chapterCount) * 100
```

无进度或 `chapterCount=0` 时 `progressPercent = null`。

`coverUrl` 对外为 `/api/books/{id}/cover`（鉴权流式读 R2）。

## 验证

### typecheck / 既有测试

```
pnpm --filter @yudu/api typecheck  → 通过
pnpm --filter @yudu/api test       → 6 files / 26 tests passed
```

### 本地 wrangler + curl

`wrangler dev` @ `http://127.0.0.1:8787`（D1 + R2 本地模拟）

| 步骤 | 结果 |
|------|------|
| 注册/登录 Cookie | 成功 |
| `POST /api/books/import` sample.txt | `status: ready`，`chapterCount: 2`，`format: txt` |
| `GET /api/books` | 列表含该书 |
| `GET .../chapters/0` | `title: 第一章 开端`，`text: 正文甲`（UTF-8 正确） |
| `GET .../cover` | `200`，`Content-Type: image/svg+xml` |
| 伪 pdf 文件名 | `400 UNSUPPORTED_FORMAT`「PDF 暂不支持」 |
| sample.md 导入 | `ready`，`chapterCount: 2` |
| minimal.epub 导入 | `ready`，`chapterCount: 1`，有 author |
| `DELETE /api/books/:id` | `204` |

## Commits

- `744567f` — `feat(api): 书籍导入与章节读取 API`
  - 5 files changed, 739 insertions(+)

## Test Summary

| 检查 | 结果 |
|------|------|
| tsc --noEmit | 通过 |
| 既有 vitest（26） | 通过 |
| curl 导入 UTF-8 txt | ready，chapterCount≥1 |
| 章节正文 / 封面 / 删除 / 拒 pdf | 通过 |

## Concerns

1. **同步解析**：大 epub（接近 30MB）可能触达 Worker CPU/时长限制；MVP 按规格同步处理，后续可 Queue。
2. **封面键无扩展名**：统一 `.../cover`，靠 `Content-Type` 区分 SVG/PNG；与设计文档 `cover.webp` 字面不完全一致，但接口 `r2Key.cover(userId,bookId)` 更简单。
3. **进度章 char_count**：列表 join 当前进度章；若进度 `chapter_index` 越界或章被删，`progress_char_count` 为 null 时按 1 粗算。
4. **无独立 unit test**：storage/import 依赖 D1+R2，本任务以 wrangler 集成 curl 验证；Task 9 前端依赖真实 API 再补。
5. **删除顺序**：先清 R2 再删 D1；若 R2 部分失败可能残留对象（本地模拟未暴露此问题）。
6. **filename 清理**：source 键会净化文件名；极端文件名可能变成 `source.bin`。
