# 执行计划：年度阅读报告

1. **shared**：`AnnualReportResponse` 类型。
2. **API**：stats.ts 加 `GET /annual`；SQL：
   - reading_stats_daily：`WHERE date LIKE 'YYYY-%'` 聚合 total/activeDays/busiestDay/monthly（`substr(date,6,2)` 分组）；JS 扫 maxStreak。
   - booksRead：reading_progress 按 updated_at 年内过滤 count distinct book；booksFinished：复用书列表 progressPercent 口径（books join chapters/progress，按现有 books.ts 的算法，≥98%）。
   - highlights/bookmarks：created_at 年内 count；noteCount 加 `note IS NOT NULL`（依赖 highlight-notes 任务已合入；若列不存在则该指标实现顺延，接口先返回 0——实施时以 migrations 现状为准）。
   - 测试：stats.test.ts 补 annual 用例。
3. **web**：api.ts `getAnnualReport(year)`；`pages/ReportPage.tsx` + 路由 + ReadingStatsBar 入口链接；月度柱状用 div 高度百分比；热力图复用 ReadingHeatmap（确认其 props 是否支持指定年份数据，不支持则给它加可选 props，注意向后兼容）。
4. **验证**：API 测试 + typecheck + 手测两主题/移动宽度。
