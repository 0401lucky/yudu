import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_FORMATS,
  compareBySequence,
  parseFilenameSeries,
  seriesGroupKey,
  type BookFormat,
  type BookSummary,
} from "@yudu/shared";
import type { Env } from "../env";
import { parseTxt } from "../parsers/txt";
import { parseMd } from "../parsers/md";
import { parseEpub } from "../parsers/epub";
import type { ParseResult, ParsedChapter } from "../parsers/types";
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

export type UploadFile = { name: string; bytes: Uint8Array };

/**
 * 单文件导入（兼容旧接口）。
 * 若文件名匹配「书名-序号」，书名用系列名。
 */
export async function importBook(
  env: Env,
  userId: string,
  file: UploadFile,
): Promise<BookSummary> {
  const results = await importBooksBatch(env, userId, [file]);
  return results[0]!;
}

/**
 * 批量导入：按「书名-序号」自动合并为同一本书；独立文件各自成书。
 */
export async function importBooksBatch(
  env: Env,
  userId: string,
  files: UploadFile[],
): Promise<BookSummary[]> {
  if (!files.length) {
    throw new ImportValidationError("MISSING_FILE", "请至少上传一个文件");
  }

  // 校验全部文件
  const validated: { file: UploadFile; format: Exclude<BookFormat, "pdf"> }[] =
    [];
  for (const file of files) {
    const format = detectFormat(file.name);
    if (!format || format === "pdf") {
      throw new ImportValidationError(
        "UNSUPPORTED_FORMAT",
        `不支持的文件：${file.name}（仅 txt、md、epub）`,
      );
    }
    if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new ImportValidationError(
        "FILE_TOO_LARGE",
        `${file.name} 超过上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
      );
    }
    if (file.bytes.byteLength === 0) {
      throw new ImportValidationError("EMPTY_FILE", `${file.name} 为空`);
    }
    validated.push({ file, format });
  }

  // 分组
  type Group = {
    seriesTitle: string;
    isSequenced: boolean;
    items: { file: UploadFile; format: Exclude<BookFormat, "pdf"> }[];
  };
  const groups = new Map<string, Group>();

  for (const item of validated) {
    const gk = seriesGroupKey(item.file.name);
    let g = groups.get(gk.key);
    if (!g) {
      g = {
        seriesTitle: gk.seriesTitle,
        isSequenced: gk.isSequenced,
        items: [],
      };
      groups.set(gk.key, g);
    }
    g.items.push(item);
  }

  // 每组内排序
  for (const g of groups.values()) {
    g.items.sort((a, b) => compareBySequence(a.file.name, b.file.name));
  }

  const summaries: BookSummary[] = [];
  for (const g of groups.values()) {
    summaries.push(await createBookFromGroup(env, userId, g));
  }
  return summaries;
}

async function createBookFromGroup(
  env: Env,
  userId: string,
  group: {
    seriesTitle: string;
    isSequenced: boolean;
    items: { file: UploadFile; format: Exclude<BookFormat, "pdf"> }[];
  },
): Promise<BookSummary> {
  const bookId = crypto.randomUUID();
  const now = Date.now();
  // 格式：同组优先取第一文件；混合格式时仍允许，以第一为准写入 format 字段
  const primaryFormat = group.items[0]!.format;
  const primaryName = group.items[0]!.file.name;
  const sourceKey = r2Key.source(userId, bookId, primaryName);
  const bookTitle = group.seriesTitle;

  await env.DB.prepare(
    `INSERT INTO books (
       id, user_id, title, author, format, cover_r2_key, source_r2_key,
       status, error_message, chapter_count, created_at, updated_at
     ) VALUES (?, ?, ?, NULL, ?, NULL, ?, 'processing', NULL, 0, ?, ?)`,
  )
    .bind(bookId, userId, bookTitle, primaryFormat, sourceKey, now, now)
    .run();

  try {
    // 存第一个源文件；其余章节文件也按索引存
    for (let fi = 0; fi < group.items.length; fi++) {
      const { file, format } = group.items[fi]!;
      const key =
        fi === 0
          ? sourceKey
          : r2Key.source(userId, bookId, `part-${fi}-${file.name}`);
      await putBytes(
        env.BOOKS_BUCKET,
        key,
        file.bytes,
        contentTypeForFormat(format),
      );
    }

    const allChapters: ParsedChapter[] = [];
    let author: string | null = null;
    let cover: ParseResult["cover"] | undefined;

    for (const { file, format } of group.items) {
      const parsed = await parseByFormat(format, file.bytes, file.name);
      if (parsed.author?.trim() && !author) {
        author = parsed.author.trim();
      }
      if (parsed.cover?.bytes?.byteLength && !cover) {
        cover = parsed.cover;
      }

      const parts = parseFilenameSeries(file.name);
      // 多文件合并时：每个文件的章节依次追加
      // 若该文件只有一章且标题像文件名，优先用正文标题或「第 N 章」
      const chapters = normalizeChaptersForMerge(
        parsed.chapters,
        parts,
        group.isSequenced && group.items.length > 1,
      );
      allChapters.push(...chapters);
    }

    if (!allChapters.length) {
      throw new Error("未解析到任何章节");
    }

    const chapterInserts: D1PreparedStatement[] = [];
    for (let i = 0; i < allChapters.length; i++) {
      const ch = allChapters[i]!;
      const key = r2Key.chapter(userId, bookId, i);
      const payload = JSON.stringify({ title: ch.title, text: ch.text });
      await putText(env.BOOKS_BUCKET, key, payload);

      chapterInserts.push(
        env.DB.prepare(
          `INSERT INTO chapters (id, book_id, idx, title, r2_key, char_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          bookId,
          i,
          ch.title,
          key,
          ch.text.length,
        ),
      );
    }

    const coverKey = r2Key.cover(userId, bookId);
    if (cover?.bytes?.byteLength) {
      await putBytes(
        env.BOOKS_BUCKET,
        coverKey,
        cover.bytes,
        cover.contentType || "application/octet-stream",
      );
    } else {
      const svg = generateCoverSvg(bookTitle, author);
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
        bookTitle,
        author,
        coverKey,
        allChapters.length,
        readyAt,
        bookId,
        userId,
      ),
    ]);

    return {
      id: bookId,
      title: bookTitle,
      author,
      format: primaryFormat,
      coverUrl: `/api/books/${bookId}/cover`,
      status: "ready",
      errorMessage: null,
      chapterCount: allChapters.length,
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
      // ignore
    }

    return {
      id: bookId,
      title: bookTitle,
      author: null,
      format: primaryFormat,
      coverUrl: null,
      status: "failed",
      errorMessage: message.slice(0, 500),
      chapterCount: 0,
      progressPercent: null,
      updatedAt: failedAt,
    };
  }
}

