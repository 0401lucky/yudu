import { Hono } from "hono";
import { MAX_BOOKMARK_LABEL_CHARS, type BookmarkDto } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";

/** 单书书签上限 */
const MAX_BOOKMARKS_PER_BOOK = 200;

type BookmarkRow = {
  id: string;
  chapter_index: number;
  char_offset: number;
  label: string;
  created_at: number;
};

export const bookmarksRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

bookmarksRoutes.use("*", authMiddleware);

function rowToDto(row: BookmarkRow): BookmarkDto {
  return {
    id: row.id,
    chapterIndex: row.chapter_index,
    charOffset: row.char_offset,
    label: row.label,
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

/** 按锚点查已有书签（UNIQUE 幂等用） */
async function findByAnchor(
  db: D1Database,
  userId: string,
  bookId: string,
  chapterIndex: number,
  charOffset: number,
): Promise<BookmarkRow | null> {
  return db
    .prepare(
      `SELECT id, chapter_index, char_offset, label, created_at
       FROM bookmarks
       WHERE user_id = ? AND book_id = ? AND chapter_index = ? AND char_offset = ?`,
    )
    .bind(userId, bookId, chapterIndex, charOffset)
    .first<BookmarkRow>();
}

/** GET /api/books/:id/bookmarks — 按章序 + 偏移排序 */
bookmarksRoutes.get("/:id/bookmarks", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, chapter_index, char_offset, label, created_at
     FROM bookmarks
     WHERE user_id = ? AND book_id = ?
     ORDER BY chapter_index ASC, char_offset ASC`,
  )
    .bind(userId, bookId)
    .all<BookmarkRow>();

  return c.json((results ?? []).map(rowToDto));
});

/** POST /api/books/:id/bookmarks — 创建；同锚点重复添加幂等返回已有记录 */
bookmarksRoutes.post("/:id/bookmarks", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  let body: {
    chapterIndex?: unknown;
    charOffset?: unknown;
    label?: unknown;
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
          code: "INVALID_BOOKMARK",
          message: "chapterIndex 与 charOffset 须为非负整数",
        },
      },
      400,
    );
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > MAX_BOOKMARK_LABEL_CHARS) {
    return c.json(
      {
        error: {
          code: "INVALID_BOOKMARK",
          message: `label 须为 1-${MAX_BOOKMARK_LABEL_CHARS} 个字符`,
        },
      },
      400,
    );
  }

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  // 幂等：同锚点已存在直接返回已有记录（也覆盖旧书签重复迁移场景）
  const existing = await findByAnchor(
    c.env.DB,
    userId,
    bookId,
    chapterIndex,
    charOffset,
  );
  if (existing) {
    return c.json(rowToDto(existing), 200);
  }

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM bookmarks WHERE user_id = ? AND book_id = ?`,
  )
    .bind(userId, bookId)
    .first<{ cnt: number }>();
  if ((countRow?.cnt ?? 0) >= MAX_BOOKMARKS_PER_BOOK) {
    return c.json(
      {
        error: {
          code: "BOOKMARK_LIMIT",
          message: `单本书最多 ${MAX_BOOKMARKS_PER_BOOK} 个书签`,
        },
      },
      400,
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO bookmarks
         (id, user_id, book_id, chapter_index, char_offset, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, userId, bookId, chapterIndex, charOffset, label, now)
      .run();
  } catch (err) {
    // 并发写入触发 UNIQUE 冲突：按幂等语义返回已有记录
    if (err instanceof Error && err.message.includes("UNIQUE")) {
      const row = await findByAnchor(
        c.env.DB,
        userId,
        bookId,
        chapterIndex,
        charOffset,
      );
      if (row) {
        return c.json(rowToDto(row), 200);
      }
    }
    throw err;
  }

  const dto: BookmarkDto = {
    id,
    chapterIndex,
    charOffset,
    label,
    createdAt: now,
  };
  return c.json(dto, 201);
});

/** DELETE /api/books/:id/bookmarks/:bookmarkId */
bookmarksRoutes.delete("/:id/bookmarks/:bookmarkId", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  const bookmarkId = c.req.param("bookmarkId");

  if (!(await findOwnedBook(c.env.DB, bookId, userId))) {
    return c.json(bookNotFoundBody, 404);
  }

  const res = await c.env.DB.prepare(
    `DELETE FROM bookmarks WHERE id = ? AND user_id = ? AND book_id = ?`,
  )
    .bind(bookmarkId, userId, bookId)
    .run();

  if (!res.meta.changes) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书签不存在" } },
      404,
    );
  }

  return c.body(null, 204);
});
