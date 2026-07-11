import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, SESSION_DAYS } from "@yudu/shared";
import type { UserPublic } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { hashPassword, verifyPassword } from "../services/password";
import {
  createSession,
  deleteSession,
  resolveSession,
} from "../services/session";

const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

type AuthBody = {
  email?: unknown;
  password?: unknown;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
};

function toUserPublic(row: {
  id: string;
  email: string;
  display_name: string | null;
}): UserPublic {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  };
}

function parseCredentials(body: AuthBody):
  | { email: string; password: string }
  | { error: string } {
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return { error: "请提供邮箱和密码" };
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return { error: "请提供邮箱和密码" };
  }
  if (!email.includes("@")) {
    return { error: "邮箱格式无效" };
  }
  if (password.length < 8) {
    return { error: "密码至少 8 位" };
  }
  return { email, password };
}

function isSecureRequest(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge: SESSION_MAX_AGE,
    secure: isSecureRequest(c.req.url),
  });
}

function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, {
    path: "/",
    secure: isSecureRequest(c.req.url),
  });
}

/** /api/auth/* */
export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post("/register", async (c) => {
  let body: AuthBody;
  try {
    body = await c.req.json<AuthBody>();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体须为 JSON" } },
      400,
    );
  }

  const parsed = parseCredentials(body);
  if ("error" in parsed) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error } },
      400,
    );
  }

  const { email, password } = parsed;
  const existing = await c.env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<{ id: string }>();

  if (existing) {
    return c.json(
      { error: { code: "EMAIL_TAKEN", message: "该邮箱已注册" } },
      409,
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const passwordHash = await hashPassword(password);

  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
      ).bind(id, email, passwordHash, now, now),
      c.env.DB.prepare(
        `INSERT INTO user_preferences (user_id, theme, font_size, line_height, page_margin, updated_at)
         VALUES (?, 'night', 18, 1.75, 'normal', ?)`,
      ).bind(id, now),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return c.json(
        { error: { code: "EMAIL_TAKEN", message: "该邮箱已注册" } },
        409,
      );
    }
    throw err;
  }

  const session = await createSession(c.env.DB, id, c.env.SESSION_SECRET);
  setSessionCookie(c, session.token);

  return c.json(toUserPublic({ id, email, display_name: null }), 201);
});

authRoutes.post("/login", async (c) => {
  let body: AuthBody;
  try {
    body = await c.req.json<AuthBody>();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体须为 JSON" } },
      400,
    );
  }

  const parsed = parseCredentials(body);
  if ("error" in parsed) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error } },
      400,
    );
  }

  const { email, password } = parsed;
  const row = await c.env.DB.prepare(
    `SELECT id, email, display_name, password_hash FROM users WHERE email = ?`,
  )
    .bind(email)
    .first<UserRow>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json(
      { error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码错误" } },
      401,
    );
  }

  const session = await createSession(c.env.DB, row.id, c.env.SESSION_SECRET);
  setSessionCookie(c, session.token);

  return c.json(toUserPublic(row), 200);
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const session = await resolveSession(
      c.env.DB,
      token,
      c.env.SESSION_SECRET,
    );
    if (session) {
      await deleteSession(c.env.DB, session.id);
    }
  }
  clearSessionCookie(c);
  return c.body(null, 204);
});

/** /api/me */
export const meRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

meRoutes.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    `SELECT id, email, display_name FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{ id: string; email: string; display_name: string | null }>();

  if (!row) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录" } },
      401,
    );
  }

  return c.json(toUserPublic(row), 200);
});
