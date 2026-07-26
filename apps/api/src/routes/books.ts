import { Hono } from "hono";
import { MAX_BOOK_GROUP_CHARS } from "@yudu/shared";
import type {
  BookDetail,
  BookSummary,
  ChapterContent,
  ChapterMeta,
} from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import {
  deleteBook,
  importBooksBatch,
  ImportValidationError,
  reparseBook,
  ReparseError,
  type UploadFile,
} from "../services/importBook";
import { getObject, getText } from "../services/storage";

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  format: string;
  cover_r2_key: string | null;
  status: string;
  error_message: string | null;
  chapter_count: number;
  updated_at: number;
  created_at: number;
  group_name: string | null;
  // progress join（可选）
  chapter_index: number | null;
  char_offset: number | null;
  progress_char_count: number | null;
  last_read_at: number | null;
};

type ChapterRow = {
  idx: number;
  title: string;
  char_count: number;
  r2_key: string;
};

export const booksRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

booksRoutes.use("*", authMiddleware);

/**
 * POST /api/books/import — multipart
 * - 单文件：字段 `file`
 * - 多文件：字段 `files`（可多个）或重复的 `file`
 * 同批内「书名-序号」自动合并为一本书。
 * 响应：始终为 BookSummary[]（单文件也是长度 1 的数组）。
 *
 * 注意：不要用 parseBody({ all: true })，在 wrangler/miniflare 下会抛错。
 */
booksRoutes.post("/import", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "无法解析 multipart 请求" } },
      400,
    );
  }

  const collected = collectUploadFilesFromFormData(form);
  if (!collected.length) {
    return c.json(
      {
        error: {
          code: "MISSING_FILE",
          message: "请上传文件（字段 file 或 files）",
        },
      },
      400,
    );
  }

  const userId = c.get("userId");

  try {
    const uploads: UploadFile[] = [];
    for (const f of collected) {
      uploads.push({
        name: f.name || "upload.bin",
        bytes: new Uint8Array(await f.arrayBuffer()),
      });
    }

    const summaries = await importBooksBatch(c.env, userId, uploads);

    const allReady = summaries.every((s) => s.status === "ready");
    return c.json(summaries, allReady ? 201 : 200);
  } catch (err) {
    if (err instanceof ImportValidationError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        400,
      );
    }
    throw err;
  }
});

/** 从 FormData 收集 file / files 字段（兼容单文件与多文件） */
function collectUploadFilesFromFormData(form: FormData): File[] {
  const out: File[] = [];
  for (const key of ["files", "file"] as const) {
    // getAll 在 Workers 上对重复字段更可靠
    const values = form.getAll(key);
    for (const v of values) {
      if (isUploadFile(v)) out.push(v);
    }
  }
  return out;
}

function isUploadFile(v: unknown): v is File {
  if (v == null || typeof v === "string") return false;
  // 不用 instanceof File：跨 realm 可能失败；Blob + name 即可
  return (
    typeof Blob !== "undefined" &&
    v instanceof Blob &&
    typeof (v as File).name === "string" &&
    typeof (v as Blob).arrayBuffer === "function"
  );
}

/** 书架摘要查询公共部分（列表与 PATCH 分组后复用同一 join 口径） */
const SUMMARY_SELECT = `SELECT
   b.id, b.title, b.author, b.format, b.cover_r2_key, b.status,
   b.error_message, b.chapter_count, b.updated_at, b.created_at, b.group_name,
   p.chapter_index, p.char_offset, p.updated_at AS last_read_at,
   ch.char_count AS progress_char_count
 FROM books b
 LEFT JOIN reading_progress p
   ON p.book_id = b.id AND p.user_id = b.user_id
 LEFT JOIN chapters ch
   ON ch.book_id = b.id AND ch.idx = p.chapter_index`;

/** GET /api/books — 书架列表 */
booksRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const { results } = await c.env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.user_id = ?
     ORDER BY b.updated_at DESC`,
  )
    .bind(userId)
    .all<BookRow>();

  const list: BookSummary[] = (results ?? []).map(rowToSummary);
  return c.json(list);
});

/**
 * PATCH /api/books/:id — 更新书籍分组
 * body: `{ group: string | null }`；trim 后 1–30 字符，null / 空串 = 移出分组。
 */
booksRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: "INVALID_BODY", message: "请求体不是合法 JSON" } },
      400,
    );
  }

  if (body == null || typeof body !== "object" || !("group" in body)) {
    return c.json(
      { error: { code: "INVALID_GROUP", message: "缺少 group 字段" } },
      400,
    );
  }
  const raw = (body as { group: unknown }).group;
  let group: string | null;
  if (raw == null) {
    group = null;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length > MAX_BOOK_GROUP_CHARS) {
      return c.json(
        {
          error: {
            code: "INVALID_GROUP",
            message: `分组名不能超过 ${MAX_BOOK_GROUP_CHARS} 个字符`,
          },
        },
        400,
      );
    }
    group = trimmed || null; // 空串 = 移出分组
  } else {
    return c.json(
      { error: { code: "INVALID_GROUP", message: "group 必须是字符串或 null" } },
      400,
    );
  }

  const result = await c.env.DB.prepare(
    `UPDATE books SET group_name = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(group, bookId, userId)
    .run();

  if (!result.meta.changes) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }

  const row = await c.env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.id = ? AND b.user_id = ?`,
  )
    .bind(bookId, userId)
    .first<BookRow>();

  if (!row) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }
  return c.json(rowToSummary(row));
});

/** GET /api/books/:id — 元数据 + 目录 */
booksRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  const book = await c.env.DB.prepare(
    `SELECT id, title, author, format, status, chapter_count
     FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{
      id: string;
      title: string;
      author: string | null;
      format: string;
      status: string;
      chapter_count: number;
    }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }

  const { results } = await c.env.DB.prepare(
    `SELECT idx, title, char_count FROM chapters
     WHERE book_id = ? ORDER BY idx ASC`,
  )
    .bind(bookId)
    .all<ChapterRow>();

  const chapters: ChapterMeta[] = (results ?? []).map((ch) => ({
    index: ch.idx,
    title: ch.title,
    charCount: ch.char_count,
  }));

  const detail: BookDetail = {
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format as BookDetail["format"],
    status: book.status as BookDetail["status"],
    chapters,
  };
  return c.json(detail);
});

