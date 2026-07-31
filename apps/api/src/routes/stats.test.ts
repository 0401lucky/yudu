import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { statsRoutes } from "./stats";

type StatRow = {
  user_id: string;
  date: string;
  seconds: number;
  updated_at: number;
};

/** 年度报告 mock 用：reading_progress 行（含 join books/chapters 所需字段） */
type ProgressRow = {
  user_id: string;
  book_id: string;
  chapter_count: number;
  chapter_index: number;
  char_offset: number;
  progress_char_count: number | null;
  updated_at: number;
};

type CreatedRow = { user_id: string; created_at: number; note?: string | null };

const USER_ID = "user-1";

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - reading_stats_daily 存内存 Map（key = user|date），模拟 ON CONFLICT 累加
 * - 记录范围查询的起始日期，供 days clamp 断言
 * - progress / highlights / bookmarks 存内存数组，供年度报告聚合查询
 */
function createMockDb() {
  const stats = new Map<string, StatRow>();
  const progress: ProgressRow[] = [];
  const highlights: CreatedRow[] = [];
  const bookmarks: CreatedRow[] = [];
  const state = { lastRangeStart: null as string | null };

  const keyOf = (userId: string, date: string) => `${userId}|${date}`;

  /** 该用户该年（LIKE 'YYYY-%'）的非零日记录，升序 */
  const yearRows = (userId: string, like: string) =>
    [...stats.values()]
      .filter(
        (r) =>
          r.user_id === userId &&
          r.date.startsWith(like.slice(0, -1)) &&
          r.seconds > 0,
      )
      .sort((a, b) => (a.date < b.date ? -1 : 1));

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT INTO reading_stats_daily")) {
              const [userId, date, seconds, updatedAt] = args as [
                string,
                string,
                number,
                number,
              ];
              const key = keyOf(userId, date);
              const existing = stats.get(key);
              if (existing) {
                existing.seconds += seconds;
                existing.updated_at = updatedAt;
              } else {
                stats.set(key, {
                  user_id: userId,
                  date,
                  seconds,
                  updated_at: updatedAt,
                });
              }
              return { success: true, meta: { changes: 1 } };
            }
            throw new Error(`unexpected run sql: ${sql}`);
          },
          async first<T>() {
            if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
              return { id: "sess-1", user_id: USER_ID } as T;
            }
            if (
              sql.includes("SELECT seconds FROM reading_stats_daily") &&
              sql.includes("date = ?")
            ) {
              const [userId, date] = args as [string, string];
              const row = stats.get(keyOf(userId, date));
              return row ? ({ seconds: row.seconds } as T) : null;
            }
            // 年度报告：最忙一天（seconds 降序、date 升序取首行）
            if (sql.includes("ORDER BY seconds DESC")) {
              const [userId, like] = args as [string, string];
              const rows = [...yearRows(userId, like)].sort(
                (a, b) => b.seconds - a.seconds || (a.date < b.date ? -1 : 1),
              );
              const top = rows[0];
              return top
                ? ({ date: top.date, seconds: top.seconds } as T)
                : null;
            }
            // 年度报告：年内有进度更新的书数
            if (sql.includes("COUNT(DISTINCT book_id)")) {
              const [userId, start, end] = args as [string, number, number];
              const ids = new Set(
                progress
                  .filter(
                    (r) =>
                      r.user_id === userId &&
                      r.updated_at >= start &&
                      r.updated_at < end,
                  )
                  .map((r) => r.book_id),
              );
              return { n: ids.size } as T;
            }
            // 年度报告：年内创建的高亮数 / 带笔记数
            if (sql.includes("FROM highlights")) {
              const [userId, start, end] = args as [string, number, number];
              const rows = highlights.filter(
                (r) =>
                  r.user_id === userId &&
                  r.created_at >= start &&
                  r.created_at < end,
              );
              return {
                highlight_count: rows.length,
                note_count: rows.filter((r) => r.note != null).length,
              } as T;
            }
            // 年度报告：年内创建的书签数
            if (sql.includes("FROM bookmarks")) {
              const [userId, start, end] = args as [string, number, number];
              return {
                n: bookmarks.filter(
                  (r) =>
                    r.user_id === userId &&
                    r.created_at >= start &&
                    r.created_at < end,
                ).length,
              } as T;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
          async all<T>() {
            if (
              sql.includes("FROM reading_stats_daily") &&
              sql.includes("date >= ?")
            ) {
              const [userId, startStr] = args as [string, string];
              state.lastRangeStart = startStr;
              const rows = [...stats.values()]
                .filter(
                  (r) =>
                    r.user_id === userId &&
                    r.date >= startStr &&
                    r.seconds > 0,
                )
                .sort((a, b) => (a.date < b.date ? -1 : 1))
                .map((r) => ({ date: r.date, seconds: r.seconds }));
              return { results: rows as T[] };
            }
            // 年度报告：substr(date,6,2) 月度分组
            if (sql.includes("substr(date, 6, 2)")) {
              const [userId, like] = args as [string, string];
              const byMonth = new Map<
                string,
                { seconds: number; days: number }
              >();
              for (const r of yearRows(userId, like)) {
                const month = r.date.slice(5, 7);
                const acc = byMonth.get(month) ?? { seconds: 0, days: 0 };
                acc.seconds += r.seconds;
                acc.days += 1;
                byMonth.set(month, acc);
              }
              const rows = [...byMonth.entries()].map(([month, v]) => ({
                month,
                seconds: v.seconds,
                days: v.days,
              }));
              return { results: rows as T[] };
            }
            // 年度报告：该年稀疏日列表（升序）
            if (
              sql.includes("FROM reading_stats_daily") &&
              sql.includes("date LIKE ?")
            ) {
              const [userId, like] = args as [string, string];
              const rows = yearRows(userId, like).map((r) => ({
                date: r.date,
                seconds: r.seconds,
              }));
              return { results: rows as T[] };
            }
            // 年度报告：books join progress（读完判定用的进度行）
            if (sql.includes("FROM books b")) {
              const [userId] = args as [string];
              const rows = progress
                .filter((r) => r.user_id === userId)
                .map((r) => ({
                  chapter_count: r.chapter_count,
                  chapter_index: r.chapter_index,
                  char_offset: r.char_offset,
                  progress_char_count: r.progress_char_count,
                }));
              return { results: rows as T[] };
            }
            throw new Error(`unexpected all sql: ${sql}`);
          },
        };
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    _stats: stats,
    _progress: progress,
    _highlights: highlights,
    _bookmarks: bookmarks,
    _state: state,
  };

  return db as unknown as D1Database & {
    _stats: Map<string, StatRow>;
    _progress: ProgressRow[];
    _highlights: CreatedRow[];
    _bookmarks: CreatedRow[];
    _state: { lastRangeStart: string | null };
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/stats", statsRoutes);
  const env: Env = {
    DB: db,
    BOOKS_BUCKET: {} as R2Bucket,
    SESSION_SECRET: "test-session-secret",
    AI_KEY_SECRET: "test-ai-key-secret",
  };
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init, env);
    },
  };
}

