import { Hono } from "hono";
import type { ReadingProgress } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

export const progressRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

progressRoutes.use("*", authMiddleware);

/** GET /api/progress/:bookId */
progressRoutes.get("/:bookId", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("bookId");

  const book = await c.env.DB.prepare(
    `SELECT id FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }

  const row = await c.env.DB.prepare(
    `SELECT chapter_index, char_offset, page_in_chapter, updated_at
     FROM reading_progress WHERE user_id = ? AND book_id = ?`,
  )
    .bind(userId, bookId)
    .first<{
      chapter_index: number;
      char_offset: number;
      page_in_chapter: number | null;
      updated_at: number;
    }>();

  const progress: ReadingProgress = row
    ? {
        bookId,
        chapterIndex: row.chapter_index,
        charOffset: row.char_offset,
        pageInChapter: row.page_in_chapter,
        updatedAt: row.updated_at,
      }
    : {
        bookId,
        chapterIndex: 0,
        charOffset: 0,
        pageInChapter: 0,
        updatedAt: 0,
      };

  return c.json(progress);
});

/** PUT /api/progress/:bookId */
progressRoutes.put("/:bookId", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("bookId");

  let body: {
    chapterIndex?: unknown;
    charOffset?: unknown;
    pageInChapter?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体无效" } },
      400,
    );
  }

  const chapterIndex = body.chapterIndex;
  const charOffset = body.charOffset;
  if (
    typeof chapterIndex !== "number" ||
    !Number.isInteger(chapterIndex) ||
    chapterIndex < 0 ||
    typeof charOffset !== "number" ||
    !Number.isInteger(charOffset) ||
    charOffset < 0
  ) {
    return c.json(
      {
        error: {
          code: "INVALID_PROGRESS",
          message: "chapterIndex 与 charOffset 须为非负整数",
        },
      },
      400,
    );
  }

  let pageInChapter: number | null = null;
  if (body.pageInChapter != null) {
    if (
      typeof body.pageInChapter !== "number" ||
      !Number.isInteger(body.pageInChapter) ||
      body.pageInChapter < 0
    ) {
      return c.json(
        {
          error: { code: "INVALID_PROGRESS", message: "pageInChapter 无效" },
        },
        400,
      );
    }
    pageInChapter = body.pageInChapter;
  }

  const book = await c.env.DB.prepare(
    `SELECT id FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO reading_progress
       (user_id, book_id, chapter_index, char_offset, page_in_chapter, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, book_id) DO UPDATE SET
       chapter_index = excluded.chapter_index,
       char_offset = excluded.char_offset,
       page_in_chapter = excluded.page_in_chapter,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, bookId, chapterIndex, charOffset, pageInChapter, now)
    .run();

  // 轻触书籍 updated_at，便于书架排序
  await c.env.DB.prepare(`UPDATE books SET updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(now, bookId, userId)
    .run();

  const progress: ReadingProgress = {
    bookId,
    chapterIndex,
    charOffset,
    pageInChapter,
    updatedAt: now,
  };
  return c.json(progress);
});
