import { Hono } from "hono";
import type { ThemeId, UserPreferences } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

export const preferencesRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

preferencesRoutes.use("*", authMiddleware);

const THEMES = new Set<ThemeId>(["night", "paper"]);
const MARGINS = new Set(["compact", "normal", "relaxed"]);

function defaults(): UserPreferences {
  return {
    theme: "night",
    fontSize: 18,
    lineHeight: 1.75,
    pageMargin: "normal",
  };
}

function rowToPrefs(row: {
  theme: string;
  font_size: number;
  line_height: number;
  page_margin: string;
}): UserPreferences {
  return {
    theme: (THEMES.has(row.theme as ThemeId)
      ? row.theme
      : "night") as ThemeId,
    fontSize: row.font_size,
    lineHeight: row.line_height,
    pageMargin: (MARGINS.has(row.page_margin)
      ? row.page_margin
      : "normal") as UserPreferences["pageMargin"],
  };
}

/** GET /api/preferences */
preferencesRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const row = await c.env.DB.prepare(
    `SELECT theme, font_size, line_height, page_margin
     FROM user_preferences WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{
      theme: string;
      font_size: number;
      line_height: number;
      page_margin: string;
    }>();

  if (!row) {
    return c.json(defaults());
  }
  return c.json(rowToPrefs(row));
});

/** PUT /api/preferences */
preferencesRoutes.put("/", async (c) => {
  const userId = c.get("userId");
  let body: Partial<UserPreferences>;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }

  const currentRow = await c.env.DB.prepare(
    `SELECT theme, font_size, line_height, page_margin
     FROM user_preferences WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{
      theme: string;
      font_size: number;
      line_height: number;
      page_margin: string;
    }>();

  const current = currentRow ? rowToPrefs(currentRow) : defaults();

  let theme = current.theme;
  if (body.theme !== undefined) {
    if (!THEMES.has(body.theme as ThemeId)) {
      return c.json(
        { error: { code: "INVALID_PREF", message: "主题无效" } },
        400,
      );
    }
    theme = body.theme as ThemeId;
  }

  let fontSize = current.fontSize;
  if (body.fontSize !== undefined) {
    if (
      typeof body.fontSize !== "number" ||
      !Number.isFinite(body.fontSize) ||
      body.fontSize < 14 ||
      body.fontSize > 28
    ) {
      return c.json(
        { error: { code: "INVALID_PREF", message: "字号须在 14–28" } },
        400,
      );
    }
    fontSize = Math.round(body.fontSize);
  }

  let lineHeight = current.lineHeight;
  if (body.lineHeight !== undefined) {
    if (
      typeof body.lineHeight !== "number" ||
      !Number.isFinite(body.lineHeight) ||
      body.lineHeight < 1.4 ||
      body.lineHeight > 2.2
    ) {
      return c.json(
        { error: { code: "INVALID_PREF", message: "行距须在 1.4–2.2" } },
        400,
      );
    }
    lineHeight = body.lineHeight;
  }

  let pageMargin = current.pageMargin;
  if (body.pageMargin !== undefined) {
    if (!MARGINS.has(body.pageMargin)) {
      return c.json(
        { error: { code: "INVALID_PREF", message: "页边距无效" } },
        400,
      );
    }
    pageMargin = body.pageMargin;
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO user_preferences
       (user_id, theme, font_size, line_height, page_margin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       theme = excluded.theme,
       font_size = excluded.font_size,
       line_height = excluded.line_height,
       page_margin = excluded.page_margin,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, theme, fontSize, lineHeight, pageMargin, now)
    .run();

  const prefs: UserPreferences = {
    theme,
    fontSize,
    lineHeight,
    pageMargin,
  };
  return c.json(prefs);
});
