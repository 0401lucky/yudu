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

const USER_ID = "user-1";

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - reading_stats_daily 存内存 Map（key = user|date），模拟 ON CONFLICT 累加
 * - 记录范围查询的起始日期，供 days clamp 断言
 */
function createMockDb() {
  const stats = new Map<string, StatRow>();
  const state = { lastRangeStart: null as string | null };

  const keyOf = (userId: string, date: string) => `${userId}|${date}`;

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
    _state: state,
  };

  return db as unknown as D1Database & {
    _stats: Map<string, StatRow>;
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
});
