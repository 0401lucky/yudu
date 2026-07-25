# 阅读统计热力图

## Goal

自动记录每日阅读时长，书架页展示 GitHub 风格热力图、连续天数与今日时长，提升阅读粘性。

## Background

- 现状：无任何阅读行为统计。已有 `reading_progress` 只存位置不存时长。
- 参照模式：`useProgressSync.ts` 的 debounce 上报 + `visibilitychange`/`pagehide` flush 模式可复用于时长上报。
- 按"天"聚合存在时区问题：Workers 端 UTC 换算用户本地日会错天 → 由前端上报本地日期字符串解决。

## Requirements

1. 阅读页自动累计**有效阅读时长**：仅当页面可见（`document.visibilityState === 'visible'`）且在阅读页时计时；隐藏/离开即暂停。
2. 定期上报增量秒数（每 60s 一次 + 可见性变化/卸载时 flush），带前端本地日期 `YYYY-MM-DD`。
3. 云端按 `(user, date)` UPSERT 累加；单次上报增量 clamp 到 ≤ 300s 防异常膨胀。
4. 书架页顶部统计条：今日阅读 X 分钟 · 连续 Y 天；可展开完整热力图面板。
5. 热力图：过去 52 周（GitHub 风格周列网格），5 档强度色阶（0 / 四分位分档），适配 night/paper 双主题；悬停（桌面）显示当天日期与时长；移动端显示最近约 20 周或横向滚动。
6. 连续天数（streak）：以"当天 seconds > 0"计，由前端从日数据计算。
7. txt/md/epub/PDF 阅读均计时（挂在阅读页层面，与格式无关）。

## Acceptance Criteria

- [ ] 阅读约 2 分钟后回到书架，今日时长 ≥ 2 分钟。
- [ ] 页面切到后台的时间不计入（可用 DevTools 验证上报值）。
- [ ] 昨天与今天都有阅读时连续天数 ≥ 2；中断一天后重置。
- [ ] 热力图网格与月份/星期参考轴渲染正确，双主题下均清晰可读。
- [ ] 移动端（375px 宽）统计条与热力图不破版。
- [ ] 未登录上报/查询返回 401；非法 date 格式 400。
- [ ] API 有 vitest 覆盖；`pnpm typecheck && pnpm test && pnpm build` 通过。

## Out of Scope

- 按书维度统计、时段分布、周报/年报分享图。
- 多设备同时阅读的去重（双计可接受的边缘情况）。
- 历史数据回填（从安装之日起记录）。
