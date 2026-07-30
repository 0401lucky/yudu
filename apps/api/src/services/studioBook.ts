import {
  emptyStudioAssets,
  MAX_STUDIO_CHAPTER_CHARS,
  MAX_STUDIO_CHAPTER_OUTLINES,
  MAX_STUDIO_CHARACTERS,
  MAX_STUDIO_MODEL_CHARS,
  MAX_STUDIO_OUTLINE_CHARS,
  MAX_STUDIO_TITLE_CHARS,
  type BookSummary,
  type StudioAssets,
  type StudioBookDetail,
  type StudioChapterOutline,
  type StudioCharacter,
  type StudioOutlineDetail,
  type StudioPremise,
} from "@yudu/shared";
import type { Env } from "../env";
import { generateCoverSvg } from "./cover";
import { putBytes, putText, r2Key } from "./storage";

export class StudioValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StudioValidationError";
    this.code = code;
  }
}

export class StudioNotFoundError extends Error {
  constructor(message = "书籍不存在") {
    super(message);
    this.name = "StudioNotFoundError";
  }
}

export class StudioForbiddenError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StudioForbiddenError";
    this.code = code;
  }
}

type StudioBookRow = {
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
  source: string | null;
  on_shelf: number | null;
  break_limit: number | null;
  studio_assets: string | null;
  chapter_index: number | null;
  char_offset: number | null;
  progress_char_count: number | null;
  last_read_at: number | null;
};

const SUMMARY_SELECT = `SELECT
   b.id, b.title, b.author, b.format, b.cover_r2_key, b.status,
   b.error_message, b.chapter_count, b.updated_at, b.created_at, b.group_name,
   b.source, b.on_shelf, b.break_limit, b.studio_assets,
   p.chapter_index, p.char_offset, p.updated_at AS last_read_at,
   ch.char_count AS progress_char_count
 FROM books b
 LEFT JOIN reading_progress p
   ON p.book_id = b.id AND p.user_id = b.user_id
 LEFT JOIN chapters ch
   ON ch.book_id = b.id AND ch.idx = p.chapter_index`;

export function parseStudioAssets(raw: string | null | undefined): StudioAssets {
  if (!raw) return emptyStudioAssets();
  try {
    const parsed = JSON.parse(raw) as Partial<StudioAssets>;
    return normalizeAssets(parsed);
  } catch {
    return emptyStudioAssets();
  }
}

