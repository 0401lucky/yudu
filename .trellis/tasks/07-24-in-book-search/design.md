# 书内全文搜索 — 技术设计

## 方案选型

| 方案 | 结论 |
|------|------|
| **后端实时扫描 R2**（选定） | 无 schema 变更、无已有书回填、无导入链路改动。单书正文典型 < 5MB、章节数百级，Workers 内并发读 R2 秒级完成 |
| D1 FTS5 全文索引 | 中文需 trigram tokenizer，正文需入 D1（导入/删除/reparse 链路全要改）+ 存量回填，个人规模收益不成比例，弃 |
| 前端逐章拉取搜索 | 移动端流量大、首次搜索慢，弃 |

## API

`GET /api/books/:bookId/search?q=<keyword>`（`routes/books.ts` 内新增或独立文件，挂载模式一致）

- 校验：authMiddleware + 书籍归属（照抄 `progress.ts` 模式）；`q` trim 后长度 2–50，否则 400 `INVALID_QUERY`；`format === 'pdf'` 返回 400 `UNSUPPORTED_FORMAT`。
- 流程：
  1. D1 取该书全部章节 `{idx, title, r2_key}`（按 idx 排序）。
  2. 并发（上限 10，简单分批 `Promise.all`）`getText` 读 R2 章节 JSON，解析出 `text`。
  3. 每章小写化后 `indexOf` 循环找命中：记录 `charOffset`（在原文中的索引）、摘录 = 命中点前后各 30 字符（换行折叠为空格）；每章最多 5 条。
  4. 累计 50 条即停止后续章节读取（按章节顺序保证结果稳定）。
- 响应：

```ts
export interface BookSearchMatch {
  chapterIndex: number;
  chapterTitle: string;
  charOffset: number;   // 命中点在该章原文中的字符索引
  excerpt: string;      // 上下文摘录
  keywordStart: number; // 关键词在 excerpt 中的起始索引（前端高亮用）
}
export interface BookSearchResult {
  query: string;
  matches: BookSearchMatch[];
  truncated: boolean;   // 是否因 50 条上限截断
}
```

（类型放 `packages/shared/src/types.ts`）

- R2 缺失/损坏的章节跳过不中断（与 `books.ts:281-297` 容错风格一致）。
- 不缓存（每次实时扫）；响应头 `Cache-Control: private, max-age=60` 减重复搜索。

## 前端

### 入口与面板

- `ReaderHeader`（`ReaderChrome.tsx`）加搜索图标按钮（`format !== 'pdf'` 时显示）。
- 新组件 `SearchDrawer.tsx`：抽屉交互复用 `TocDrawer` 的结构/样式约定（遮罩 + 侧滑面板 + 主题 token）；输入框 + 触发按钮 + 结果列表 + loading / 空态 / 截断提示。
- 高亮：用 `keywordStart` + `query.length` 切三段渲染 `<mark>`（不用 dangerouslySetInnerHTML）。

### 跳转落位

- 现有换章落位机制：`pendingPageRef: number | "last" | null`（`ReaderPage.tsx:16,37`），页数测出后在 `handlePageCount` 消费。
- 扩展 `PendingPage` 增加 `{ ratio: number }` 变体：`handlePageCount` 收到 count 后 `page = clamp(floor(ratio * count))`。
- 点击结果：`ratio = charOffset / max(1, chapter.charCount)`（charCount 来自 `BookDetail.chapters`；md 章节的 charCount 为源文长度，与 charOffset 同一坐标系，自洽）→ 同章直接 `setPageIndex`，跨章 `jumpToChapter(idx, {ratio})`。

## 权衡

- 每次搜索实时读全书 R2：重复搜索有开销，个人规模可接受；未来量大再演进 FTS。
- 近似落位（±1 页）：与书签/进度同级精度，统一心智。
