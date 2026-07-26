# 技术设计：高亮笔记批注与汇总导出

## 数据层（D1）

新迁移 `apps/api/migrations/0005_highlight_notes.sql`：

```sql
ALTER TABLE highlights ADD COLUMN note TEXT;
```

`note` 为 NULL 或非空字符串（去首尾空白后为空则存 NULL，保持「无笔记」单一表示）。

## 共享层（packages/shared）

- `constants.ts`：新增 `MAX_HIGHLIGHT_NOTE_CHARS = 500`。
- `types.ts`：
  - `HighlightDto` 增加 `note: string | null`。
  - 新增 `NotesBookGroup`（汇总页响应项）：`{ bookId, bookTitle, bookAuthor: string | null, highlights: HighlightWithChapter[] }`，其中 `HighlightWithChapter = HighlightDto & { chapterTitle: string }`（章节标题便于汇总页/导出展示；用 chapters 表 join）。

## API 层（apps/api）

`routes/highlights.ts` 改造：

1. `POST /api/books/:bookId/highlights`：body 可选 `note`（string，trim 后 ≤500，超限 400 `INVALID_HIGHLIGHT`；空串视为无笔记）。
2. `PATCH /api/books/:bookId/highlights/:id`：现有改色接口扩展为可选 `color` / `note` 至少给一个；`note: null` 或空串 = 清除笔记。
3. 响应体全部带上 `note` 字段。

新路由 `routes/notes.ts`（挂 `/api/notes`，authMiddleware）：

- `GET /api/notes`：返回 `NotesBookGroup[]`。SQL：highlights JOIN books（校验 user_id）LEFT JOIN chapters（book_id + idx = chapter_index）取章节标题，`ORDER BY b.title, h.chapter_index, h.start_offset`；在 JS 侧按 bookId 分组。chapters 缺失（异常数据）时 chapterTitle 用 `第 N 章` 兜底。

## Web 层（apps/web）

1. **HighlightPopover**：edit 模式新增「写想法」按钮（有笔记时文案「编辑想法」）；create 模式新增「想法」按钮（回调先建高亮再开编辑）。新增回调 props `onNote?: () => void`。
2. **NoteEditorSheet**（新组件）：底部滑入 Sheet（样式对标 ReaderSettingsSheet），textarea + 字数计数（500 上限）+ 保存/清除；保存调 PATCH，乐观更新失败回滚（对标 useReaderHighlights 现有模式）。
3. **useHighlights / useReaderHighlights**：类型带 note；新增 `updateNote(id, note)`；渲染层给 `note != null` 的高亮加标识样式（CSS Custom Highlight 无法加下划线时退化为在列表/气泡中体现，正文标识做成 best-effort：在高亮 style 里用另一组 Highlight 注册 `::highlight(yudu-noted)` 样式叠加 text-decoration，若浏览器不支持则跳过）。
4. **TocDrawer**：标注条目下方渲染一行笔记预览（`line-clamp-2`）。
5. **NotesPage**（新页面，路由 `/notes`，需登录）：
   - `lib/api.ts` 新增 `getNotes(): Promise<NotesBookGroup[]>`、`updateHighlightNote(bookId, id, note)`、复用 `deleteHighlight`。
   - 按书分组卡片；条目点击 → `navigate(/read/{bookId}?chapter=X&offset=Y)`（沿用书签/搜索跳转的既有参数口径，实施前先查 ReaderPage 现有跳转参数并对齐）。
   - 导出：按书生成 Markdown 字符串 → Blob 下载 `《书名》笔记.md`。
6. **入口**：LibraryPage 导航区加「笔记」链接。

## 兼容与回滚

- 旧客户端不发 note 字段照常工作；迁移仅加列，可安全回滚（不删列，代码回退即可）。
