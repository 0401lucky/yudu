import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes, meRoutes } from "./routes/auth";
import { bookmarksRoutes } from "./routes/bookmarks";
import { booksRoutes } from "./routes/books";
import { preferencesRoutes } from "./routes/preferences";
import { progressRoutes } from "./routes/progress";
import { searchRoutes } from "./routes/search";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowed = c.env.WEB_ORIGIN;
  if (origin && allowed && origin === allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    c.header("Vary", "Origin");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, name: "雨读" }));

app.route("/api/auth", authRoutes);
app.route("/api", meRoutes);
app.route("/api/books", booksRoutes);
// 书签挂在 /api/books/:id/bookmarks；booksRoutes 未匹配的子路径落到这里
app.route("/api/books", bookmarksRoutes);
// 书内搜索挂在 /api/books/:id/search，同前缀挂载
app.route("/api/books", searchRoutes);
app.route("/api/progress", progressRoutes);
app.route("/api/preferences", preferencesRoutes);

/**
 * 非 /api 请求交给 Workers Assets（SPA）。
 * run_worker_first=true 时必须显式回退，否则前端 404。
 */
app.all("*", async (c) => {
  if (c.req.path.startsWith("/api")) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "接口不存在" } },
      404,
    );
  }
  if (!c.env.ASSETS) {
    return c.text("静态资源未配置", 500);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
