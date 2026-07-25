# 阅读统计热力图 — 执行计划

## 顺序清单

1. **shared**：`DailyReadingStat` / `ReadingStatsResponse`
2. **D1 迁移**：`0003_reading_stats.sql`
   → 验证：`wrangler d1 migrations apply yudu --local`
3. **API**：`routes/stats.ts`（POST 累加 + GET 查询），`index.ts` 挂载
   → 验证：`pnpm --filter @yudu/api typecheck`
4. **API 测试**：累加正确性 / clamp / 非法 date 400 / 401 / days 边界
   → 验证：`pnpm --filter @yudu/api test`
5. **前端 api.ts**：`postReadingTime` / `getReadingStats`
6. **useReadingClock hook**（可见性起停 + 60s/隐藏/卸载 flush）挂到 ReaderPage
7. **读 dataviz 技能** → `ReadingHeatmap.tsx` + `ReadingStatsBar.tsx`（含 streak 计算），接入 LibraryPage
   → 验证：`pnpm --filter @yudu/web typecheck && pnpm --filter @yudu/web test`
8. **手动验证**：计时准确性（后台不计）、热力图双主题、375px 移动端、streak 语义
9. **全量**：`pnpm typecheck && pnpm test && pnpm build`

## 风险与回滚点

- ReaderPage 已挂多个 effect，注意 useReadingClock 与进度同步互不干扰（独立 hook、独立 timer）。
- 热力图网格性能（365 个 div）无虞；勿引入图表库。
- 回滚：全增量（新表/新路由/新 hook/新组件），revert 即回。

## 启动前检查

- [ ] `implement.jsonl` / `check.jsonl` 已填真实条目
- [ ] 实施热力图前已读 dataviz 技能