function normalizeAssets(input: Partial<StudioAssets> | null | undefined): StudioAssets {
  const base = emptyStudioAssets(
    typeof input?.updatedAt === "number" ? input.updatedAt : Date.now(),
  );
  if (!input || typeof input !== "object") return base;

  const premise: StudioPremise = {};
  if (input.premise && typeof input.premise === "object") {
    const p = input.premise;
    if (typeof p.idea === "string") premise.idea = p.idea;
    if (typeof p.genre === "string") premise.genre = p.genre;
    if (typeof p.tone === "string") premise.tone = p.tone;
    if (typeof p.targetLength === "string") premise.targetLength = p.targetLength;
    if (typeof p.logline === "string") premise.logline = p.logline;
    if (typeof p.notes === "string") premise.notes = p.notes;
    if (typeof p.autoChapterCount === "boolean")
      premise.autoChapterCount = p.autoChapterCount;
  }

  const characters: StudioCharacter[] = Array.isArray(input.characters)
    ? input.characters
        .filter((c): c is StudioCharacter => c != null && typeof c === "object")
        .map((c) => {
          const out: StudioCharacter = {
            id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID(),
            name: typeof c.name === "string" ? c.name : "",
            role: typeof c.role === "string" ? c.role : "",
            description: typeof c.description === "string" ? c.description : "",
          };
          // 结构化角色卡的 8 个维度，逐字段白名单放行
          if (typeof c.ageIdentity === "string") out.ageIdentity = c.ageIdentity;
          if (typeof c.appearance === "string") out.appearance = c.appearance;
          if (typeof c.personality === "string") out.personality = c.personality;
          if (typeof c.background === "string") out.background = c.background;
          if (typeof c.motivation === "string") out.motivation = c.motivation;
          if (typeof c.flaw === "string") out.flaw = c.flaw;
          if (typeof c.speech === "string") out.speech = c.speech;
          if (typeof c.relations === "string") out.relations = c.relations;
          return out;
        })
    : [];

  const chapterOutlines: StudioChapterOutline[] = Array.isArray(
    input.chapterOutlines,
  )
    ? input.chapterOutlines
        .filter((c): c is StudioChapterOutline => c != null && typeof c === "object")
        .map((c, i) => {
          const out: StudioChapterOutline = {
            index: typeof c.index === "number" && Number.isInteger(c.index) ? c.index : i,
            title: typeof c.title === "string" ? c.title : `第 ${i + 1} 章`,
            summary: typeof c.summary === "string" ? c.summary : "",
          };
          if (typeof c.conflict === "string") out.conflict = c.conflict;
          if (typeof c.hook === "string") out.hook = c.hook;
          if (typeof c.characters === "string") out.characters = c.characters;
          return out;
        })
    : [];

  // 结构化大纲；全部字段缺失时不写入该键，保持与旧数据同构
  let outlineDetail: StudioOutlineDetail | undefined;
  if (input.outlineDetail && typeof input.outlineDetail === "object") {
    const o = input.outlineDetail;
    const next: StudioOutlineDetail = {};
    if (typeof o.throughline === "string") next.throughline = o.throughline;
    if (typeof o.setting === "string") next.setting = o.setting;
    if (typeof o.conflict === "string") next.conflict = o.conflict;
    if (typeof o.act1 === "string") next.act1 = o.act1;
    if (typeof o.act2 === "string") next.act2 = o.act2;
    if (typeof o.act3 === "string") next.act3 = o.act3;
    if (typeof o.act4 === "string") next.act4 = o.act4;
    if (typeof o.subplots === "string") next.subplots = o.subplots;
    if (Object.keys(next).length) outlineDetail = next;
  }

  return {
    premise,
    characters,
    outline: typeof input.outline === "string" ? input.outline : "",
    ...(outlineDetail ? { outlineDetail } : {}),
    chapterOutlines,
    updatedAt:
      typeof input.updatedAt === "number" && Number.isFinite(input.updatedAt)
        ? input.updatedAt
        : Date.now(),
  };
}

export function validateAndNormalizeAssets(body: unknown): StudioAssets {
  if (body == null || typeof body !== "object") {
    throw new StudioValidationError("INVALID_ASSETS", "设定数据无效");
  }
  const normalized = normalizeAssets(body as Partial<StudioAssets>);

  if (normalized.outline.length > MAX_STUDIO_OUTLINE_CHARS) {
    throw new StudioValidationError(
      "INVALID_ASSETS",
      `总大纲不能超过 ${MAX_STUDIO_OUTLINE_CHARS} 字`,
    );
  }
  if (normalized.characters.length > MAX_STUDIO_CHARACTERS) {
    throw new StudioValidationError(
      "INVALID_ASSETS",
      `人设不能超过 ${MAX_STUDIO_CHARACTERS} 个`,
    );
  }
  if (normalized.chapterOutlines.length > MAX_STUDIO_CHAPTER_OUTLINES) {
    throw new StudioValidationError(
      "INVALID_ASSETS",
      `细纲不能超过 ${MAX_STUDIO_CHAPTER_OUTLINES} 章`,
    );
  }

  normalized.updatedAt = Date.now();
  // 细纲 index 重排为 0..n-1
  normalized.chapterOutlines = normalized.chapterOutlines.map((c, i) => ({
    ...c,
    index: i,
    title: c.title.trim() || `第 ${i + 1} 章`,
  }));
  return normalized;
}

