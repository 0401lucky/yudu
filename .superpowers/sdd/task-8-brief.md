### Task 8: R2 存储、封面、导入服务与书籍 API

**Files:**
- Create: `apps/api/src/services/storage.ts`
- Create: `apps/api/src/services/cover.ts`
- Create: `apps/api/src/services/importBook.ts`
- Create: `apps/api/src/routes/books.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
```ts
// storage
r2Key.source(userId, bookId, filename): string
r2Key.chapter(userId, bookId, idx): string
r2Key.cover(userId, bookId): string
putText/getText/putBytes/deletePrefix

// cover
generateCoverSvg(title: string, author: string | null): string // SVG 字符串，存 R2 为 image/svg+xml

// importBook
importBook(env, userId, file: { name: string; bytes: Uint8Array }): Promise<BookSummary>

// routes
POST /api/books/import   multipart field "file"
GET  /api/books
GET  /api/books/:id
DELETE /api/books/:id
GET  /api/books/:id/chapters/:idx
GET  /api/books/:id/cover  // 流式返回封面，鉴权后读 R2
```

- [ ] **Step 1: 实现 storage 与 cover**

抽象封面：深色背景 + 琥珀装饰线 + 书名（SVG text）。

- [ ] **Step 2: 实现 importBook**

流程：校验扩展名与 `MAX_UPLOAD_BYTES` → 建 book `processing` → put source → parse → 每章 put R2 JSON `{title,text}` → insert chapters → cover → `ready`；catch → `failed` + message。

title 默认：解析结果 title 或去掉扩展名的文件名。

- [ ] **Step 3: 实现 books 路由（全部 require auth）**

列表 join 进度算 `progressPercent`：  
`((chapterIndex + charOffset/ max(charCount,1)) / chapterCount) * 100` 粗算即可。

删除：删 R2 对象（列前缀或记录 keys）+ D1 cascade。

章节：`GET` 校验 book 属主，读 R2，返回 `ChapterContent`。

- [ ] **Step 4: curl 导入 UTF-8 txt 验证**

```bash
curl -b cookies.txt -F "file=@apps/api/fixtures/sample.txt" http://127.0.0.1:8787/api/books/import
curl -b cookies.txt http://127.0.0.1:8787/api/books
```

Expected: status ready，chapterCount≥1。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): 书籍导入与章节读取 API"
```

---

