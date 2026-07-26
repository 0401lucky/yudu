import { Hono } from "hono";
import { MIN_REPORT_YEAR } from "@yudu/shared";
import type {
  AnnualReportResponse,
  DailyReadingStat,
  ReadingStatsResponse,
} from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { calcProgressPercent } from "./books";

/** 单次上报增量上限（秒）：超出按此值截断，防异常膨胀 */
const MAX_DELTA_SECONDS = 300;
/** GET 查询天数默认值与上限 */
const DEFAULT_DAYS = 365;
const MAX_DAYS = 400;
/** 「读完」判定阈值：进度百分比 ≥98 */
const FINISHED_PERCENT = 98;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 正则之外的语义校验：拦下 2026-13-45、2026-02-30 这类通过正则的假日期 */
function isRealDate(date: string): boolean {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export const statsRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

statsRoutes.use("*", authMiddleware);

/**
 * POST /api/stats/reading — 累加当日阅读秒数
 * body: { date: 'YYYY-MM-DD'（用户本地日期）, seconds: 1–300 整数 }
 * seconds 超出上限时截断为 300；返回累加后的当日记录
 */
statsRoutes.post("/reading", async (c) => {
  const userId = c.get("userId");

  let body: { date?: unknown; seconds?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }

  const date = body.date;
  if (typeof date !== "string" || !DATE_RE.test(date) || !isRealDate(date)) {
    return c.json(
      {
        error: { code: "INVALID_STAT", message: "date 须为合法的 YYYY-MM-DD 日期" },
      },
      400,
    );
  }

  const seconds = body.seconds;
  if (
    typeof seconds !== "number" ||
    !Number.isInteger(seconds) ||
    seconds <= 0
  ) {
    return c.json(
      { error: { code: "INVALID_STAT", message: "seconds 须为正整数" } },
      400,
    );
  }
  const delta = Math.min(seconds, MAX_DELTA_SECONDS);

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO reading_stats_daily (user_id, date, seconds, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       seconds = seconds + excluded.seconds,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, date, delta, now)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT seconds FROM reading_stats_daily WHERE user_id = ? AND date = ?`,
  )
    .bind(userId, date)
    .first<{ seconds: number }>();

  const stat: DailyReadingStat = { date, seconds: row?.seconds ?? delta };
  return c.json(stat);
});

/**
 * GET /api/stats/reading?days=365 — 查询近 N 天的非零记录（稀疏，前端补零）
 * days 默认 365，clamp 1–400；起点按服务器 UTC 今天 + 1 天冗余往前推，
 * 覆盖客户端本地时区超前 UTC 的情况
 */
statsRoutes.get("/reading", async (c) => {
  const userId = c.get("userId");

  const raw = Number.parseInt(c.req.query("days") ?? "", 10);
  const days = Number.isNaN(raw)
    ? DEFAULT_DAYS
    : Math.min(Math.max(raw, 1), MAX_DAYS);

  const DAY_MS = 86_400_000;
  const start = new Date(Date.now() + DAY_MS - days * DAY_MS);
  const startStr = start.toISOString().slice(0, 10);

  const { results } = await c.env.DB.prepare(
    `SELECT date, seconds FROM reading_stats_daily
     WHERE user_id = ? AND date >= ? AND seconds > 0
     ORDER BY date ASC`,
  )
    .bind(userId, startStr)
    .all<{ date: string; seconds: number }>();

  const res: ReadingStatsResponse = {
    days: (results ?? []).map((r) => ({ date: r.date, seconds: r.seconds })),
  };
  return c.json(res);
});

/** 年内最长连续阅读天数：对升序稀疏日期序列线性扫描 */
function calcMaxStreakDays(dates: string[]): number {
  const DAY_MS = 86_400_000;
  let max = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const date of dates) {
    const t = Date.parse(`${date}T00:00:00Z`);
    cur = prev != null && t - prev === DAY_MS ? cur + 1 : 1;
    prev = t;
    if (cur > max) max = cur;
  }
  return max;
}

/**
 * GET /api/stats/annual?year=YYYY — 年度阅读报告
 * year 默认当前年；仅接受 2020–当前年，越界返回 400 INVALID_YEAR。
 * 时长类指标按 date 前缀过滤（用户本地日）；创建类计数按 created_at 的 UTC 年窗口。
 */
statsRoutes.get("/annual", async (c) => {
  const userId = c.get("userId");

  const currentYear = new Date(Date.now()).getUTCFullYear();
  const rawYear = c.req.query("year");
  // 严格四位数字，避免 parseInt 对 "2026abc" 之类的宽松解析
  const year =
    rawYear == null || rawYear === ""
      ? currentYear
      : /^\d{4}$/.test(rawYear)
        ? Number.parseInt(rawYear, 10)
        : Number.NaN;
  if (
    !Number.isInteger(year) ||
    year < MIN_REPORT_YEAR ||
    year > currentYear
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_YEAR",
          message: `year 须为 ${MIN_REPORT_YEAR}–${currentYear} 之间的年份`,
        },
      },
      400,
    );
  }

  const datePrefix = `${year}-%`;
  // created_at / updated_at 为毫秒时间戳，按 UTC 年窗口 [start, end) 过滤
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);

  // 该年稀疏日数据（升序）：响应 days + JS 扫最长连续天数
  const { results: dayRows } = await c.env.DB.prepare(
    `SELECT date, seconds FROM reading_stats_daily
     WHERE user_id = ? AND date LIKE ? AND seconds > 0
     ORDER BY date ASC`,
  )
    .bind(userId, datePrefix)
    .all<{ date: string; seconds: number }>();
  const days: DailyReadingStat[] = (dayRows ?? []).map((r) => ({
    date: r.date,
    seconds: r.seconds,
  }));

  // 月度聚合（substr(date,6,2) = 'MM'），顺带得出总时长与活跃天数
  const { results: monthRows } = await c.env.DB.prepare(
    `SELECT substr(date, 6, 2) AS month,
            SUM(seconds) AS seconds,
            COUNT(*) AS days
     FROM reading_stats_daily
     WHERE user_id = ? AND date LIKE ? AND seconds > 0
     GROUP BY substr(date, 6, 2)`,
  )
    .bind(userId, datePrefix)
    .all<{ month: string; seconds: number; days: number }>();

  const monthlySeconds = new Array<number>(12).fill(0);
  let totalSeconds = 0;
  let activeDays = 0;
  for (const row of monthRows ?? []) {
    const idx = Number.parseInt(row.month, 10) - 1;
    if (idx >= 0 && idx < 12) monthlySeconds[idx] = row.seconds;
    totalSeconds += row.seconds;
    activeDays += row.days;
  }

  // 时长最高的一天；并列时取日期较早者
  const busiest = await c.env.DB.prepare(
    `SELECT date, seconds FROM reading_stats_daily
     WHERE user_id = ? AND date LIKE ? AND seconds > 0
     ORDER BY seconds DESC, date ASC LIMIT 1`,
  )
    .bind(userId, datePrefix)
    .first<{ date: string; seconds: number }>();

  // 年内有进度更新的书数
  const readRow = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT book_id) AS n FROM reading_progress
     WHERE user_id = ? AND updated_at >= ? AND updated_at < ?`,
  )
    .bind(userId, yearStart, yearEnd)
    .first<{ n: number }>();

  // 读完的书（全量口径）：复用 books.ts 的 progressPercent 算法判定 ≥98%
  const { results: progressRows } = await c.env.DB.prepare(
    `SELECT b.chapter_count, p.chapter_index, p.char_offset,
            ch.char_count AS progress_char_count
     FROM books b
     JOIN reading_progress p
       ON p.book_id = b.id AND p.user_id = b.user_id
     LEFT JOIN chapters ch
       ON ch.book_id = b.id AND ch.idx = p.chapter_index
     WHERE b.user_id = ?`,
  )
    .bind(userId)
    .all<{
      chapter_count: number;
      chapter_index: number | null;
      char_offset: number | null;
      progress_char_count: number | null;
    }>();
  const booksFinished = (progressRows ?? []).filter(
    (r) =>
      (calcProgressPercent(
        r.chapter_count,
        r.chapter_index,
        r.char_offset,
        r.progress_char_count,
      ) ?? 0) >= FINISHED_PERCENT,
  ).length;

  // 年内创建的高亮/笔记数（COUNT(note) 只计非 NULL）
  const hlRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS highlight_count, COUNT(note) AS note_count
     FROM highlights
     WHERE user_id = ? AND created_at >= ? AND created_at < ?`,
  )
    .bind(userId, yearStart, yearEnd)
    .first<{ highlight_count: number; note_count: number }>();

  // 年内创建的书签数
  const bmRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bookmarks
     WHERE user_id = ? AND created_at >= ? AND created_at < ?`,
  )
    .bind(userId, yearStart, yearEnd)
    .first<{ n: number }>();

  const report: AnnualReportResponse = {
    totalSeconds,
    activeDays,
    maxStreakDays: calcMaxStreakDays(days.map((d) => d.date)),
    booksRead: readRow?.n ?? 0,
    booksFinished,
    highlightCount: hlRow?.highlight_count ?? 0,
    noteCount: hlRow?.note_count ?? 0,
    bookmarkCount: bmRow?.n ?? 0,
    busiestDay: busiest ? { date: busiest.date, seconds: busiest.seconds } : null,
    monthlySeconds,
    days,
  };
  return c.json(report);
});
