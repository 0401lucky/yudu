# 书签云同步 — 执行计划

## 顺序清单

1. **shared**：`types.ts` 加 `BookmarkDto`
   → 验证：`pnpm --filter @yudu/shared typecheck`（如无独立脚本则全仓 typecheck）
2. **D1 迁移**：`apps/api/migrations/0002_bookmarks.sql`（表 + 索引）
   → 验证：`cd apps/api && pnpm exec wrangler d1 migrations apply yudu --local` 成功
3. **API**：`apps/api/src/routes/bookmarks.ts`（GET/POST/DELETE，authMiddleware + 归属校验 + 上限 200 + UNIQUE 幂等），在 `index.ts` 挂载
   → 验证：`pnpm --filter @yudu/api typecheck`
4. **API 测试**：`bookmarks.test.ts`（参照现有 `auth.test.ts` / `session.test.ts` 的测试基建）：401 / 404（他人书）/ 创建 / 幂等 / 删除 / 上限
   → 验证：`pnpm --filter @yudu/api test`
5. **前端 api.ts**：三个函数
6. **前端 useBookmarks 云端化** + 本地迁移逻辑（ASSUMED_PAGE_CHARS=600 近似 + 幂等重试 + 成功清 key）
7. **ReaderPage / TocDrawer 接线**：charOffset 锚点换算（添加/判定/跳转），失败提示
   → 验证：`pnpm --filter @yudu/web typecheck && pnpm --filter @yudu/web test`
8. **端到端手动验证**：两个浏览器会话同账号互见书签；旧 localStorage 数据迁移；失败回滚（DevTools 断网模拟）
9. **全量**：`pnpm typecheck && pnpm test && pnpm build`

## 风险与回滚点

- 迁移 SQL 一旦上生产不可轻易改 → 上线前在本地 D1 验证两遍。
- `useBookmarks` 返回形状变化影响 `ReaderPage` / `TocDrawer` → 同一提交内改完，typecheck 兜底。
- 回滚：整个功能为增量（新表、新路由、hook 重写），revert 单个 commit 即可回到 localStorage 版。

## 启动前检查

- [ ] `implement.jsonl` / `check.jsonl` 已填真实条目（子代理上下文）
- [ ] 用户已审阅规划
