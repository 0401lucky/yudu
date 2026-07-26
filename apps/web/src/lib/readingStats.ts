import type { DailyReadingStat } from "@yudu/shared";

/** 热力图周列数（GitHub 风格，约一年） */
export const HEATMAP_WEEKS = 52;

/** 强度档：0 无阅读 + 非零四分位 4 档 */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  seconds: number;
  level: HeatLevel;
  /** 晚于今天的占位格（不渲染颜色与提示） */
  inFuture: boolean;
  /** 早于 rangeStart 的占位格（年度视图裁掉上一年尾巴），渲染同 inFuture */
  outOfRange: boolean;
}

export interface HeatmapMonthLabel {
  /** 所在周列下标 */
  col: number;
  label: string;
}

/** Date → 本地日期字符串 YYYY-MM-DD（阅读统计以用户本地日为准） */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 稀疏记录 → date 到 seconds 的 Map */
export function toSecondsMap(days: DailyReadingStat[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) map.set(d.date, d.seconds);
  return map;
}

/**
 * 连续阅读天数：以「当天 seconds > 0」计。
 * 今天已阅读则从今天起算；今天还没读则从昨天起算（不打断连续语义）。
 */
export function calcStreak(map: Map<string, number>, today: Date): number {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  if (!((map.get(localDateStr(d)) ?? 0) > 0)) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while ((map.get(localDateStr(d)) ?? 0) > 0) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** 时长格式化：< 60 分钟显示「X 分钟」，≥ 60 显示「X 小时 Y 分」 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 分钟";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "不足 1 分钟";
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

/** 非零值的四分位阈值 [p25, p50, p75]；无非零值时为 null */
export function quantileThresholds(
  values: number[],
): [number, number, number] | null {
  const nonzero = values.filter((v) => v > 0);
  if (!nonzero.length) return null;
  const sorted = [...nonzero].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
  return [at(0.25), at(0.5), at(0.75)];
}

/** 按四分位阈值分档；用 >= 语义使唯一/相同值落到高档（点亮感更强） */
export function levelOf(
  seconds: number,
  thresholds: [number, number, number] | null,
): HeatLevel {
  if (seconds <= 0 || !thresholds) return 0;
  const [q1, q2, q3] = thresholds;
  if (seconds >= q3) return 4;
  if (seconds >= q2) return 3;
  if (seconds >= q1) return 2;
  return 1;
}

/**
 * 构建周列网格：列 = 周（时间从左往右递增），行 = 周一…周日。
 * 最后一列为今天所在周；晚于今天的格子标记 inFuture。
 * rangeStart（YYYY-MM-DD，可选）：早于它的格子标记 outOfRange（年度视图用）。
 */
export function buildHeatmapGrid(
  map: Map<string, number>,
  today: Date,
  weekCount: number = HEATMAP_WEEKS,
  rangeStart?: string,
): { weeks: HeatmapCell[][]; monthLabels: HeatmapMonthLabel[] } {
  const todayStr = localDateStr(today);
  // 正午基准，规避夏令时下 setDate 的跨日误差
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const firstMonday = new Date(monday);
  firstMonday.setDate(firstMonday.getDate() - (weekCount - 1) * 7);

  const thresholds = quantileThresholds([...map.values()]);
  const weeks: HeatmapCell[][] = [];
  const monthLabels: HeatmapMonthLabel[] = [];
  let prevMonth = -1;

  for (let col = 0; col < weekCount; col++) {
    const colMonday = new Date(firstMonday);
    colMonday.setDate(colMonday.getDate() + col * 7);
    // 列首进入新月份时标注；首列不标，等下一次变化（GitHub 同款处理）
    if (col > 0 && colMonday.getMonth() !== prevMonth) {
      monthLabels.push({ col, label: `${colMonday.getMonth() + 1}月` });
    }
    prevMonth = colMonday.getMonth();

    const cells: HeatmapCell[] = [];
    for (let row = 0; row < 7; row++) {
      const d = new Date(colMonday);
      d.setDate(d.getDate() + row);
      const date = localDateStr(d);
      const seconds = map.get(date) ?? 0;
      cells.push({
        date,
        seconds,
        level: levelOf(seconds, thresholds),
        inFuture: date > todayStr,
        outOfRange: rangeStart != null && date < rangeStart,
      });
    }
    weeks.push(cells);
  }
  return { weeks, monthLabels };
}
