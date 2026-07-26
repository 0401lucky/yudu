import { Hono } from "hono";
import {
  HIGHLIGHT_COLORS,
  MAX_HIGHLIGHT_CHARS,
  MAX_HIGHLIGHT_EXCERPT_CHARS,
  MAX_HIGHLIGHTS_PER_BOOK,
  type HighlightColor,
  type HighlightDto,
} from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

type HighlightRow = {
  id: string;
  chapter_index: number;
  start_offset: number;
  end_offset: number;
  color: string;
  excerpt: string;
  created_at: number;
};

export const highlightsRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

highlightsRoutes.use("*", authMiddleware);

function rowToDto(row: HighlightRow): HighlightDto {
  return {
    id: row.id,
    chapterIndex: row.chapter_index,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    color: row.color as HighlightColor,
    excerpt: row.excerpt,
    createdAt: row.created_at,
  };
}

/** 书籍归属校验：非本人书视同不存在 */
async function findOwnedBook(
  db: D1Database,
  bookId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM books WHERE id = ? AND user_id = ?`)
    .bind(bookId, userId)
    .first<{ id: string }>();
  return row != null;
}

const bookNotFoundBody = {
  error: { code: "NOT_FOUND" as const, message: "书籍不存在" },
};

const invalidHighlight = (message: string) => ({
  error: { code: "INVALID_HIGHLIGHT" as const, message },
});

function isColor(value: unknown): value is HighlightColor {
  return (
    typeof value === "string" &&
    (HIGHLIGHT_COLORS as readonly string[]).includes(value)
  );
}

/** 按锚点查已有高亮（UNIQUE 幂等用） */
async function findByAnchor(
  db: D1Database,
  userId: string,
  bookId: string,
  chapterIndex: number,
  startOffset: number,
  endOffset: number,
): Promise<HighlightRow | null> {
  return db
    .prepare(
      `SELECT id, chapter_index, start_offset, end_offset, color, excerpt, created_at
       FROM highlights
       WHERE user_id = ? AND book_id = ? AND chapter_index = ?
         AND start_offset = ? AND end_offset = ?`,
    )
    .bind(userId, bookId, chapterIndex, startOffset, endOffset)
    .first<HighlightRow>();
}

/** GET /api/books/:id/highlights — 按章序 + 起点排序 */
highlightsRoutes.get("/:id/highlights", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, chapter_index, start_offset, end_offset, color, excerpt, created_at
     FROM highlights
     WHERE user_id = ? AND book_id = ?
     ORDER BY chapter_index ASC, start_offset ASC`,
  )
    .bind(userId, bookId)
    .all<HighlightRow>();

  return c.json((results ?? []).map(rowToDto));
});

/** POST /api/books/:id/highlights — 创建；同锚点重复添加幂等返回已有记录 */
highlightsRoutes.post("/:id/highlights", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  let body: {
    chapterIndex?: unknown;
    startOffset?: unknown;
    endOffset?: unknown;
    color?: unknown;
    excerpt?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }

  const { chapterIndex, startOffset, endOffset } = body;
  if (
    typeof chapterIndex !== "number" ||
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 0 ||
    typeof startOffset !== "number" ||
    !Number.isInteger(startOffset) ||
    startOffset < 0 ||
    typeof endOffset !== "number" ||
    !Number.isInteger(endOffset) ||
    endOffset < 0
  ) {
    return c.json(
      invalidHighlight("chapterIndex、startOffset、endOffset 须为非负整数"),
      400,
    );
  }
  if (endOffset <= startOffset) {
    return c.json(invalidHighlight("endOffset 须大于 startOffset"), 400);
  }
  if (endOffset - startOffset > MAX_HIGHLIGHT_CHARS) {
    return c.json(
      invalidHighlight(`单条高亮最长 ${MAX_HIGHLIGHT_CHARS} 个字符`),
      400,
    );
  }
  if (!isColor(body.color)) {
    return c.json(invalidHighlight("color 不在支持范围内"), 400);
  }
  if (typeof body.excerpt !== "string") {
    return c.json(invalidHighlight("excerpt 须为字符串"), 400);
  }
  // 摘录仅列表展示用：超长截断存储，不作为拒绝理由
  const excerpt = body.excerpt.trim().slice(0, MAX_HIGHLIGHT_EXCERPT_CHARS);

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  // 幂等：同锚点已存在直接返回已有记录
  const existing = await findByAnchor(
    c.env.DB,
    userId,
    bookId,
    chapterIndex,
    startOffset,
    endOffset,
  );
  if (existing) {
    return c.json(rowToDto(existing), 200);
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM highlights WHERE user_id = ? AND book_id = ?`,
  )
    .bind(userId, bookId)
    .first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_HIGHLIGHTS_PER_BOOK) {
    return c.json(
      {
        error: {
          code: "HIGHLIGHT_LIMIT",
          message: `单本书最多 ${MAX_HIGHLIGHTS_PER_BOOK} 条高亮`,
        },
      },
      400,
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO highlights
         (id, user_id, book_id, chapter_index, start_offset, end_offset, color, excerpt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        bookId,
        chapterIndex,
        startOffset,
        endOffset,
        body.color,
        excerpt,
        now,
      )
      .run();
  } catch (err) {
    // 并发写入触发 UNIQUE 冲突：按幂等语义返回已有记录
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      const row = await findByAnchor(
        c.env.DB,
        userId,
        bookId,
        chapterIndex,
        startOffset,
        endOffset,
      );
      if (row) {
        return c.json(rowToDto(row), 200);
      }
    }
    throw err;
  }

  const dto: HighlightDto = {
    id,
    chapterIndex,
    startOffset,
    endOffset,
    color: body.color,
    excerpt,
    createdAt: now,
  };
  return c.json(dto, 201);
});

/** PATCH /api/books/:id/highlights/:highlightId — 改色 */
highlightsRoutes.patch("/:id/highlights/:highlightId", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  const highlightId = c.req.param("highlightId");

  let body: { color?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }
  if (!isColor(body.color)) {
    return c.json(invalidHighlight("color 不在支持范围内"), 400);
  }

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  const row = await c.env.DB.prepare(
    `SELECT id, chapter_index, start_offset, end_offset, color, excerpt, created_at
     FROM highlights
     WHERE id = ? AND user_id = ? AND book_id = ?`,
  )
    .bind(highlightId, userId, bookId)
    .first<HighlightRow>();
  if (!row) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "高亮不存在" } },
      404,
    );
  }

  await c.env.DB.prepare(
    `UPDATE highlights SET color = ? WHERE id = ? AND user_id = ? AND book_id = ?`,
  )
    .bind(body.color, highlightId, userId, bookId)
    .run();

  return c.json(rowToDto({ ...row, color: body.color }));
});

/** DELETE /api/books/:id/highlights/:highlightId */
highlightsRoutes.delete("/:id/highlights/:highlightId", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  const highlightId = c.req.param("highlightId");

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  const res = await c.env.DB.prepare(
    `DELETE FROM highlights WHERE id = ? AND user_id = ? AND book_id = ?`,
  )
    .bind(highlightId, userId, bookId)
    .run();

  if (!res.meta.changes) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "高亮不存在" } },
      404,
    );
  }

  return c.body(null, 204);
});
