# 技术设计:文本高亮标注

## 总览

三层结构完全对标书签(bookmarks)已验证的模式:

```
D1 migration 0004_highlights.sql
apps/api/src/routes/highlights.ts        # GET/POST/DELETE,归属校验 + 幂等 + 上限
packages/shared: HighlightDto + 常量
apps/web:
  hooks/useHighlights.ts                 # 拉取 + 乐观增删(对标 useBookmarks,无 legacy 迁移)
  lib/textAnchor.ts                      # DOM Range ↔ 章内字符偏移 双向映射
  components/HighlightPopover.tsx        # 选区/点击气泡(取色、删除)
  两个视口接入渲染(CSS Custom Highlight API)
```

## 关键决策

### 1. 渲染方案:CSS Custom Highlight API(不改 DOM)

- 用 `CSS.highlights.set(name, new Highlight(...ranges))` + `::highlight(yudu-hl-yellow)` 等 3 个命名高亮渲染底色。
- 理由:
  - 不往正文插 `<mark>` 节点 → 不干扰翻页模式的 CSS 多栏分页测量、不破坏 React 对正文的受控渲染,markdown 跨元素选区也无需拆节点。
  - Chrome/Edge 105+、Safari 17.2+、Firefox 140+ 已支持,当前基线可用。
- 降级:`typeof CSS !== "undefined" && "highlights" in CSS` 为假时跳过正文渲染,列表/增删/跳转功能不受影响(PRD 已定义)。
- 高亮 Range 需在正文重排(字号、翻页、章节窗口变化)后重建:视口在正文 DOM 变更的 effect 中统一重算。

### 2. 锚点映射:lib/textAnchor.ts

- **DOM → 偏移**:`window.getSelection()` 得到 Range 后,用 TreeWalker 遍历正文容器内文本节点,累计字符数,算出 `startOffset/endOffset`(相对"渲染后纯文本")。
- **偏移 → Range**:同一 TreeWalker 口径反向定位文本节点与节点内偏移,构造 Range 供 Highlight 与跳转滚动使用。
- **口径声明**:偏移基于"渲染后纯文本"(plain 模式 = 原文;markdown 模式 = 渲染文案,与 `mdPlainLengthApprox` 同一近似家族)。书签/进度已用同类近似,精度一致可接受。重新导入书籍导致分章变化时高亮可能错位——与书签既有行为一致,不额外处理。
- 翻页模式的多栏布局不影响该映射(列是视觉排版,DOM 文本流不变)。

### 3. 数据模型与接口

```sql
-- 0004_highlights.sql
CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,     -- 开区间终点,须 > start_offset
  color TEXT NOT NULL,             -- 'yellow' | 'green' | 'blue'(服务端白名单)
  excerpt TEXT NOT NULL,           -- 摘录,列表展示用,≤ 120 字符(截断存储)
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, book_id, chapter_index, start_offset, end_offset)
);
CREATE INDEX idx_highlights_user_book ON highlights(user_id, book_id);
```

- 路由 `apps/api/src/routes/highlights.ts` 挂在 `/api/books/:id/highlights`:
  - `GET` 全书列表(按章 + start 排序);`POST` 创建(校验 + 同锚点幂等 + 500 条上限);`PATCH /:hid` 改色;`DELETE /:hid` 删除。
  - 归属校验、错误体、UNIQUE 并发兜底照抄 bookmarks.ts 模式。
- shared:`HighlightDto`、`HIGHLIGHT_COLORS`、`MAX_HIGHLIGHTS_PER_BOOK = 500`、`MAX_HIGHLIGHT_CHARS = 1000`、`MAX_HIGHLIGHT_EXCERPT_CHARS = 120`。
- 重叠选区:允许(不同锚点即不同记录),渲染时颜色后写者覆盖,不做合并——简单且符合直觉。

### 4. 交互流

- **创建**:视口监听 `selectionchange` + `pointerup`,选区非空且在正文容器内 → 计算偏移与气泡位置 → `HighlightPopover`(3 色圆点)。选长度 > 1000 字符时气泡提示不可标注。
- **命中已有高亮**:点击(无选区)时用 `caretRangeFromPoint`/`caretPositionFromPoint` 得到点击偏移,查命中的高亮 → 气泡显示改色 + 删除。命中气泡优先于"点击中部唤工具栏"(命中时不切换 chrome)。
- **列表**:TocDrawer 现有"目录/书签"结构中并列加"标注"页签;跳转走 ReaderPage 统一的 `jumpTo(chapterIndex, { charOffset: startOffset })`。

### 5. 与滚动模式子任务的依赖

- 依赖其落地的 `jumpTo` 统一跳转和 `ScrollReaderViewport`;textAnchor 的 TreeWalker 口径两个视口共用。
- 若滚动子任务延期,本任务可先只接翻页视口(接口按两视口设计,接入点收敛在各视口一个 effect + 一个事件回调)。

## 兼容与回滚

- 新增表 + 新增路由,零存量影响;前端不渲染高亮即回到现状。
- 回滚:前端摘除视口接入点即可;D1 表可留存不影响其他功能。

## 风险

| 风险 | 缓解 |
| --- | --- |
| markdown 渲染文本与 `mdPlainLengthApprox` 口径不完全一致 → 列表跳转/进度换算略偏 | 高亮渲染本身用 DOM 实测偏移,不受影响;跳转偏差与书签同级 |
| 移动端长按选词与"点击唤工具栏"手势冲突 | 有活动选区或命中高亮时跳过 chrome 切换;位移/时长阈值区分 |
| Custom Highlight API 在旧浏览器缺失 | 特性检测降级,功能核心(存储/列表/跳转)不依赖渲染 |
