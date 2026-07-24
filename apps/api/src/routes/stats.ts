import { Hono } from "hono";
import type { DailyReadingStat, ReadingStatsResponse } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

/** 单次上报增量上限（秒）：超出按此值截断，防异常膨胀 */
const MAX_DELTA_SECONDS = 300;
/** GET 查询天数默认值与上限 */
const DEFAULT_DAYS = 365;
const MAX_DAYS = 400;

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
