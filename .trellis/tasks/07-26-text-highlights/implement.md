# 实施计划:文本高亮标注

前置:建议在 `07-26-scroll-reading-mode` 完成后进行(依赖 jumpTo 统一跳转与滚动视口;若需提前,可先只接翻页视口)。

验证命令:

```bash
pnpm --filter @yudu/api test && pnpm --filter @yudu/api typecheck
pnpm --filter @yudu/web lint && pnpm --filter @yudu/web typecheck
pnpm -r lint && pnpm -r typecheck && pnpm -r test   # 收尾全量
```

## 步骤

- [ ] 1. shared:新增 `HighlightDto`、`HIGHLIGHT_COLORS`、`MAX_HIGHLIGHTS_PER_BOOK`、`MAX_HIGHLIGHT_CHARS`、`MAX_HIGHLIGHT_EXCERPT_CHARS`
      → 验证:shared typecheck/test 通过。
- [ ] 2. api:`migrations/0004_highlights.sql` + `routes/highlights.ts`(GET/POST/PATCH/DELETE)+ 注册到 index.ts
      → 验证:本地 D1 迁移执行成功。
- [ ] 3. api:`routes/highlights.test.ts`(对标 bookmarks.test.ts:归属 404、参数 400、幂等、上限、改色、删除)
      → 验证:`pnpm --filter @yudu/api test` 全绿。
- [ ] 4. web:`lib/api.ts` 增加 list/create/patch/delete 高亮方法;`hooks/useHighlights.ts`(乐观增删改,对标 useBookmarks 去掉迁移逻辑)
      → 验证:typecheck。
- [ ] 5. web:`lib/textAnchor.ts`(TreeWalker 双向映射)+ 单测(构造简单 DOM 验证 plain/嵌套元素两种结构)
      → 验证:vitest 通过。
- [ ] 6. web:`components/HighlightPopover.tsx`(3 色 + 删除;定位在选区上方,越界翻转)
      → 验证:typecheck;手测桌面/移动布局。
- [ ] 7. web:视口接入(翻页 ReaderViewport + 滚动 ScrollReaderViewport):
      - selectionchange/pointerup 创建流,点击命中已有高亮的编辑流
      - Custom Highlight API 渲染(特性检测降级),正文重排后重建 Range
      - 与"点击唤工具栏"手势互斥
      → 验证:两模式 × plain/md 四种组合手测创建/显示/删除。
- [ ] 8. web:TocDrawer 增加"标注"页签(列表、跳转、删除)
      → 验证:跳转落点正确,删除即时反映到正文。
- [ ] 9. 回归 + 全量检查
      → 验证:书签/搜索/进度不受影响;`pnpm -r lint && pnpm -r typecheck && pnpm -r test` 全绿。

## 回滚点

- 后端(步骤 1–3)与前端(4–8)可独立回滚;前端摘除视口接入点即回到现状。

## 审查关口

- 步骤 3 后(后端契约)与步骤 7 后(交互核心)各走一次 trellis-check。
