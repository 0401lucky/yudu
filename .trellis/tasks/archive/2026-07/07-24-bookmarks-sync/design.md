# 书签云同步 — 技术设计

## 数据模型（D1 迁移 `0002_bookmarks.sql`）

```sql
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  char_offset INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, book_id, chapter_index, char_offset)
);
CREATE INDEX idx_bookmarks_user_book ON bookmarks(user_id, book_id);
```

- `UNIQUE` 约束天然防重复；重复添加返回已有记录（幂等）。
- id 生成沿用项目现有 id 方案（见 `importBook.ts` 的 id 生成方式，保持一致）。

## API（新文件 `apps/api/src/routes/bookmarks.ts`，挂载方式参照 `index.ts` 现有路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books/:bookId/bookmarks` | 返回 `BookmarkDto[]`（按 chapter_index, char_offset 排序） |
| POST | `/api/books/:bookId/bookmarks` | body `{chapterIndex, charOffset, label}`；校验非负整数、label ≤ 100 字符；单书 ≥ 200 条时 400 `BOOKMARK_LIMIT`；UNIQUE 冲突时返回已有记录 200 |
| DELETE | `/api/books/:bookId/bookmarks/:id` | 204；不存在 404 |

- 全部走 `authMiddleware` + 书籍归属校验（模式照抄 `progress.ts:18-29`）。
- 错误体沿用 `{error: {code, message}}`。

## Shared 类型（`packages/shared/src/types.ts`）

```ts
export interface BookmarkDto {
  id: string;
  chapterIndex: number;
  charOffset: number;
  label: string;
  createdAt: number;
}
```

## 前端

### `lib/api.ts` 新增

`listBookmarks(bookId)` / `createBookmark(bookId, body)` / `deleteBookmark(bookId, id)`。

### `useBookmarks` 重写（保持返回形状接近现状，减少 ReaderPage 改动）

- 状态：`BookmarkDto[]`；打开书 `useEffect` 拉取。
- `toggle(anchor)`：乐观增删 → API → 失败回滚 + 通过返回的错误状态供 UI 提示。
- 锚点换算（在 ReaderPage 完成，hook 只存取）：
  - 添加：`charOffset = round(pageIndex / pageCount * textLen)`，`textLen` 与进度同步一致（`ReaderPage.tsx:141-150`，md 用 `mdPlainLengthApprox`）。
  - 跳转/当前页判定：页 p 的 offset 区间为 `[p/pageCount*textLen, (p+1)/pageCount*textLen)`；`isBookmarked` = 当前页区间内存在书签；跳转 `page = clamp(floor(charOffset / textLen * pageCount))`。
- 本地迁移：拉取成功后读 localStorage 旧格式 `{chapterIndex, pageInChapter, label, ts}`；旧锚点仅在**当前章渲染后**可换算（需要该章 pageCount），跨章旧书签用 `charOffset = 0` 兜底？——不接受，会失真。**迁移策略**：旧书签按 `pageInChapter / 该章估算页数` 无法离线求得；采用**近似迁移**：`charOffset = pageInChapter * 平均页容量`不可靠。最终决策：**迁移时 charOffset 记为 `pageInChapter` 对应的粗略比例**——打开书时逐条用 `chapters[i].charCount`（BookDetail 已含每章 charCount）与**当前设备渲染该章的经验页容量**无关的公式：`charOffset = min(pageInChapter * ASSUMED_PAGE_CHARS, charCount - 1)`，`ASSUMED_PAGE_CHARS = 600`（中文一页典型容量）。偏差可接受（书签 label 仍可辨认），一次性成本。
- 迁移成功（全部 POST 成功）后 `localStorage.removeItem`；部分失败则保留，下次重试（UNIQUE 幂等防重复）。

### TocDrawer

- 书签列表数据源从旧 `Bookmark` 换 `BookmarkDto`，跳转回调签名同步调整（`pageInChapter` → `charOffset`）。

## 权衡

- charOffset 是近似锚点，字号/设备变化有 ±1 页偏差 —— 与进度同步同级，可接受；精确锚点（文字指纹）不在本期。
- 无批量 API；迁移逐条 POST（单书旧书签通常 < 20 条）。
