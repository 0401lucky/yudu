# 执行计划：高亮笔记批注与汇总导出

按层推进，每步有验证点：

1. **shared**：常量 `MAX_HIGHLIGHT_NOTE_CHARS`、`HighlightDto.note`、`NotesBookGroup` 类型 → 验证：`pnpm --filter @yudu/shared typecheck`（或全仓 typecheck 暴露待改点清单）。
2. **迁移**：`0005_highlight_notes.sql` → 验证：`pnpm exec wrangler d1 migrations apply yudu --local`（在 apps/api 下）。
3. **API highlights**：POST/PATCH 支持 note、响应带 note；补测试（创建带笔记、超限 400、PATCH 更新/清除、越权）→ 验证：`pnpm --filter @yudu/api test`。
4. **API notes**：`routes/notes.ts` + index.ts 挂载；notes.test.ts（分组、章节标题、越权隔离、空结果）→ 验证：同上。
5. **web api/hooks**：api.ts 函数、useReaderHighlights 的 updateNote 与乐观更新 → 验证：typecheck。
6. **web UI**：HighlightPopover 按钮、NoteEditorSheet、TocDrawer 预览、正文 noted 标识 → 验证：typecheck + 手测双模式。
7. **NotesPage + 路由 + 入口 + 导出 MD** → 验证：typecheck；手测导出文件内容。
8. **收尾**：`pnpm typecheck && pnpm test` 全绿。

回滚点：每步一次 git 工作区自查；迁移只加列，代码回退即回滚。
