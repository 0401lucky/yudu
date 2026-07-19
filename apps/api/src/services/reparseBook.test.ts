import { describe, expect, it, beforeEach } from "vitest";
import type { Env } from "../env";
import { reparseBook, ReparseError } from "./importBook";

type BookRow = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  format: string;
  cover_r2_key: string | null;
  source_r2_key: string | null;
  status: string;
  error_message: string | null;
  chapter_count: number;
  created_at: number;
  updated_at: number;
};

type ChapterRow = {
  id: string;
  book_id: string;
  idx: number;
  title: string;
  r2_key: string;
  char_count: number;
};

type ProgressRow = {
  user_id: string;
  book_id: string;
  chapter_index: number;
  char_offset: number;
  page_in_chapter: number | null;
  updated_at: number;
};

function createMockEnv(opts: {
  book?: BookRow | null;
  chapters?: ChapterRow[];
  r2?: Map<string, Uint8Array | string>;
  progress?: ProgressRow | null;
}) {
  const books = new Map<string, BookRow>();
  if (opts.book) books.set(opts.book.id, opts.book);
  const chapters = [...(opts.chapters ?? [])];
  const r2 = opts.r2 ?? new Map<string, Uint8Array | string>();
  let progress = opts.progress ?? null;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("UPDATE books SET status = 'processing'")) {
                const b = books.get(args[1] as string);
                if (b) {
                  b.status = "processing";
                  b.updated_at = args[0] as number;
                }
                return { success: true };
              }
              if (sql.includes("UPDATE books SET") && sql.includes("status = ?")) {
                const b = books.get(args[2] as string);
                if (b) {
                  b.status = args[0] as string;
                  b.updated_at = args[1] as number;
                }
                return { success: true };
              }
              if (sql.includes("UPDATE books SET") && sql.includes("chapter_count")) {
                const b = books.get(args[2] as string);
                if (b) {
                  b.status = "ready";
                  b.error_message = null;
                  b.chapter_count = args[0] as number;
                  b.updated_at = args[1] as number;
                }
                return { success: true };
              }
              if (sql.includes("DELETE FROM chapters")) {
                const bookId = args[0] as string;
                for (let i = chapters.length - 1; i >= 0; i--) {
                  if (chapters[i]!.book_id === bookId) chapters.splice(i, 1);
                }
                return { success: true };
              }
              if (sql.includes("INSERT INTO chapters")) {
                chapters.push({
                  id: args[0] as string,
                  book_id: args[1] as string,
                  idx: args[2] as number,
                  title: args[3] as string,
                  r2_key: args[4] as string,
                  char_count: args[5] as number,
                });
                return { success: true };
              }
              if (sql.includes("UPDATE reading_progress SET chapter_index")) {
                if (progress) {
                  progress.chapter_index = args[0] as number;
                  progress.updated_at = args[1] as number;
                }
                return { success: true };
              }
              throw new Error(`unexpected run: ${sql}`);
            },
            async first<T>() {
              if (sql.includes("FROM books WHERE id") && sql.includes("user_id")) {
                const id = args[0] as string;
                const uid = args[1] as string;
                const b = books.get(id);
                if (!b || b.user_id !== uid) return null;
                return b as unknown as T;
              }
              if (sql.includes("FROM reading_progress")) {
                if (!progress) return null;
                if (
                  progress.user_id === args[0] &&
                  progress.book_id === args[1]
                ) {
                  return progress as unknown as T;
                }
                return null;
              }
              throw new Error(`unexpected first: ${sql}`);
            },
            async all<T>() {
              if (sql.includes("FROM chapters") && sql.includes("char_count")) {
                const bookId = args[0] as string;
                const results = chapters
                  .filter((c) => c.book_id === bookId)
                  .sort((a, b) => a.idx - b.idx)
                  .map((c) => ({ idx: c.idx, char_count: c.char_count }));
                return { results: results as T[] };
              }
              throw new Error(`unexpected all: ${sql}`);
            },
          };
        },
      };
    },
    async batch(stmts: { bind: unknown }[]) {
      // 顺序执行 mock prepare 已返回的可 run 对象
      for (const s of stmts as unknown as Array<{
        bind?: (...a: unknown[]) => { run: () => Promise<unknown> };
        run?: () => Promise<unknown>;
      }>) {
        // D1 batch items are prepared statements already bound in our code via .bind()
        // Our mock: prepare().bind() returns { run, first, all }
        // But batch receives the return of .bind() in real D1... actually in Workers,
        // prepare().bind() returns D1PreparedStatement which is batchable.
        // In our service we pass the result of .bind() to batch.
        const runnable = s as unknown as { run: () => Promise<unknown> };
        if (typeof runnable.run === "function") {
          await runnable.run();
        }
      }
      return [];
    },
  };

  const bucket = {
    async list(opts: { prefix: string; cursor?: string; limit?: number }) {
      const keys = [...r2.keys()].filter((k) => k.startsWith(opts.prefix));
      return {
        objects: keys.map((key) => ({ key })),
        truncated: false,
        cursor: undefined,
      };
    },
    async get(key: string) {
      const v = r2.get(key);
      if (v == null) return null;
      const bytes =
        typeof v === "string" ? new TextEncoder().encode(v) : v;
      return {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        text: async () =>
          typeof v === "string" ? v : new TextDecoder().decode(v),
      };
    },
    async put(key: string, value: string | ArrayBufferView) {
      if (typeof value === "string") r2.set(key, value);
      else r2.set(key, new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    },
    async delete(key: string) {
      r2.delete(key);
    },
  };

  const env = {
    DB: db as unknown as D1Database,
    BOOKS_BUCKET: bucket as unknown as R2Bucket,
    SESSION_SECRET: "test",
  } as Env;

  return { env, books, chapters, r2, getProgress: () => progress };
}

