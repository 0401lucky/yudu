# 年度阅读报告

## Goal

给读者一页可看可晒的年度阅读回顾：总时长、活跃天数、连续纪录、读完的书、标注数量等，数据全部来自现有表。

## Requirements

### 功能需求

1. **接口**：`GET /api/stats/annual?year=YYYY`（默认当前年，范围 2020–当前年），返回：
   - `totalSeconds`（年内阅读总时长）、`activeDays`（有阅读的天数）、`maxStreakDays`（年内最长连续天数）
   - `booksRead`（年内有阅读进度更新的书数）、`booksFinished`（进度 ≥98% 的书数，全量口径）
   - `highlightCount` / `noteCount` / `bookmarkCount`（年内创建）
   - `busiestDay`（时长最高的一天 date + seconds，可为 null）
   - `monthlySeconds: number[12]`（按月聚合）
2. **页面**：路由 `/report`（默认今年，可切换年份），卡片式展示上述指标 + 12 个月柱状条（纯 CSS/SVG，不引图表库）+ 年度热力图（复用 ReadingHeatmap，传该年数据）。
3. **入口**：书架页统计条（ReadingStatsBar）区域加「年度报告」链接。
4. **空数据**：全零时显示友好引导文案而非空白。

### 非功能需求

- 聚合在 API 侧用 SQL 完成（reading_stats_daily 按年过滤），maxStreak 在 JS 侧对稀疏日期序列线性扫描。
- 页面风格延续「雨夜书房」气质（night/paper 两主题可读）。

## Out of Scope

- 报告导出图片/分享（后续可由 quote-card 模式延展）。
- 同比/环比、跨年对比。

## Acceptance Criteria

- [ ] 接口各指标口径正确，year 非法返回 400；有测试覆盖（含跨月/连续天数边界、note/highlight 计数）。
- [ ] 页面双主题正常、移动端不溢出；空数据有引导。
- [ ] 年份切换正确刷新。
- [ ] `pnpm typecheck && pnpm test` 通过。
