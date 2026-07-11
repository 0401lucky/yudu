import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_FORMATS,
  type BookFormat,
  type BookSummary,
} from "@yudu/shared";
import type { Env } from "../env";
import { parseTxt } from "../parsers/txt";
import { parseMd } from "../parsers/md";
import { parseEpub } from "../parsers/epub";
import type { ParseResult } from "../parsers/types";
import { generateCoverSvg } from "./cover";
import { deletePrefix, putBytes, putText, r2Key } from "./storage";

export class ImportValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImportValidationError";
    this.code = code;
  }
}

/**
 * 导入书籍：校验 → processing → 源文件 → 解析 → 章节 R2 → 封面 → ready。
 * 解析失败时标记 failed 并仍返回 BookSummary（不抛）。
 * 校验失败（扩展名/大小）抛 ImportValidationError。
 */
export async function importBook(
  env: Env,
  userId: string,
  file: { name: string; bytes: Uint8Array },
): Promise<BookSummary> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new ImportValidationError(
      "UNSUPPORTED_FORMAT",
      "仅支持 txt、md、epub 格式",
    );
  }
  if (format === "pdf") {
    throw new ImportValidationError(
      "UNSUPPORTED_FORMAT",
      "PDF 暂不支持",
    );
  }
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImportValidationError(
      "FILE_TOO_LARGE",
      `文件超过上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
    );
  }
  if (file.bytes.byteLength === 0) {
    throw new ImportValidationError("EMPTY_FILE", "文件为空");
  }

  const bookId = crypto.randomUUID();
  const now = Date.now();
  const sourceKey = r2Key.source(userId, bookId, file.name);
  const fallbackTitle = titleFromFilename(file.name);

  await env.DB.prepare(
    `INSERT INTO books (
       id, user_id, title, author, format, cover_r2_key, source_r2_key,
       status, error_message, chapter_count, created_at, updated_at
     ) VALUES (?, ?, ?, NULL, ?, NULL, ?, 'processing', NULL, 0, ?, ?)`,
  )
    .bind(bookId, userId, fallbackTitle, format, sourceKey, now, now)
    .run();

  try {
    await putBytes(
      env.BOOKS_BUCKET,
      sourceKey,
      file.bytes,
      contentTypeForFormat(format),
    );

    const parsed = await parseByFormat(format, file.bytes, file.name);
    const title = (parsed.title || fallbackTitle).trim() || fallbackTitle;
    const author = parsed.author?.trim() || null;

    if (!parsed.chapters.length) {
      throw new Error("未解析到任何章节");
    }

    const chapterInserts: D1PreparedStatement[] = [];
    for (let i = 0; i < parsed.chapters.length; i++) {
      const ch = parsed.chapters[i];
      const key = r2Key.chapter(userId, bookId, i);
      const payload = JSON.stringify({ title: ch.title, text: ch.text });
      await putText(env.BOOKS_BUCKET, key, payload);

      const chapterId = crypto.randomUUID();
      chapterInserts.push(
        env.DB.prepare(
          `INSERT INTO chapters (id, book_id, idx, title, r2_key, char_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          chapterId,
          bookId,
          i,
          ch.title,
          key,
          ch.text.length,
        ),
      );
    }

    // 封面：epub 自带优先，否则生成 SVG
    const coverKey = r2Key.cover(userId, bookId);
    if (parsed.cover?.bytes?.byteLength) {
      await putBytes(
        env.BOOKS_BUCKET,
        coverKey,
        parsed.cover.bytes,
        parsed.cover.contentType || "application/octet-stream",
      );
    } else {
      const svg = generateCoverSvg(title, author);
      await putBytes(
        env.BOOKS_BUCKET,
        coverKey,
        svg,
        "image/svg+xml; charset=utf-8",
      );
    }

    const readyAt = Date.now();
    await env.DB.batch([
      ...chapterInserts,
      env.DB.prepare(
        `UPDATE books SET
           title = ?, author = ?, cover_r2_key = ?,
           status = 'ready', error_message = NULL,
           chapter_count = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      ).bind(
        title,
        author,
        coverKey,
        parsed.chapters.length,
        readyAt,
        bookId,
        userId,
      ),
    ]);

    return {
      id: bookId,
      title,
      author,
      format,
      coverUrl: `/api/books/${bookId}/cover`,
      status: "ready",
      errorMessage: null,
      chapterCount: parsed.chapters.length,
      progressPercent: null,
      updatedAt: readyAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedAt = Date.now();
    try {
      await env.DB.prepare(
        `UPDATE books SET status = 'failed', error_message = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
        .bind(message.slice(0, 500), failedAt, bookId, userId)
        .run();
    } catch {
      // 标记失败也失败时仍返回 best-effort 摘要
    }

    return {
      id: bookId,
      title: fallbackTitle,
      author: null,
      format,
      coverUrl: null,
      status: "failed",
      errorMessage: message.slice(0, 500),
      chapterCount: 0,
      progressPercent: null,
      updatedAt: failedAt,
    };
  }
}

/** 删除书籍：R2 前缀 + D1（chapters/progress 依赖 cascade） */
export async function deleteBook(
  env: Env,
  userId: string,
  bookId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string }>();

  if (!row) return false;

  await deletePrefix(env.BOOKS_BUCKET, r2Key.bookPrefix(userId, bookId));
  await env.DB.prepare(`DELETE FROM books WHERE id = ? AND user_id = ?`)
    .bind(bookId, userId)
    .run();
  return true;
}

function detectFormat(filename: string): BookFormat | null {
  const base = filename.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  if (ext === "pdf") return "pdf";
  if ((SUPPORTED_FORMATS as readonly string[]).includes(ext)) {
    return ext as BookFormat;
  }
  // markdown 常见别名
  if (ext === "markdown") return "md";
  return null;
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) || base || "未命名";
}

function contentTypeForFormat(format: Exclude<BookFormat, "pdf">): string {
  switch (format) {
    case "txt":
      return "text/plain; charset=utf-8";
    case "md":
      return "text/markdown; charset=utf-8";
    case "epub":
      return "application/epub+zip";
  }
}

async function parseByFormat(
  format: Exclude<BookFormat, "pdf">,
  bytes: Uint8Array,
  filename: string,
): Promise<ParseResult> {
  switch (format) {
    case "txt":
      return parseTxt(bytes, filename);
    case "md":
      return parseMd(bytes, filename);
    case "epub":
      return parseEpub(bytes, filename);
  }
}