describe("reparseBook", () => {
  const userId = "u1";
  const bookId = "b1";
  const sourceKey = `users/${userId}/books/${bookId}/source/sample.md`;

  const baseBook = (): BookRow => ({
    id: bookId,
    user_id: userId,
    title: "样例书",
    author: null,
    format: "md",
    cover_r2_key: `users/${userId}/books/${bookId}/cover`,
    source_r2_key: sourceKey,
    status: "ready",
    error_message: null,
    chapter_count: 1,
    created_at: 1,
    updated_at: 1,
  });

  it("非 md 抛出 NOT_MARKDOWN", async () => {
    const { env } = createMockEnv({
      book: { ...baseBook(), format: "txt" },
    });
    await expect(reparseBook(env, userId, bookId)).rejects.toMatchObject({
      code: "NOT_MARKDOWN",
    });
  });

  it("书籍不存在抛出 NOT_FOUND", async () => {
    const { env } = createMockEnv({ book: null });
    await expect(reparseBook(env, userId, bookId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("无源文件抛出 SOURCE_MISSING", async () => {
    const { env } = createMockEnv({
      book: { ...baseBook(), source_r2_key: null },
      r2: new Map(),
    });
    await expect(reparseBook(env, userId, bookId)).rejects.toMatchObject({
      code: "SOURCE_MISSING",
    });
  });

  it("成功从源文件覆写章节并保留 markdown 标记", async () => {
    const md = `## 第一章

这是**加粗**内容。

## 第二章

第二段 *斜体*。
`;
    const oldChapter: ChapterRow = {
      id: "c0",
      book_id: bookId,
      idx: 0,
      title: "旧章",
      r2_key: `users/${userId}/books/${bookId}/chapters/0.json`,
      char_count: 10,
    };
    const r2 = new Map<string, Uint8Array | string>([
      [sourceKey, new TextEncoder().encode(md)],
      [
        oldChapter.r2_key,
        JSON.stringify({ title: "旧章", text: "旧纯文本" }),
      ],
    ]);

    const { env, chapters } = createMockEnv({
      book: baseBook(),
      chapters: [oldChapter],
      r2,
      progress: {
        user_id: userId,
        book_id: bookId,
        chapter_index: 0,
        char_offset: 0,
        page_in_chapter: 0,
        updated_at: 1,
      },
    });

    const summary = await reparseBook(env, userId, bookId);
    expect(summary.status).toBe("ready");
    expect(summary.chapterCount).toBe(2);
    expect(chapters).toHaveLength(2);
    expect(chapters[0]!.title).toMatch(/第一/);

    const ch0 = r2.get(chapters[0]!.r2_key);
    expect(typeof ch0).toBe("string");
    const parsed = JSON.parse(ch0 as string) as { text: string };
    expect(parsed.text).toContain("**加粗**");
  });

  it("写库失败时保留旧章节并恢复 ready", async () => {
    const oldChapter: ChapterRow = {
      id: "c0",
      book_id: bookId,
      idx: 0,
      title: "旧章",
      r2_key: `users/${userId}/books/${bookId}/chapters/0.json`,
      char_count: 4,
    };
    const r2 = new Map<string, Uint8Array | string>([
      [sourceKey, new TextEncoder().encode("## 新章\n\n**新**正文\n")],
      [oldChapter.r2_key, JSON.stringify({ title: "旧章", text: "旧文" })],
    ]);
    const { env, chapters, books } = createMockEnv({
      book: baseBook(),
      chapters: [oldChapter],
      r2,
    });
    (env.DB as unknown as { batch: () => Promise<unknown> }).batch =
      async () => {
        throw new Error("模拟数据库失败");
      };

    await expect(reparseBook(env, userId, bookId)).rejects.toMatchObject({
      code: "REPARSE_FAILED",
    });
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe("旧章");
    expect(books.get(bookId)!.status).toBe("ready");
  });
});