/** DELETE /api/books/:id */
booksRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  const ok = await deleteBook(c.env, userId, bookId);
  if (!ok) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }
  return c.body(null, 204);
});

/**
 * POST /api/books/:id/reparse
 * 从 R2 源文件重新解析 Markdown 书；失败保留旧章节。
 */
booksRoutes.post("/:id/reparse", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  try {
    const summary = await reparseBook(c.env, userId, bookId);
    return c.json(summary);
  } catch (err) {
    if (err instanceof ReparseError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status,
      );
    }
    throw err;
  }
});

/** GET /api/books/:id/chapters/:idx */
booksRoutes.get("/:id/chapters/:idx", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");
  const idxStr = c.req.param("idx");
  const idx = Number.parseInt(idxStr, 10);
  if (!Number.isInteger(idx) || idx < 0) {
    return c.json(
      { error: { code: "INVALID_INDEX", message: "章节序号无效" } },
      400,
    );
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

  const chapter = await c.env.DB.prepare(
    `SELECT idx, title, r2_key FROM chapters WHERE book_id = ? AND idx = ?`,
  )
    .bind(bookId, idx)
    .first<ChapterRow>();

  if (!chapter) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "章节不存在" } },
      404,
    );
  }

  const raw = await getText(c.env.BOOKS_BUCKET, chapter.r2_key);
  if (raw == null) {
    return c.json(
      { error: { code: "STORAGE_MISSING", message: "章节正文缺失" } },
      404,
    );
  }

  let parsed: { title?: string; text?: string };
  try {
    parsed = JSON.parse(raw) as { title?: string; text?: string };
  } catch {
    return c.json(
      { error: { code: "STORAGE_CORRUPT", message: "章节正文损坏" } },
      500,
    );
  }

  const content: ChapterContent = {
    index: chapter.idx,
    title: typeof parsed.title === "string" ? parsed.title : chapter.title,
    text: typeof parsed.text === "string" ? parsed.text : "",
  };

  c.header("Cache-Control", "private, max-age=300");
  return c.json(content);
});

/** GET /api/books/:id/cover — 鉴权后流式返回封面 */
booksRoutes.get("/:id/cover", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  const book = await c.env.DB.prepare(
    `SELECT cover_r2_key FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ cover_r2_key: string | null }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }
  if (!book.cover_r2_key) {
    return c.json(
      { error: { code: "NO_COVER", message: "暂无封面" } },
      404,
    );
  }

  const obj = await getObject(c.env.BOOKS_BUCKET, book.cover_r2_key);
  if (!obj) {
    return c.json(
      { error: { code: "STORAGE_MISSING", message: "封面文件缺失" } },
      404,
    );
  }

  const contentType =
    obj.httpMetadata?.contentType || "application/octet-stream";
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(obj.body, 200);
});

/**
 * GET /api/books/:id/source — 鉴权后流式返回 PDF 原始文件（供前端 pdf.js 渲染）。
 * 仅对 format='pdf' 开放，避免变成任意源文件下载口。
 */
booksRoutes.get("/:id/source", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  const book = await c.env.DB.prepare(
    `SELECT format, source_r2_key FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ format: string; source_r2_key: string | null }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }
  if (book.format !== "pdf" || !book.source_r2_key) {
    return c.json(
      { error: { code: "NO_SOURCE", message: "该书籍没有可读取的源文件" } },
      404,
    );
  }

  const obj = await getObject(c.env.BOOKS_BUCKET, book.source_r2_key);
  if (!obj) {
    return c.json(
      { error: { code: "STORAGE_MISSING", message: "源文件缺失" } },
      404,
    );
  }

  c.header("Content-Type", "application/pdf");
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(obj.body, 200);
});

function rowToSummary(row: BookRow): BookSummary {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format as BookSummary["format"],
    coverUrl: row.cover_r2_key ? `/api/books/${row.id}/cover` : null,
    status: row.status as BookSummary["status"],
    errorMessage: row.error_message,
    chapterCount: row.chapter_count,
    progressPercent: calcProgressPercent(
      row.chapter_count,
      row.chapter_index,
      row.char_offset,
      row.progress_char_count,
    ),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    lastReadAt: row.last_read_at,
    group: row.group_name,
  };
}

/**
 * ((chapterIndex + charOffset / max(charCount,1)) / chapterCount) * 100
 * 导出供年度报告复用同一口径判定「读完」（≥98%）。
 */
export function calcProgressPercent(
  chapterCount: number,
  chapterIndex: number | null,
  charOffset: number | null,
  charCount: number | null,
): number | null {
  if (
    chapterCount <= 0 ||
    chapterIndex == null ||
    charOffset == null ||
    !Number.isFinite(chapterIndex) ||
    !Number.isFinite(charOffset)
  ) {
    return null;
  }
  const denom = Math.max(charCount ?? 1, 1);
  const raw =
    ((chapterIndex + charOffset / denom) / chapterCount) * 100;
  return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}
