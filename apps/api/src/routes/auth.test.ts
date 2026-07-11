import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { authRoutes, meRoutes } from "./auth";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
};

type PrefRow = {
  user_id: string;
  theme: string;
  font_size: number;
  line_height: number;
  page_margin: string;
  updated_at: number;
};

function createMockDb() {
  const users = new Map<string, UserRow>();
  const usersByEmail = new Map<string, string>();
  const sessions = new Map<string, SessionRow>();
  const prefs = new Map<string, PrefRow>();

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT INTO users")) {
              const row: UserRow = {
                id: args[0] as string,
                email: args[1] as string,
                password_hash: args[2] as string,
                display_name: (args[3] as string | null) ?? null,
                created_at: args[4] as number,
                updated_at: args[5] as number,
              };
              if (usersByEmail.has(row.email)) {
                throw new Error("UNIQUE constraint failed: users.email");
              }
              users.set(row.id, row);
              usersByEmail.set(row.email, row.id);
              return { success: true };
            }
            if (sql.includes("INSERT INTO user_preferences")) {
              const row: PrefRow = {
                user_id: args[0] as string,
                theme: "night",
                font_size: 18,
                line_height: 1.75,
                page_margin: "normal",
                updated_at: args[1] as number,
              };
              prefs.set(row.user_id, row);
              return { success: true };
            }
            if (sql.includes("INSERT INTO sessions")) {
              const row: SessionRow = {
                id: args[0] as string,
                user_id: args[1] as string,
                token_hash: args[2] as string,
                expires_at: args[3] as number,
                created_at: args[4] as number,
              };
              sessions.set(row.id, row);
              return { success: true };
            }
            if (sql.includes("DELETE FROM sessions")) {
              sessions.delete(args[0] as string);
              return { success: true };
            }
            throw new Error(`unexpected run sql: ${sql}`);
          },
          async first<T>() {
            if (sql.includes("FROM users WHERE email")) {
              const email = args[0] as string;
              const id = usersByEmail.get(email);
              if (!id) return null;
              const u = users.get(id)!;
              if (sql.includes("password_hash")) {
                return {
                  id: u.id,
                  email: u.email,
                  display_name: u.display_name,
                  password_hash: u.password_hash,
                } as T;
              }
              return { id: u.id } as T;
            }
            if (sql.includes("FROM users WHERE id")) {
              const id = args[0] as string;
              const u = users.get(id);
              if (!u) return null;
              return {
                id: u.id,
                email: u.email,
                display_name: u.display_name,
              } as T;
            }
            if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
              const tokenHash = args[0] as string;
              const now = args[1] as number;
              for (const row of sessions.values()) {
                if (row.token_hash === tokenHash && row.expires_at > now) {
                  return { id: row.id, user_id: row.user_id } as T;
                }
              }
              return null;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
        };
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    async batch(stmts: { bind: (...a: unknown[]) => { run: () => Promise<unknown> } }[]) {
      // Hono/D1 batch: statements already have bind() applied
      for (const s of stmts as unknown as { run: () => Promise<unknown> }[]) {
        await s.run();
      }
      return [];
    },
    _users: users,
    _prefs: prefs,
    _sessions: sessions,
  };

  return db as unknown as D1Database & {
    _users: Map<string, UserRow>;
    _prefs: Map<string, PrefRow>;
    _sessions: Map<string, SessionRow>;
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/auth", authRoutes);
  app.route("/api", meRoutes);
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

function cookieFrom(res: Response): string | null {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  const m = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return m?.[1] ?? null;
}

describe("auth routes", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createMockDb();
    app = createApp(db);
  });

  it("注册成功返回 201、用户与 Cookie，并写入默认偏好", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "  A@Test.COM ",
        password: "password1",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      email: string;
      displayName: string | null;
    };
    expect(body.email).toBe("a@test.com");
    expect(body.id).toBeTruthy();
    expect(body.displayName).toBeNull();

    const token = cookieFrom(res);
    expect(token).toBeTruthy();
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);

    expect(db._users.size).toBe(1);
    expect(db._prefs.size).toBe(1);
    const pref = [...db._prefs.values()][0]!;
    expect(pref.theme).toBe("night");
    expect(pref.font_size).toBe(18);
    expect(pref.line_height).toBe(1.75);
    expect(pref.page_margin).toBe("normal");
  });

  it("重复邮箱返回 409 EMAIL_TAKEN", async () => {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@test.com", password: "password1" }),
    });
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@test.com", password: "password2" }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("EMAIL_TAKEN");
  });

  it("密码过短返回 400", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@test.com", password: "short" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("登录成功后 /api/me 返回同一用户", async () => {
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@test.com", password: "password1" }),
    });
    const regBody = (await reg.json()) as { id: string };

    // 清会话后重新登录
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ME@test.com", password: "password1" }),
    });
    expect(login.status).toBe(200);
    const token = cookieFrom(login);
    expect(token).toBeTruthy();

    const me = await app.request("/api/me", {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { id: string; email: string };
    expect(meBody.email).toBe("me@test.com");
    expect(meBody.id).toBe(regBody.id);
  });

  it("错误密码登录 401；无 Cookie 访问 me 401", async () => {
    await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@test.com", password: "password1" }),
    });

    const bad = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@test.com", password: "wrongpass" }),
    });
    expect(bad.status).toBe(401);

    const me = await app.request("/api/me");
    expect(me.status).toBe(401);
  });

  it("登出后会话失效，/api/me 401", async () => {
    const reg = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "out@test.com", password: "password1" }),
    });
    const token = cookieFrom(reg)!;

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(logout.status).toBe(204);
    expect(db._sessions.size).toBe(0);

    const me = await app.request("/api/me", {
      headers: { Cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(me.status).toBe(401);
  });
});