/**
 * 合并时润色章节标题：单章且标题≈文件名时，改用「第 N 章」或系列内序号。
 */
function normalizeChaptersForMerge(
  chapters: ParsedChapter[],
  parts: ReturnType<typeof parseFilenameSeries>,
  multiFileSeries: boolean,
): ParsedChapter[] {
  if (!chapters.length) return chapters;

  if (chapters.length === 1 && multiFileSeries) {
    const only = chapters[0]!;
    const stem = parts.basename.replace(/\.[^.]+$/, "");
    const titleLooksLikeFile =
      only.title === stem ||
      only.title === parts.seriesTitle ||
      only.title === parts.basename;
    if (titleLooksLikeFile && parts.sequence != null) {
      return [
        {
          title: `第 ${parts.sequence} 章`,
          text: only.text,
        },
      ];
    }
  }

  // 单文件但带序号：书名已是系列名；若只有一章且标题是「雨停之前-01」类，尝试保留正文内标题
  if (chapters.length === 1 && parts.isSequenced && !multiFileSeries) {
    const only = chapters[0]!;
    const stem = parts.basename.replace(/\.[^.]+$/, "");
    if (only.title === stem && parts.sequence != null) {
      return [{ title: `第 ${parts.sequence} 章`, text: only.text }];
    }
  }

  return chapters;
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
  if (ext === "markdown") return "md";
  return null;
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
