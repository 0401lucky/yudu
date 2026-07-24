import { Hono } from "hono";
import type { BookSearchMatch, BookSearchResult } from "@yudu/shared";
import type { Env } from "../env";
import { authMiddleware, type AuthVariables } from "../middleware/auth";
import { mdPlainLength } from "../parsers/md";
import { getText } from "../services/storage";

/** 关键词长度下限 */
const MIN_QUERY_CHARS = 2;
/** 关键词长度上限 */
const MAX_QUERY_CHARS = 50;
/** 每章最多命中条数 */
const MAX_MATCHES_PER_CHAPTER = 5;
/** 全书最多命中条数（达到即停止扫描并标记截断） */
const MAX_MATCHES_PER_BOOK = 50;
/** 摘录取命中点前后各多少字符 */
const EXCERPT_CONTEXT_CHARS = 30;
/** 并发读取 R2 章节的分批大小 */
const R2_BATCH_SIZE = 10;

type SearchChapterRow = {
  idx: number;
  title: string;
  r2_key: string;
};

export const searchRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

searchRoutes.use("*", authMiddleware);

/**
 * GET /api/books/:id/search?q=<keyword> — 书内全文搜索
 * 实时扫描 R2 章节正文（无索引）；大小写不敏感；按章节顺序返回。
 */
searchRoutes.get("/:id/search", async (c) => {
  const userId = c.get("userId");
  const bookId = c.req.param("id");

  const q = (c.req.query("q") ?? "").trim();
  if (q.length < MIN_QUERY_CHARS || q.length > MAX_QUERY_CHARS) {
    return c.json(
      {
        error: {
          code: "INVALID_QUERY",
          message: `关键词须为 ${MIN_QUERY_CHARS}-${MAX_QUERY_CHARS} 个字符`,
        },
      },
      400,
    );
  }

  // 归属校验：非本人书视同不存在
  const book = await c.env.DB.prepare(
    `SELECT id, format FROM books WHERE id = ? AND user_id = ?`,
  )
    .bind(bookId, userId)
    .first<{ id: string; format: string }>();

  if (!book) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "书籍不存在" } },
      404,
    );
  }

  if (book.format === "pdf") {
    return c.json(
      {
        error: {
          code: "UNSUPPORTED_FORMAT",
          message: "PDF 暂不支持全文搜索",
        },
      },
      400,
    );
  }

  const { results } = await c.env.DB.prepare(
    `SELECT idx, title, r2_key FROM chapters
     WHERE book_id = ? ORDER BY idx ASC`,
  )
    .bind(bookId)
    .all<SearchChapterRow>();

  const chapters = results ?? [];
  const matches: BookSearchMatch[] = [];
  // md 书的 char_count 与前端换算基准均为「渲染近似纯文本」口径，
  // charOffset 需从源文索引换算到同一坐标系，落位/百分比才不偏移
  const isMd = book.format === "md";

  // 分批并发读 R2；累计命中达上限即停止后续批次
  for (
    let i = 0;
    i < chapters.length && matches.length < MAX_MATCHES_PER_BOOK;
    i += R2_BATCH_SIZE
  ) {
    const batch = chapters.slice(i, i + R2_BATCH_SIZE);
    const texts = await Promise.all(
      batch.map((ch) => readChapterText(c.env.BOOKS_BUCKET, ch.r2_key)),
    );
    for (
      let j = 0;
      j < batch.length && matches.length < MAX_MATCHES_PER_BOOK;
      j++
    ) {
      const text = texts[j];
      // R2 缺失/损坏的章节跳过，不中断整体搜索
      if (text == null) continue;
      const chapter = batch[j]!;
      const limit = Math.min(
        MAX_MATCHES_PER_CHAPTER,
        MAX_MATCHES_PER_BOOK - matches.length,
      );
      for (const hit of findChapterMatches(text, q, limit)) {
        matches.push({
          chapterIndex: chapter.idx,
          chapterTitle: chapter.title,
          ...hit,
          charOffset: isMd
            ? mdPlainLength(text.slice(0, hit.charOffset))
            : hit.charOffset,
        });
      }
    }
  }

  const result: BookSearchResult = {
    query: q,
    matches,
    truncated: matches.length >= MAX_MATCHES_PER_BOOK,
  };
  c.header("Cache-Control", "private, max-age=60");
  return c.json(result);
});

/** 读取章节正文；缺失或 JSON 损坏返回 null（调用方跳过该章） */
async function readChapterText(
  bucket: R2Bucket,
  key: string,
): Promise<string | null> {
  try {
    const raw = await getText(bucket, key);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return null;
  }
}

type ChapterHit = Pick<
  BookSearchMatch,
  "charOffset" | "excerpt" | "keywordStart"
>;

/** 单章内大小写不敏感查找关键词，至多 limit 条 */
function findChapterMatches(
  text: string,
  query: string,
  limit: number,
): ChapterHit[] {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const out: ChapterHit[] = [];
  let from = 0;
  while (out.length < limit) {
    const at = lowerText.indexOf(lowerQuery, from);
    if (at < 0) break;
    out.push(buildExcerpt(text, at, query.length));
    from = at + lowerQuery.length;
  }
  return out;
}

/**
 * 构建命中摘录：命中点前后各取 EXCERPT_CONTEXT_CHARS 字符。
 * 前后段的连续空白折叠为单个空格（保证 keywordStart 与关键词切片对齐，
 * 关键词段只做 1:1 空白替换，长度不变）。
 */
function buildExcerpt(
  text: string,
  at: number,
  queryLen: number,
): ChapterHit {
  const start = Math.max(0, at - EXCERPT_CONTEXT_CHARS);
  const end = Math.min(text.length, at + queryLen + EXCERPT_CONTEXT_CHARS);
  // 窗口边界若切在代理对（emoji 等）中间，去掉残缺的半个字符
  let beforeRaw = text.slice(start, at);
  if (/^[\uDC00-\uDFFF]/.test(beforeRaw)) beforeRaw = beforeRaw.slice(1);
  let afterRaw = text.slice(at + queryLen, end);
  if (/[\uD800-\uDBFF]$/.test(afterRaw)) afterRaw = afterRaw.slice(0, -1);
  const before = beforeRaw.replace(/\s+/g, " ").trimStart();
  const keyword = text.slice(at, at + queryLen).replace(/\s/g, " ");
  const after = afterRaw.replace(/\s+/g, " ").trimEnd();
  return {
    charOffset: at,
    excerpt: before + keyword + after,
    keywordStart: before.length,
  };
}