export function rowToBookSummary(
  row: {
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
    source?: string | null;
    on_shelf?: number | null;
    break_limit?: number | null;
    chapter_index: number | null;
    char_offset: number | null;
    progress_char_count: number | null;
    last_read_at: number | null;
  },
  calcProgressPercent: (
    chapterCount: number,
    chapterIndex: number | null,
    charOffset: number | null,
    charCount: number | null,
  ) => number | null,
): BookSummary {
  const source = row.source === "studio" ? "studio" : "import";
  const onShelf =
    source === "import" ? (row.on_shelf == null ? true : row.on_shelf !== 0) : row.on_shelf === 1;
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
    source,
    onShelf,
    breakLimit: row.break_limit === 1,
  };
}

export async function listStudioBooks(
  env: Env,
  userId: string,
  calcProgressPercent: (
    chapterCount: number,
    chapterIndex: number | null,
    charOffset: number | null,
    charCount: number | null,
  ) => number | null,
): Promise<BookSummary[]> {
  const { results } = await env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.user_id = ? AND b.source = 'studio'
     ORDER BY b.updated_at DESC`,
  )
    .bind(userId)
    .all<StudioBookRow>();

  return (results ?? []).map((row) => rowToBookSummary(row, calcProgressPercent));
}

export async function createStudioBook(
  env: Env,
  userId: string,
  input: { title?: string; breakLimit?: boolean },
  calcProgressPercent: (
    chapterCount: number,
    chapterIndex: number | null,
    charOffset: number | null,
    charCount: number | null,
  ) => number | null,
): Promise<BookSummary> {
  const title = (input.title ?? "未命名作品").trim() || "未命名作品";
  if (title.length > MAX_STUDIO_TITLE_CHARS) {
    throw new StudioValidationError(
      "INVALID_TITLE",
      `书名不能超过 ${MAX_STUDIO_TITLE_CHARS} 个字符`,
    );
  }
  const breakLimit = Boolean(input.breakLimit);
  const bookId = crypto.randomUUID();
  const now = Date.now();
  const assets = emptyStudioAssets(now);
  const coverKey = r2Key.cover(userId, bookId);

  await env.DB.prepare(
    `INSERT INTO books (
       id, user_id, title, author, format, cover_r2_key, source_r2_key,
       status, error_message, chapter_count, created_at, updated_at,
       source, on_shelf, break_limit, studio_assets
     ) VALUES (?, ?, ?, NULL, 'txt', ?, NULL, 'ready', NULL, 0, ?, ?, 'studio', 0, ?, ?)`,
  )
    .bind(
      bookId,
      userId,
      title,
      coverKey,
      now,
      now,
      breakLimit ? 1 : 0,
      JSON.stringify(assets),
    )
    .run();

  const svg = generateCoverSvg(title, null);
  await putBytes(
    env.BOOKS_BUCKET,
    coverKey,
    svg,
    "image/svg+xml; charset=utf-8",
  );

  const row = await env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.id = ? AND b.user_id = ?`,
  )
    .bind(bookId, userId)
    .first<StudioBookRow>();

  if (!row) {
    throw new Error("创建创作书后读取失败");
  }
  return rowToBookSummary(row, calcProgressPercent);
}

