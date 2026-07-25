# 书内全文搜索 — 执行计划

## 顺序清单

1. **shared**：`BookSearchMatch` / `BookSearchResult` 类型
   → 验证：全仓 typecheck
2. **API**：search 路由（归属校验、q 校验、并发分批读 R2、每章 5 / 全书 50 上限、容错跳过坏章节）
   → 验证：`pnpm --filter @yudu/api typecheck`
3. **API 测试**：多章命中 / 大小写不敏感 / 上限截断 / 短关键词 400 / 他人书 404 / pdf 格式 400（参照现有路由测试基建 mock env）
   → 验证：`pnpm --filter @yudu/api test`
4. **前端 api.ts**：`searchBook(bookId, q)`
5. **SearchDrawer 组件**：输入 + 结果 + 高亮 + 状态（loading/空/截断）
6. **ReaderPage 接线**：`PendingPage` 扩展 `{ratio}` 变体（`handlePageCount` / `goToPage` / `jumpToChapter` 同步调整）；Header 加入口；点击结果跳转
   → 验证：`pnpm --filter @yudu/web typecheck && pnpm --filter @yudu/web test`
7. **手动验证**：长书搜索响应时间；跳转落页含关键词；移动端抽屉可用
8. **全量**：`pnpm typecheck && pnpm test && pnpm build`

## 风险与回滚点

- `PendingPage` 类型扩展触及换章落位核心逻辑（`handlePageCount`）→ 改动小心，现有"last"/数字语义不得回归；书签跳转与进度恢复回归测试。
- 大书（500+ 章）响应时间 → 已有 50 条上限提前终止；如仍慢，降并发批大小调优。
- 回滚：功能增量（新路由 + 新组件 + PendingPage 扩展），revert 即回。

## 启动前检查

- [ ] `implement.jsonl` / `check.jsonl` 已填真实条目
- [ ] 前置：无硬依赖，但建议在书签云同步之后做（跳转落位统一用 ratio 心智）
