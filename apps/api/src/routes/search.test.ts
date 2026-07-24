import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { BookSearchResult } from "@yudu/shared";
import type { Env } from "../env";
import { booksRoutes } from "./books";
import { searchRoutes } from "./search";

const USER_ID = "user-1";
const MY_BOOK = "book-1"; // user-1 的 txt 书
const MD_BOOK = "book-md"; // user-1 的 md 书
const PDF_BOOK = "book-pdf"; // user-1 的 pdf 书
const OTHER_BOOK = "book-2"; // 归属 user-2

type ChapterSeed = {
  idx: number;
  title: string;
  r2_key: string;
};

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - books 预置 user-1 的 txt/pdf 书与 user-2 的书
 * - chapters 按 book_id 返回预置目录
 */
function createMockDb(chapters: Map<string, ChapterSeed[]>) {
  const books = new Map<
    string,
    { id: string; user_id: string; format: string }
  >([
    [MY_BOOK, { id: MY_BOOK, user_id: USER_ID, format: "txt" }],
    [MD_BOOK, { id: MD_BOOK, user_id: USER_ID, format: "md" }],
    [PDF_BOOK, { id: PDF_BOOK, user_id: USER_ID, format: "pdf" }],
    [OTHER_BOOK, { id: OTHER_BOOK, user_id: "user-2", format: "txt" }],
  ]);

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async first<T>() {
            if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
              return { id: "sess-1", user_id: USER_ID } as T;
            }
            if (sql.includes("FROM books")) {
              const [bookId, userId] = args as [string, string];
              const book = books.get(bookId);
              if (!book || book.user_id !== userId) return null;
              return { id: book.id, format: book.format } as T;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
          async all<T>() {
            if (sql.includes("FROM chapters")) {
              const [bookId] = args as [string];
              const rows = (chapters.get(bookId) ?? [])
                .slice()
                .sort((a, b) => a.idx - b.idx);
              return { results: rows as T[] };
            }
            throw new Error(`unexpected all sql: ${sql}`);
          },
          async run() {
            throw new Error(`unexpected run sql: ${sql}`);
          },
        };
      },
    };
  }

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
  } as unknown as D1Database;
}

/** Mock R2：objects 存章节 JSON 原文；reads 记录被读取的 key（验证提前终止） */
function createMockBucket(objects: Map<string, string>) {
  const reads: string[] = [];
  const bucket = {
    async get(key: string) {
      reads.push(key);
      const raw = objects.get(key);
      if (raw == null) return null;
      return { text: async () => raw };
    },
  };
  return { bucket: bucket as unknown as R2Bucket, reads };
}

function chapterJson(title: string, text: string): string {
  return JSON.stringify({ title, text });
}

function createApp(db: D1Database, bucket: R2Bucket) {
  const app = new Hono<{ Bindings: Env }>();
  // 与 index.ts 一致：booksRoutes 与 searchRoutes 同前缀挂载，
  // 顺带验证 search 子路径不被 booksRoutes 吞掉
  app.route("/api/books", booksRoutes);
  app.route("/api/books", searchRoutes);
  const env: Env = {
    DB: db,
    BOOKS_BUCKET: bucket,
    SESSION_SECRET: "test-session-secret",
  };
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init, env);
    },
  };
}

const authedHeaders = { Cookie: `${SESSION_COOKIE}=any-token` };

function searchUrl(bookId: string, q: string): string {
  return `/api/books/${bookId}/search?q=${encodeURIComponent(q)}`;
}