export async function getStudioBookDetail(
  env: Env,
  userId: string,
  bookId: string,
): Promise<StudioBookDetail> {
  const book = await env.DB.prepare(
    `SELECT id, title, author, format, status, chapter_count, source, on_shelf, break_limit, studio_model, studio_assets
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
      source: string | null;
      on_shelf: number | null;
      break_limit: number | null;
      studio_model: string | null;
      studio_assets: string | null;
    }>();

  if (!book || book.source !== "studio") {
    throw new StudioNotFoundError();
  }

  const { results } = await env.DB.prepare(
    `SELECT idx, title, char_count FROM chapters
     WHERE book_id = ? ORDER BY idx ASC`,
  )
    .bind(bookId)
    .all<{ idx: number; title: string; char_count: number }>();

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    format: book.format as StudioBookDetail["format"],
    status: book.status as StudioBookDetail["status"],
    chapters: (results ?? []).map((ch) => ({
      index: ch.idx,
      title: ch.title,
      charCount: ch.char_count,
    })),
    source: "studio",
    onShelf: book.on_shelf === 1,
    breakLimit: book.break_limit === 1,
    model: book.studio_model ?? undefined,
    assets: parseStudioAssets(book.studio_assets),
  };
}

export async function patchStudioBook(
  env: Env,
  userId: string,
  bookId: string,
  patch: {
    title?: string;
    breakLimit?: boolean;
    author?: string | null;
    model?: string | null;
  },
  calcProgressPercent: (
    chapterCount: number,
    chapterIndex: number | null,
    charOffset: number | null,
    charCount: number | null,
  ) => number | null,
): Promise<BookSummary> {
  const existing = await env.DB.prepare(
    `SELECT id, title, author, break_limit, studio_model, source FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{
      id: string;
      title: string;
      author: string | null;
      break_limit: number | null;
      studio_model: string | null;
      source: string | null;
    }>();

  if (!existing || existing.source !== "studio") {
    throw new StudioNotFoundError();
  }

  let title = existing.title;
  if (patch.title !== undefined) {
    title = patch.title.trim() || "未命名作品";
    if (title.length > MAX_STUDIO_TITLE_CHARS) {
      throw new StudioValidationError(
        "INVALID_TITLE",
        `书名不能超过 ${MAX_STUDIO_TITLE_CHARS} 个字符`,
      );
    }
  }

  let author = existing.author;
  if (patch.author !== undefined) {
    if (patch.author == null) author = null;
    else if (typeof patch.author === "string") {
      const t = patch.author.trim();
      author = t || null;
    } else {
      throw new StudioValidationError("INVALID_AUTHOR", "作者必须是字符串或 null");
    }
  }

  let model = existing.studio_model;
  if (patch.model !== undefined) {
    if (patch.model == null) model = null;
    else {
      const t = patch.model.trim();
      if (t.length > MAX_STUDIO_MODEL_CHARS) {
        throw new StudioValidationError(
          "INVALID_MODEL",
          `模型 id 不能超过 ${MAX_STUDIO_MODEL_CHARS} 个字符`,
        );
      }
      model = t || null;
    }
  }

  const breakLimit =
    patch.breakLimit !== undefined
      ? Boolean(patch.breakLimit)
      : existing.break_limit === 1;

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE books SET title = ?, author = ?, break_limit = ?, studio_model = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND source = 'studio'`,
  )
    .bind(title, author, breakLimit ? 1 : 0, model, now, bookId, userId)
    .run();

  // 书名变更时刷新封面
  if (title !== existing.title) {
    const coverKey = r2Key.cover(userId, bookId);
    const svg = generateCoverSvg(title, author);
    await putBytes(
      env.BOOKS_BUCKET,
      coverKey,
      svg,
      "image/svg+xml; charset=utf-8",
    );
    await env.DB.prepare(
      `UPDATE books SET cover_r2_key = ? WHERE id = ? AND user_id = ?`,
    )
      .bind(coverKey, bookId, userId)
      .run();
  }

  const row = await env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.id = ? AND b.user_id = ?`,
  )
    .bind(bookId, userId)
    .first<StudioBookRow>();
  if (!row) throw new StudioNotFoundError();
  return rowToBookSummary(row, calcProgressPercent);
}

