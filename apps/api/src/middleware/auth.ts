import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { resolveSession } from "../services/session";

export type AuthVariables = {
  userId: string;
};

const unauthorizedBody = {
  error: { code: "UNAUTHORIZED" as const, message: "请先登录" },
};

/**
 * 从 Cookie 读取会话 token，校验未过期后设置 `userId`；
 * 失败返回 401。
 * 同一请求链上重复挂载（如同前缀多个子应用各自 use）时幂等跳过。
 */
export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AuthVariables;
}>(async (c, next) => {
  if (c.get("userId")) {
    await next();
    return;
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json(unauthorizedBody, 401);
  }

  const session = await resolveSession(c.env.DB, token, c.env.SESSION_SECRET);
  if (!session) {
    return c.json(unauthorizedBody, 401);
  }

  c.set("userId", session.userId);
  await next();
});