describe("search route", () => {
  let chapters: Map<string, ChapterSeed[]>;
  let objects: Map<string, string>;

  beforeEach(() => {
    chapters = new Map();
    objects = new Map();
  });

  function setup() {
    const db = createMockDb(chapters);
    const { bucket, reads } = createMockBucket(objects);
    const app = createApp(db, bucket);
    return { app, reads };
  }

  /** 预置一章正文（默认写入 MY_BOOK） */
  function seedChapter(
    idx: number,
    title: string,
    text: string,
    bookId: string = MY_BOOK,
  ) {
    const key = `ch/${bookId}/${idx}`;
    const list = chapters.get(bookId) ?? [];
    list.push({ idx, title, r2_key: key });
    chapters.set(bookId, list);
    objects.set(key, chapterJson(title, text));
  }

  it("未登录返回 401", async () => {
    const { app } = setup();
    const res = await app.request(searchUrl(MY_BOOK, "关键词"));
    expect(res.status).toBe(401);
  });

  it("他人书籍返回 404 NOT_FOUND", async () => {
    const { app } = setup();
    const res = await app.request(searchUrl(OTHER_BOOK, "关键词"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("关键词过短/过长/缺失返回 400 INVALID_QUERY", async () => {
    const { app } = setup();

    const short = await app.request(searchUrl(MY_BOOK, "雨"), {
      headers: authedHeaders,
    });
    expect(short.status).toBe(400);
    expect(
      ((await short.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_QUERY");

    const long = await app.request(searchUrl(MY_BOOK, "长".repeat(51)), {
      headers: authedHeaders,
    });
    expect(long.status).toBe(400);

    // 仅空白：trim 后为空
    const blank = await app.request(searchUrl(MY_BOOK, "   "), {
      headers: authedHeaders,
    });
    expect(blank.status).toBe(400);

    const missing = await app.request(`/api/books/${MY_BOOK}/search`, {
      headers: authedHeaders,
    });
    expect(missing.status).toBe(400);
  });

  it("pdf 格式返回 400 UNSUPPORTED_FORMAT", async () => {
    const { app } = setup();
    const res = await app.request(searchUrl(PDF_BOOK, "关键词"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("多章命中按章节顺序返回，charOffset 与 keywordStart 对齐", async () => {
    seedChapter(0, "第一章", "清晨的细雨落下，雨声潺潺，敲打着屋檐。");
    seedChapter(1, "第二章", "午后无事，读书写字，窗外一片安静。");
    seedChapter(2, "第三章", "夜里又起风了，隐约的雨声从远处传来。");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "雨声"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookSearchResult;

    expect(body.query).toBe("雨声");
    expect(body.truncated).toBe(false);
    expect(body.matches.map((m) => m.chapterIndex)).toEqual([0, 2]);
    expect(body.matches[0]!.chapterTitle).toBe("第一章");
    expect(body.matches[1]!.chapterTitle).toBe("第三章");

    for (const m of body.matches) {
      // excerpt 中 keywordStart 切片即关键词
      expect(m.excerpt.slice(m.keywordStart, m.keywordStart + 2)).toBe(
        "雨声",
      );
    }
    // charOffset 指向原文命中点
    expect(body.matches[0]!.charOffset).toBe(
      "清晨的细雨落下，雨声潺潺，敲打着屋檐。".indexOf("雨声"),
    );
  });

  it("大小写不敏感命中，摘录保留原文大小写", async () => {
    seedChapter(0, "Chapter 1", "He said Hello World loudly, then left.");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "hello world"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(1);
    const m = body.matches[0]!;
    expect(m.excerpt.slice(m.keywordStart, m.keywordStart + 11)).toBe(
      "Hello World",
    );
  });

  it("摘录中的换行折叠为空格且高亮切片不错位", async () => {
    seedChapter(0, "第一章", "第一段结束。\n\n第二段开始，这里有雨声出现。\n第三段。");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "雨声"), {
      headers: authedHeaders,
    });
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(1);
    const m = body.matches[0]!;
    expect(m.excerpt).not.toMatch(/\n/);
    expect(m.excerpt.slice(m.keywordStart, m.keywordStart + 2)).toBe("雨声");
  });

  it("单章命中超过 5 条时截断为 5 条", async () => {
    seedChapter(0, "第一章", "咒语咒语咒语咒语咒语咒语咒语咒语");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "咒语"), {
      headers: authedHeaders,
    });
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(5);
    // 8 处命中只留前 5 处；全书未达 50 条上限，不算截断
    expect(body.truncated).toBe(false);
  });

  it("全书命中达 50 条即截断并停止读取后续章节", async () => {
    // 12 章、每章 6 处命中：前 10 章即凑满 50 条，第二批（章 10、11）不应再读 R2
    for (let i = 0; i < 12; i++) {
      seedChapter(i, `第 ${i + 1} 章`, "咒语。".repeat(6));
    }
    const { app, reads } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "咒语"), {
      headers: authedHeaders,
    });
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(50);
    expect(body.truncated).toBe(true);
    expect(reads).toHaveLength(10);
    expect(reads).not.toContain(`ch/${MY_BOOK}/10`);
    expect(reads).not.toContain(`ch/${MY_BOOK}/11`);
  });

  it("R2 缺失或损坏的章节跳过，不中断整体搜索", async () => {
    seedChapter(0, "第一章", "开头就有雨声。");
    seedChapter(1, "第二章", "这章正文将缺失。");
    seedChapter(2, "第三章", "这章正文将损坏，雨声也搜不到。");
    seedChapter(3, "第四章", "结尾又是雨声。");
    // 章 1 缺失、章 2 损坏
    objects.delete(`ch/${MY_BOOK}/1`);
    objects.set(`ch/${MY_BOOK}/2`, "{ 不是合法 JSON");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "雨声"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookSearchResult;
    expect(body.matches.map((m) => m.chapterIndex)).toEqual([0, 3]);
  });

  it("md 书 charOffset 换算为渲染近似口径，与 char_count 同坐标系", async () => {
    // 源文 "# 第一章\n\n窗外传来雨声。"：源文命中索引为 11（含 "# " 与空行），
    // 渲染近似口径去掉标题标记后应为 9
    seedChapter(0, "第一章", "# 第一章\n\n窗外传来雨声。", MD_BOOK);
    const { app } = setup();

    const res = await app.request(searchUrl(MD_BOOK, "雨声"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(1);
    const m = body.matches[0]!;
    expect(m.charOffset).toBe(9);
    // 摘录仍按源文切片，keywordStart 对齐不受换算影响
    expect(m.excerpt.slice(m.keywordStart, m.keywordStart + 2)).toBe("雨声");
  });

  it("摘录窗口切在 emoji 中间时去掉残缺半字符", async () => {
    // "b😀" + 29 个 a + 命中词：窗口起点恰落在 😀 代理对中间
    seedChapter(0, "第一章", `b\u{1F600}${"a".repeat(29)}雨声出现。`);
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "雨声"), {
      headers: authedHeaders,
    });
    const body = (await res.json()) as BookSearchResult;

    expect(body.matches).toHaveLength(1);
    const m = body.matches[0]!;
    // 残缺的半个 emoji 不应留在摘录里
    expect(m.excerpt.startsWith("a")).toBe(true);
    expect(m.excerpt).not.toMatch(/[\uD800-\uDFFF]/);
    expect(m.excerpt.slice(m.keywordStart, m.keywordStart + 2)).toBe("雨声");
  });

  it("无命中返回空结果", async () => {
    seedChapter(0, "第一章", "今天天气不错。");
    const { app } = setup();

    const res = await app.request(searchUrl(MY_BOOK, "不存在的词"), {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookSearchResult;
    expect(body.matches).toEqual([]);
    expect(body.truncated).toBe(false);
  });
});
