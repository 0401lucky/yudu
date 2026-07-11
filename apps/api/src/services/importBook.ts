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
import { deletePrefix, getText, putBytes, putText, r2Key } from "./storage";

export class ImportValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImportValidationError";
    this.code = code;
  }
}

export type UploadFile = { name: string; bytes: Uint8Array };

/** 章节 R2 JSON（sequence 用于后续追加合并） */
type ChapterPayload = {
  title: string;
  text: string;
  sequence?: number | null;
  sourceFile?: string;
};

type GroupItem = {
  file: UploadFile;
  format: Exclude<BookFormat, "pdf">;
};

type ImportGroup = {
  seriesTitle: string;
  isSequenced: boolean;
  items: GroupItem[];
};

type ExistingBook = {
  id: string;
  title: string;
  author: string | null;
  format: string;
  cover_r2_key: string | null;
  chapter_count: number;
};

/**
 * 单文件导入（兼容旧接口）。
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
 * 批量导入：
 * - 按「书名-序号」分组合并
 * - 若书架已有同名系列书，则**追加/更新章节**而非新建
 * - 无序号的独立文件各自成书
 */
export async function importBooksBatch(
  env: Env,
  userId: string,
  files: UploadFile[],
): Promise<BookSummary[]> {
  if (!files.length) {
    throw new ImportValidationError("MISSING_FILE", "请至少上传一个文件");
  }

  const validated: GroupItem[] = [];
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

  const groups = new Map<string, ImportGroup>();
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

  for (const g of groups.values()) {
    g.items.sort((a, b) => compareBySequence(a.file.name, b.file.name));
  }

  const summaries: BookSummary[] = [];
  for (const g of groups.values()) {
    summaries.push(await createOrAppendBook(env, userId, g));
  }
  return summaries;
}

async function createOrAppendBook(
  env: Env,
  userId: string,
  group: ImportGroup,
): Promise<BookSummary> {
  // 有序系列：查找已有同名书并追加
  if (group.isSequenced) {
    const existing = await findReadyBookByTitle(
      env,
      userId,
      group.seriesTitle,
    );
    if (existing) {
      return appendChaptersToBook(env, userId, existing, group);
    }
  }
  return createBookFromGroup(env, userId, group);
}

