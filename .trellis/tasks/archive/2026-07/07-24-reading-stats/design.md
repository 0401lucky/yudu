# 阅读统计热力图 — 技术设计

## 数据模型（D1 迁移 `0003_reading_stats.sql`）

```sql
CREATE TABLE reading_stats_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,            -- 用户本地日期 'YYYY-MM-DD'
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
```

- `date` 为**前端本地日期**（信任客户端时区），服务端不做时区换算——个人应用，防刷不是威胁模型重点。

## API（新文件 `apps/api/src/routes/stats.ts`，authMiddleware）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/stats/reading` | body `{date: 'YYYY-MM-DD', seconds: number}`；date 正则校验，seconds 为 1–300 整数（超出 clamp 到 300，≤0 拒绝 400）；UPSERT `seconds = seconds + excluded_delta` |
| GET | `/api/stats/reading?days=365` | 返回 `{days: [{date, seconds}]}`：从（服务器 UTC 今天 + 1 天冗余）往前 N 天内的**非零记录**（稀疏数组，前端补零）；days 默认 365，clamp 1–400 |

UPSERT 写法：

```sql
INSERT INTO reading_stats_daily (user_id, date, seconds, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(user_id, date) DO UPDATE SET
  seconds = seconds + excluded.seconds,
  updated_at = excluded.updated_at
```

## Shared 类型

```ts
export interface DailyReadingStat { date: string; seconds: number; }
export interface ReadingStatsResponse { days: DailyReadingStat[]; }
```

## 前端

### `useReadingClock`（新 hook，ReaderPage 挂载）

- `setInterval` 每秒累计 `pendingSeconds`（仅 `visibilityState === 'visible'` 时；监听 `visibilitychange` 起停）。
- flush 时机：累计满 60s / `visibilitychange → hidden` / `pagehide` / unmount（模式照抄 `useProgressSync.ts:47-63`）。
- flush 内容：`{date: 本地今天, seconds: pending}`，失败静默丢弃（统计非关键数据，不重试不阻塞）。
- 跨午夜边缘：flush 时取**当下**本地日期，误差最多一个上报周期，可接受。

### 书架统计（LibraryPage）

- 新组件 `ReadingStatsBar.tsx`：进入书架 GET 一次；显示"今日 X 分钟 · 连续 Y 天"，点击展开 `ReadingHeatmap.tsx`。
- streak 前端算：从今天往回数 `seconds > 0` 的连续天数（今天为 0 时从昨天起算，不打断"今天还没读"的 streak 语义）。
- 时长格式化：< 60 分钟显示"X 分钟"，≥ 60 显示"X 小时 Y 分"。

### `ReadingHeatmap.tsx`（自绘，无图表库）

- 数据：稀疏 days → Map，按周列补零展开 52×7 网格（列 = 周，行 = 周一…周日，与 GitHub 一致从左往右时间递增）。
- 强度分档：0 独立档 + 非零四分位 4 档；色阶用主题 CSS 变量（accent 色的透明度阶梯，night/paper 自适应）。
- 布局：div grid（每格约 10–12px 圆角方块 + 2px 间距）；顶部月份标签、左侧周几缩写（一/四/日 三行即可）。
- 交互：桌面 `title` 属性 + hover 高亮即可（MVP 不做自定义 tooltip 浮层）；移动端容器 `overflow-x-auto` 横向滚动，默认滚到最右（最近）。
- **实施前必读 dataviz 技能**（图表规范门槛）。

## 权衡

- 信任客户端 date/seconds：个人应用威胁模型下换取实现简单；clamp 挡意外不挡恶意。
- 多设备同读双计：接受（Out of Scope 已声明）。
- GET 每次进书架请求一次不缓存：数据小（≤365 行），可接受。