const authedHeaders = {
  Cookie: `${SESSION_COOKIE}=any-token`,
  "Content-Type": "application/json",
};

// 固定系统时间，避免 UTC 午夜边界导致 cutoff 断言抖动
const FIXED_NOW = Date.parse("2026-07-24T12:00:00Z");
const DAY_MS = 86_400_000;

function expectedStart(days: number): string {
  return new Date(FIXED_NOW + DAY_MS - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

describe("stats routes", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    db = createMockDb();
    app = createApp(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("未登录访问返回 401", async () => {
    const post = await app.request("/api/stats/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-07-24", seconds: 60 }),
    });
    expect(post.status).toBe(401);

    const get = await app.request("/api/stats/reading");
    expect(get.status).toBe(401);

    const annual = await app.request("/api/stats/annual");
    expect(annual.status).toBe(401);
  });

  it("同日多次上报按秒数累加", async () => {
    const first = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ date: "2026-07-24", seconds: 60 }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ date: "2026-07-24", seconds: 60 });

    const second = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ date: "2026-07-24", seconds: 90 }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ date: "2026-07-24", seconds: 150 });

    const get = await app.request("/api/stats/reading", {
      headers: authedHeaders,
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({
      days: [{ date: "2026-07-24", seconds: 150 }],
    });
  });

  it("单次上报超过 300 秒截断为 300", async () => {
    const res = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ date: "2026-07-24", seconds: 400 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: "2026-07-24", seconds: 300 });
    expect(db._stats.get(`${USER_ID}|2026-07-24`)?.seconds).toBe(300);
  });

  it("seconds 边界：300 恰好通过，0/负数/小数/非数字拒绝", async () => {
    const exact = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ date: "2026-07-24", seconds: 300 }),
    });
    expect(exact.status).toBe(200);
    expect(await exact.json()).toEqual({ date: "2026-07-24", seconds: 300 });

    for (const seconds of [0, -5, 1.5, "60", null]) {
      const res = await app.request("/api/stats/reading", {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ date: "2026-07-24", seconds }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INVALID_STAT");
    }
  });

  it("非法 date 格式返回 400 INVALID_STAT", async () => {
    for (const date of [
      "2026/07/24",
      "2026-7-4",
      "20260724",
      20260724,
      null,
      // 通过正则但语义非法的假日期
      "2026-13-45",
      "2026-02-30",
      "2026-02-29", // 2026 非闰年
    ]) {
      const res = await app.request("/api/stats/reading", {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify({ date, seconds: 60 }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INVALID_STAT");
    }

    // 真闰日不应被语义校验误伤
    const leap = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ date: "2024-02-29", seconds: 60 }),
    });
    expect(leap.status).toBe(200);
  });

  it("请求体不是合法 JSON 返回 400 INVALID_BODY", async () => {
    const res = await app.request("/api/stats/reading", {
      method: "POST",
      headers: authedHeaders,
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_BODY");
  });

  it("GET 仅返回窗口内非零记录，按日期升序", async () => {
    const now = FIXED_NOW;
    db._stats.set(`${USER_ID}|2026-07-24`, {
      user_id: USER_ID,
      date: "2026-07-24",
      seconds: 120,
      updated_at: now,
    });
    db._stats.set(`${USER_ID}|2026-07-20`, {
      user_id: USER_ID,
      date: "2026-07-20",
      seconds: 30,
      updated_at: now,
    });
    // 零值行与窗口外旧记录均应被过滤
    db._stats.set(`${USER_ID}|2026-07-22`, {
      user_id: USER_ID,
      date: "2026-07-22",
      seconds: 0,
      updated_at: now,
    });
    db._stats.set(`${USER_ID}|2020-01-01`, {
      user_id: USER_ID,
      date: "2020-01-01",
      seconds: 999,
      updated_at: now,
    });

    const res = await app.request("/api/stats/reading?days=30", {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      days: [
        { date: "2026-07-20", seconds: 30 },
        { date: "2026-07-24", seconds: 120 },
      ],
    });
  });

  it("days 参数默认 365 并 clamp 到 1–400", async () => {
    const cases: Array<[string, number]> = [
      ["", 365],
      ["?days=abc", 365],
      ["?days=0", 1],
      ["?days=-3", 1],
      ["?days=9999", 400],
      ["?days=30", 30],
    ];
    for (const [query, days] of cases) {
      const res = await app.request(`/api/stats/reading${query}`, {
        headers: authedHeaders,
      });
      expect(res.status).toBe(200);
      expect(db._state.lastRangeStart).toBe(expectedStart(days));
    }
  });

  describe("GET /api/stats/annual", () => {
    /** 向 mock 写入一条日统计 */
    function seedStat(userId: string, date: string, seconds: number) {
      db._stats.set(`${userId}|${date}`, {
        user_id: userId,
        date,
        seconds,
        updated_at: FIXED_NOW,
      });
    }

    it("各指标口径正确，且只统计本人数据", async () => {
      const ts2026 = Date.UTC(2026, 4, 1);
      const ts2025 = Date.UTC(2025, 4, 1);

      // 时长：1 月两天（连续）+ 3 月一天
      seedStat(USER_ID, "2026-01-05", 600);
      seedStat(USER_ID, "2026-01-06", 1200);
      seedStat(USER_ID, "2026-03-10", 300);
      // 他人数据不应计入
      seedStat("user-2", "2026-01-06", 9999);

      // 进度：book-a 读完（99%）、book-b 读到一半、book-c 去年更新（不计 booksRead）
      db._progress.push(
        {
          user_id: USER_ID,
          book_id: "book-a",
          chapter_count: 10,
          chapter_index: 9,
          char_offset: 900,
          progress_char_count: 1000,
          updated_at: ts2026,
        },
        {
          user_id: USER_ID,
          book_id: "book-b",
          chapter_count: 10,
          chapter_index: 5,
          char_offset: 0,
          progress_char_count: 1000,
          updated_at: ts2026,
        },
        {
          user_id: USER_ID,
          book_id: "book-c",
          chapter_count: 10,
          chapter_index: 3,
          char_offset: 0,
          progress_char_count: 1000,
          updated_at: ts2025,
        },
        // 他人读完的书不应计入
        {
          user_id: "user-2",
          book_id: "book-x",
          chapter_count: 1,
          chapter_index: 0,
          char_offset: 1000,
          progress_char_count: 1000,
          updated_at: ts2026,
        },
      );

      // 高亮：年内 2 条（其中 1 条带笔记）；去年 1 条、他人 1 条不计
      db._highlights.push(
        { user_id: USER_ID, created_at: ts2026, note: "有想法" },
        { user_id: USER_ID, created_at: ts2026, note: null },
        { user_id: USER_ID, created_at: ts2025, note: "去年" },
        { user_id: "user-2", created_at: ts2026, note: null },
      );
      db._bookmarks.push(
        { user_id: USER_ID, created_at: ts2026 },
        { user_id: "user-2", created_at: ts2026 },
      );

      const res = await app.request("/api/stats/annual?year=2026", {
        headers: authedHeaders,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      expect(body.totalSeconds).toBe(2100);
      expect(body.activeDays).toBe(3);
      expect(body.maxStreakDays).toBe(2);
      expect(body.booksRead).toBe(2);
      expect(body.booksFinished).toBe(1);
      expect(body.highlightCount).toBe(2);
      expect(body.noteCount).toBe(1);
      expect(body.bookmarkCount).toBe(1);
      expect(body.busiestDay).toEqual({ date: "2026-01-06", seconds: 1200 });
      const monthly = new Array<number>(12).fill(0);
      monthly[0] = 1800;
      monthly[2] = 300;
      expect(body.monthlySeconds).toEqual(monthly);
      expect(body.days).toEqual([
        { date: "2026-01-05", seconds: 600 },
        { date: "2026-01-06", seconds: 1200 },
        { date: "2026-03-10", seconds: 300 },
      ]);
    });

    it("最长连续天数可跨月边界", async () => {
      for (const date of [
        "2026-01-30",
        "2026-01-31",
        "2026-02-01",
        "2026-02-02",
        // 断档后较短的一段
        "2026-02-05",
        "2026-02-06",
      ]) {
        seedStat(USER_ID, date, 60);
      }
      const res = await app.request("/api/stats/annual?year=2026", {
        headers: authedHeaders,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { maxStreakDays: number };
      expect(body.maxStreakDays).toBe(4);
    });

    it("缺省 year 取当前年，且不计入其他年份数据", async () => {
      seedStat(USER_ID, "2026-06-01", 120);
      seedStat(USER_ID, "2025-06-01", 999);

      const res = await app.request("/api/stats/annual", {
        headers: authedHeaders,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalSeconds: number;
        activeDays: number;
        days: unknown[];
      };
      expect(body.totalSeconds).toBe(120);
      expect(body.activeDays).toBe(1);
      expect(body.days).toEqual([{ date: "2026-06-01", seconds: 120 }]);
    });

    it("非法 year 返回 400 INVALID_YEAR，边界年份合法", async () => {
      for (const year of ["2019", "2027", "abc", "-1", "2026abc"]) {
        const res = await app.request(`/api/stats/annual?year=${year}`, {
          headers: authedHeaders,
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { code: string } };
        expect(body.error.code).toBe("INVALID_YEAR");
      }
      // 下界 2020 与当前年（FIXED_NOW 为 2026）均可查
      for (const year of ["2020", "2026"]) {
        const res = await app.request(`/api/stats/annual?year=${year}`, {
          headers: authedHeaders,
        });
        expect(res.status).toBe(200);
      }
    });

    it("空数据返回全零与 null busiestDay", async () => {
      const res = await app.request("/api/stats/annual?year=2026", {
        headers: authedHeaders,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        totalSeconds: 0,
        activeDays: 0,
        maxStreakDays: 0,
        booksRead: 0,
        booksFinished: 0,
        highlightCount: 0,
        noteCount: 0,
        bookmarkCount: 0,
        busiestDay: null,
        monthlySeconds: new Array(12).fill(0),
        days: [],
      });
    });
  });
});