export async function putStudioAssets(
  env: Env,
  userId: string,
  bookId: string,
  body: unknown,
): Promise<StudioAssets> {
  const existing = await env.DB.prepare(
    `SELECT id, source FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string; source: string | null }>();

  if (!existing || existing.source !== "studio") {
    throw new StudioNotFoundError();
  }

  const assets = validateAndNormalizeAssets(body);
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE books SET studio_assets = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(JSON.stringify(assets), now, bookId, userId)
    .run();
  return assets;
}

export async function setStudioOnShelf(
  env: Env,
  userId: string,
  bookId: string,
  onShelf: boolean,
  calcProgressPercent: (
    chapterCount: number,
    chapterIndex: number | null,
    charOffset: number | null,
    charCount: number | null,
  ) => number | null,
): Promise<BookSummary> {
  const existing = await env.DB.prepare(
    `SELECT id, source FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string; source: string | null }>();

  if (!existing || existing.source !== "studio") {
    throw new StudioNotFoundError();
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE books SET on_shelf = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(onShelf ? 1 : 0, now, bookId, userId)
    .run();

  const row = await env.DB.prepare(
    `${SUMMARY_SELECT}
     WHERE b.id = ? AND b.user_id = ?`,
  )
    .bind(bookId, userId)
    .first<StudioBookRow>();
  if (!row) throw new StudioNotFoundError();
  return rowToBookSummary(row, calcProgressPercent);
}

/** 仅 studio 书可写章节；idx 存在则覆盖，不存在则插入（允许跳号时补齐 count） */
export async function upsertStudioChapter(
  env: Env,
  userId: string,
  bookId: string,
  idx: number,
  input: { title?: string; text?: string },
): Promise<{ index: number; title: string; charCount: number }> {
  if (!Number.isInteger(idx) || idx < 0) {
    throw new StudioValidationError("INVALID_INDEX", "章节序号无效");
  }

  const book = await env.DB.prepare(
    `SELECT id, source, chapter_count FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string; source: string | null; chapter_count: number }>();

  if (!book) throw new StudioNotFoundError();
  if (book.source !== "studio") {
    throw new StudioForbiddenError(
      "NOT_STUDIO_BOOK",
      "仅创作台作品可在此编辑章节",
    );
  }

  const title =
    typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : `第 ${idx + 1} 章`;
  const text = typeof input.text === "string" ? input.text : "";
  if (text.length > MAX_STUDIO_CHAPTER_CHARS) {
    throw new StudioValidationError(
      "INVALID_CHAPTER",
      `章节正文不能超过 ${MAX_STUDIO_CHAPTER_CHARS} 字`,
    );
  }

  const key = r2Key.chapter(userId, bookId, idx);
  await putText(
    env.BOOKS_BUCKET,
    key,
    JSON.stringify({ title, text }),
  );

  const existing = await env.DB.prepare(
    `SELECT id FROM chapters WHERE book_id = ? AND idx = ?`,
  )
    .bind(bookId, idx)
    .first<{ id: string }>();

  const charCount = [...text].length;
  if (existing) {
    await env.DB.prepare(
      `UPDATE chapters SET title = ?, r2_key = ?, char_count = ? WHERE book_id = ? AND idx = ?`,
    )
      .bind(title, key, charCount, bookId, idx)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO chapters (id, book_id, idx, title, r2_key, char_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), bookId, idx, title, key, charCount)
      .run();
  }

  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?`,
  )
    .bind(bookId)
    .all<{ c: number }>();
  // D1 COUNT 有时在 first；兼容
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM chapters WHERE book_id = ?`,
  )
    .bind(bookId)
    .first<{ c: number }>();
  const chapterCount = countRow?.c ?? results?.[0]?.c ?? book.chapter_count;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE books SET chapter_count = ?, updated_at = ?, status = 'ready' WHERE id = ? AND user_id = ?`,
  )
    .bind(chapterCount, now, bookId, userId)
    .run();

  return { index: idx, title, charCount };
}

export async function appendStudioChapter(
  env: Env,
  userId: string,
  bookId: string,
  input: { title?: string; text?: string },
): Promise<{ index: number; title: string; charCount: number }> {
  const book = await env.DB.prepare(
    `SELECT id, source, chapter_count FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string; source: string | null; chapter_count: number }>();

  if (!book) throw new StudioNotFoundError();
  if (book.source !== "studio") {
    throw new StudioForbiddenError(
      "NOT_STUDIO_BOOK",
      "仅创作台作品可在此编辑章节",
    );
  }

  // 下一 index = 当前最大 idx+1，无章则为 0
  const maxRow = await env.DB.prepare(
    `SELECT MAX(idx) AS m FROM chapters WHERE book_id = ?`,
  )
    .bind(bookId)
    .first<{ m: number | null }>();
  const nextIdx =
    maxRow?.m == null || !Number.isFinite(maxRow.m) ? 0 : maxRow.m + 1;

  return upsertStudioChapter(env, userId, bookId, nextIdx, input);
}
