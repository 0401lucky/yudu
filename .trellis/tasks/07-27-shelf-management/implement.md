# 执行计划：书架管理

1. **shared**：`MAX_BOOK_GROUP_CHARS`、BookSummary 新字段 → typecheck 暴露改点。
2. **迁移**：`ALTER TABLE books ADD COLUMN group_name TEXT` → 本地 apply 验证。
3. **API**：列表带 createdAt/lastReadAt/group；PATCH group 端点 + 校验；测试（设置/清除分组、31 字符 400、越权 404、列表字段）→ `pnpm --filter @yudu/api test`。
4. **web api.ts + LibraryPage 排序/筛选**：ShelfToolbar、localStorage 记忆 → typecheck + 手测。
5. **管理模式**：BookCard 复选、底部操作条、批量删除/移动 → 手测部分失败路径（可断网模拟）。
6. **收尾**：全仓 typecheck + test。

注意：迁移编号需在实施时查 `apps/api/migrations/` 现状顺延（highlight-notes 任务可能已占 0005）。
