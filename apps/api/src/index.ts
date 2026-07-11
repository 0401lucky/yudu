import { Hono } from "hono";
import type { Env } from "./env";
import { authRoutes, meRoutes } from "./routes/auth";
import { booksRoutes } from "./routes/books";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, name: "雨读" }));

app.route("/api/auth", authRoutes);
app.route("/api", meRoutes);
app.route("/api/books", booksRoutes);

export default app;