async function findReadyBookByTitle(
  env: Env,
  userId: string,
  title: string,
): Promise<ExistingBook | null> {
  // SQLite lower() 对中文无影响；trim 后精确匹配标题
  const row = await env.DB.prepare(
    `SELECT id, title, author, format, cover_r2_key, chapter_count
     FROM books
     WHERE user_id = ? AND status = 'ready' AND title = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(userId, title.trim())
    .first<ExistingBook>();

  return row ?? null;
}

/** 解析组内全部文件为带 sequence 的章节 */
async function parseGroupChapters(
  group: ImportGroup,
): Promise<{
  chapters: ChapterPayload[];
  author: string | null;
  cover: ParseResult["cover"] | undefined;
}> {
  const chapters: ChapterPayload[] = [];
  let author: string | null = null;
  let cover: ParseResult["cover"] | undefined;

  const multi = group.isSequenced && group.items.length > 1;

  for (const { file, format } of group.items) {
    const parsed = await parseByFormat(format, file.bytes, file.name);
    if (parsed.author?.trim() && !author) author = parsed.author.trim();
    if (parsed.cover?.bytes?.byteLength && !cover) cover = parsed.cover;

    const parts = parseFilenameSeries(file.name);
    const normalized = normalizeChaptersForMerge(
      parsed.chapters,
      parts,
      multi || (group.isSequenced && group.items.length === 1),
    );

    for (const ch of normalized) {
      chapters.push({
        title: ch.title,
        text: ch.text,
        sequence: parts.sequence,
        sourceFile: parts.basename,
      });
    }
  }

  return { chapters, author, cover };
}

/**
 * 向已有书追加章节：按 sequence 去重/覆盖，再按序号重排写回。
 */
async function appendChaptersToBook(
  env: Env,
  userId: string,
  book: ExistingBook,
  group: ImportGroup,
): Promise<BookSummary> {
  const bookId = book.id;
  const now = Date.now();

  try {
    // 存源文件
    for (let fi = 0; fi < group.items.length; fi++) {
      const { file, format } = group.items[fi]!;
      const key = r2Key.source(
        userId,
        bookId,
        `append-${now}-${fi}-${file.name}`,
      );
      await putBytes(
        env.BOOKS_BUCKET,
        key,
        file.bytes,
        contentTypeForFormat(format),
      );
    }

    const { chapters: incoming, author: newAuthor } =
      await parseGroupChapters(group);
    if (!incoming.length) {
      throw new Error("未解析到任何章节");
    }

    // 读出现有章节
    const { results: rows } = await env.DB.prepare(
      `SELECT idx, title, r2_key, char_count FROM chapters
       WHERE book_id = ? ORDER BY idx ASC`,
    )
      .bind(bookId)
      .all<{ idx: number; title: string; r2_key: string; char_count: number }>();

    type Merged = ChapterPayload & { key?: string };
    // key: seq:N 或 title:xxx 或 idx:i
    const byKey = new Map<string, Merged>();
    const orderKeys: string[] = [];

    for (const row of rows ?? []) {
      const raw = await getText(env.BOOKS_BUCKET, row.r2_key);
      let payload: ChapterPayload = {
        title: row.title,
        text: "",
        sequence: null,
      };
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ChapterPayload;
          payload = {
            title: typeof parsed.title === "string" ? parsed.title : row.title,
            text: typeof parsed.text === "string" ? parsed.text : "",
            sequence:
              typeof parsed.sequence === "number" ? parsed.sequence : null,
            sourceFile: parsed.sourceFile,
          };
        } catch {
          payload.text = raw;
        }
      }
      // 从标题推断序号
      if (payload.sequence == null) {
        payload.sequence = sequenceFromTitle(payload.title);
      }
      const k = chapterMergeKey(payload);
      if (!byKey.has(k)) orderKeys.push(k);
      byKey.set(k, { ...payload, key: row.r2_key });
    }

    // 合并新章节（同 sequence / 同 mergeKey 则覆盖正文）
    for (const ch of incoming) {
      const k = chapterMergeKey(ch);
      const prev = byKey.get(k);
      if (prev) {
        byKey.set(k, {
          ...prev,
          title: ch.title || prev.title,
          text: ch.text,
          sequence: ch.sequence ?? prev.sequence,
          sourceFile: ch.sourceFile ?? prev.sourceFile,
        });
      } else {
        byKey.set(k, ch);
        orderKeys.push(k);
      }
    }

    // 排序：有 sequence 的按数字；其余保持相对顺序
    const merged = orderKeys
      .map((k) => byKey.get(k)!)
      .filter(Boolean)
      .sort((a, b) => {
        const sa = a.sequence;
        const sb = b.sequence;
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        if (sa != null && sb == null) return -1;
        if (sa == null && sb != null) return 1;
        return 0;
      });

    // 重写全部章节 idx + R2
    const chapterInserts: D1PreparedStatement[] = [];
    // 先删旧章节行
    await env.DB.prepare(`DELETE FROM chapters WHERE book_id = ?`)
      .bind(bookId)
      .run();

    for (let i = 0; i < merged.length; i++) {
      const ch = merged[i]!;
      const key = r2Key.chapter(userId, bookId, i);
      const body: ChapterPayload = {
        title: ch.title,
        text: ch.text,
        sequence: ch.sequence ?? null,
        sourceFile: ch.sourceFile,
      };
      await putText(env.BOOKS_BUCKET, key, JSON.stringify(body));
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

    if (chapterInserts.length) {
      await env.DB.batch(chapterInserts);
    }

    const author = newAuthor?.trim() || book.author;
    await env.DB.prepare(
      `UPDATE books SET
         author = COALESCE(?, author),
         chapter_count = ?,
         status = 'ready',
         error_message = NULL,
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
      .bind(author, merged.length, now, bookId, userId)
      .run();

    return {
      id: bookId,
      title: book.title,
      author,
      format: book.format as BookSummary["format"],
      coverUrl: book.cover_r2_key
        ? `/api/books/${bookId}/cover`
        : null,
      status: "ready",
      errorMessage: null,
      chapterCount: merged.length,
      progressPercent: null,
      updatedAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 追加失败不把整书标 failed（避免毁掉可读状态），直接抛给上层或返回 failed 摘要
    return {
      id: bookId,
      title: book.title,
      author: book.author,
      format: book.format as BookSummary["format"],
      coverUrl: book.cover_r2_key
        ? `/api/books/${bookId}/cover`
        : null,
      status: "failed",
      errorMessage: `追加章节失败：${message}`.slice(0, 500),
      chapterCount: book.chapter_count,
      progressPercent: null,
      updatedAt: Date.now(),
    };
  }
}

function chapterMergeKey(ch: ChapterPayload): string {
  if (ch.sequence != null && Number.isFinite(ch.sequence)) {
    return `seq:${ch.sequence}`;
  }
  if (ch.sourceFile) {
    return `file:${ch.sourceFile.toLowerCase()}`;
  }
  return `title:${(ch.title || "").trim().toLowerCase()}`;
}

function sequenceFromTitle(title: string): number | null {
  const m = title.match(/第\s*(\d+)\s*[章节回集部话]/);
  if (m) return Number.parseInt(m[1]!, 10);
  const m2 = title.match(/(?:^|[-_\s])(\d+)(?:\D|$)/);
  if (m2) return Number.parseInt(m2[1]!, 10);
  return null;
}

async function createBookFromGroup(
  env: Env,
  userId: string,
  group: ImportGroup,
): Promise<BookSummary> {
  const bookId = crypto.randomUUID();
  const now = Date.now();
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

    const { chapters: allChapters, author, cover } =
      await parseGroupChapters(group);

    if (!allChapters.length) {
      throw new Error("未解析到任何章节");
    }

    // 有序号时按序号排序
    allChapters.sort((a, b) => {
      if (a.sequence != null && b.sequence != null) {
        return a.sequence - b.sequence;
      }
      return 0;
    });

    const chapterInserts: D1PreparedStatement[] = [];
    for (let i = 0; i < allChapters.length; i++) {
      const ch = allChapters[i]!;
      const key = r2Key.chapter(userId, bookId, i);
      const body: ChapterPayload = {
        title: ch.title,
        text: ch.text,
        sequence: ch.sequence ?? null,
        sourceFile: ch.sourceFile,
      };
      await putText(env.BOOKS_BUCKET, key, JSON.stringify(body));

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
 * 合并时润色章节标题：单章且标题≈文件名时，改用「第 N 章」。
 */
function normalizeChaptersForMerge(
  chapters: ParsedChapter[],
  parts: ReturnType<typeof parseFilenameSeries>,
  useSequenceTitle: boolean,
): ParsedChapter[] {
  if (!chapters.length) return chapters;

  if (chapters.length === 1 && useSequenceTitle && parts.sequence != null) {
    const only = chapters[0]!;
    const stem = parts.basename.replace(/\.[^.]+$/, "");
    const titleLooksLikeFile =
      only.title === stem ||
      only.title === parts.seriesTitle ||
      only.title === parts.basename ||
      only.title === `第 ${parts.sequence} 章`;

    // 正文里已有像样标题（如《雨停之前》第三章）则保留
    const hasRichTitle =
      only.title.length > 2 &&
      !titleLooksLikeFile &&
      only.title !== stem;

    if (!hasRichTitle) {
      return [{ title: `第 ${parts.sequence} 章`, text: only.text }];
    }
  }

  return chapters;
}

/** 删除书籍：R2 前缀 + D1 */
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
