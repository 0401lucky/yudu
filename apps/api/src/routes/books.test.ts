import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { MAX_BOOK_GROUP_CHARS, SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { booksRoutes } from "./books";

type MockBook = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  format: string;
  cover_r2_key: string | null;
  status: string;
  error_message: string | null;
  chapter_count: number;
  created_at: number;
  updated_at: number;
  group_name: string | null;
  source: string;
  on_shelf: number;
  break_limit: number;
};

type MockProgress = {
  chapter_index: number;
  char_offset: number;
  updated_at: number;
};

const USER_ID = "user-1";
const MY_BOOK = "book-1"; // 无阅读进度
const READ_BOOK = "book-2"; // 有阅读进度
const OTHER_BOOK = "book-3"; // 归属 user-2

const NOW = 1_700_000_000_000;

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - books 预置 user-1 两本书（一本有进度）与 user-2 的一本书
 * - 仅覆盖书架列表 / PATCH 分组用到的 SQL 分支
 */
function createMockDb() {
  const books = new Map<string, MockBook>([
    [
      MY_BOOK,
      {
        id: MY_BOOK,
        user_id: USER_ID,
        title: "雨停之前",
        author: "林雨",
        format: "txt",
        cover_r2_key: null,
        status: "ready",
        error_message: null,
        chapter_count: 3,
        created_at: NOW - 2000,
        updated_at: NOW - 1000,
        group_name: null,
        source: "import",
        on_shelf: 1,
        break_limit: 0,
      },
    ],
    [
      READ_BOOK,
      {
        id: READ_BOOK,
        user_id: USER_ID,
        title: "长夜行",
        author: null,
        format: "epub",
        cover_r2_key: "cover-key",
        status: "ready",
        error_message: null,
        chapter_count: 10,
        created_at: NOW - 5000,
        updated_at: NOW - 4000,
        group_name: "武侠",
        source: "import",
        on_shelf: 1,
        break_limit: 0,
      },
    ],
    [
      OTHER_BOOK,
      {
        id: OTHER_BOOK,
        user_id: "user-2",
        title: "他人的书",
        author: null,
        format: "txt",
        cover_r2_key: null,
        status: "ready",
        error_message: null,
        chapter_count: 1,
        created_at: NOW,
        updated_at: NOW,
        group_name: null,
        source: "import",
        on_shelf: 1,
        break_limit: 0,
      },
    ],
  ]);

  // key: `${user_id}|${book_id}`
  const progress = new Map<string, MockProgress>([
    [
      `${USER_ID}|${READ_BOOK}`,
      { chapter_index: 2, char_offset: 100, updated_at: NOW - 300 },
    ],
  ]);

  function summaryRow(b: MockBook) {
    const p = progress.get(`${b.user_id}|${b.id}`) ?? null;
    return {
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      cover_r2_key: b.cover_r2_key,
      status: b.status,
      error_message: b.error_message,
      chapter_count: b.chapter_count,
      updated_at: b.updated_at,
      created_at: b.created_at,
      group_name: b.group_name,
      source: b.source,
      on_shelf: b.on_shelf,
      break_limit: b.break_limit,
      chapter_index: p?.chapter_index ?? null,
      char_offset: p?.char_offset ?? null,
      last_read_at: p?.updated_at ?? null,
      progress_char_count: null,
    };
  }

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("UPDATE books SET group_name")) {
              const [group, bookId, userId] = args as [
                string | null,
                string,
                string,
              ];
              const book = books.get(bookId);
              if (!book || book.user_id !== userId) {
                return { success: true, meta: { changes: 0 } };
              }
              book.group_name = group;
              return { success: true, meta: { changes: 1 } };
            }
            throw new Error(`unexpected run sql: ${sql}`);
          },
          async first<T>() {
            if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
              return { id: "sess-1", user_id: USER_ID } as T;
            }
            if (sql.includes("FROM books b") && sql.includes("b.id = ?")) {
              const [bookId, userId] = args as [string, string];
              const book = books.get(bookId);
              if (!book || book.user_id !== userId) return null;
              return summaryRow(book) as T;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
          async all<T>() {
            if (sql.includes("FROM books b") && sql.includes("b.user_id = ?")) {
              const [userId] = args as [string];
              const shelfOnly = sql.includes("on_shelf");
              const rows = [...books.values()]
                .filter((b) => b.user_id === userId)
                .filter((b) => (shelfOnly ? b.on_shelf === 1 : true))
                .sort((a, b) => b.updated_at - a.updated_at)
                .map(summaryRow);
              return { results: rows as T[] };
            }
            throw new Error(`unexpected all sql: ${sql}`);
          },
        };
      },
    };
  }

  const db = {
    prepare(sql: string) {
      return makeStmt(sql);
    },
    _books: books,
  };

  return db as unknown as D1Database & { _books: Map<string, MockBook> };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/books", booksRoutes);
  const env: Env = {
    DB: db,
    BOOKS_BUCKET: {} as R2Bucket,
    SESSION_SECRET: "test-session-secret",
  };
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init, env);
    },
  };
}

const authedHeaders = {
  Cookie: `${SESSION_COOKIE}=any-token`,
  "Content-Type": "application/json",
};

describe("books routes: 列表与分组", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createMockDb();
    app = createApp(db);
  });

  it("未登录访问返回 401", async () => {
    const list = await app.request("/api/books");
    expect(list.status).toBe(401);

    const patch = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "武侠" }),
    });
    expect(patch.status).toBe(401);
  });

  it("列表返回 createdAt / lastReadAt / group 字段", async () => {
    const res = await app.request("/api/books", { headers: authedHeaders });
    expect(res.status).toBe(200);
    const list = (await res.json()) as {
      id: string;
      createdAt: number;
      lastReadAt: number | null;
      group: string | null;
    }[];
    expect(list).toHaveLength(2);

    const unread = list.find((b) => b.id === MY_BOOK)!;
    expect(unread.createdAt).toBe(NOW - 2000);
    expect(unread.lastReadAt).toBeNull();
    expect(unread.group).toBeNull();

    const read = list.find((b) => b.id === READ_BOOK)!;
    expect(read.createdAt).toBe(NOW - 5000);
    expect(read.lastReadAt).toBe(NOW - 300);
    expect(read.group).toBe("武侠");
  });

  it("PATCH 设置分组成功，分组名 trim 后入库", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: "  科幻  " }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { id: string; group: string | null };
    expect(dto.id).toBe(MY_BOOK);
    expect(dto.group).toBe("科幻");
    expect(db._books.get(MY_BOOK)!.group_name).toBe("科幻");
  });

  it("PATCH null 或空串移出分组", async () => {
    const byNull = await app.request(`/api/books/${READ_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: null }),
    });
    expect(byNull.status).toBe(200);
    expect(((await byNull.json()) as { group: string | null }).group).toBeNull();
    expect(db._books.get(READ_BOOK)!.group_name).toBeNull();

    db._books.get(READ_BOOK)!.group_name = "武侠";
    const byEmpty = await app.request(`/api/books/${READ_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: "   " }),
    });
    expect(byEmpty.status).toBe(200);
    expect(
      ((await byEmpty.json()) as { group: string | null }).group,
    ).toBeNull();
    expect(db._books.get(READ_BOOK)!.group_name).toBeNull();
  });

  it("分组名超长或类型非法返回 400 INVALID_GROUP", async () => {
    const tooLong = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: "组".repeat(MAX_BOOK_GROUP_CHARS + 1) }),
    });
    expect(tooLong.status).toBe(400);
    expect(
      ((await tooLong.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_GROUP");

    // 恰好 30 字符应通过
    const maxLen = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: "组".repeat(MAX_BOOK_GROUP_CHARS) }),
    });
    expect(maxLen.status).toBe(200);

    const wrongType = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: 123 }),
    });
    expect(wrongType.status).toBe(400);
    expect(
      ((await wrongType.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_GROUP");

    const missing = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(
      ((await missing.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_GROUP");
  });

  it("请求体不是合法 JSON 返回 400 INVALID_BODY", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(
      ((await res.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_BODY");
  });

  it("修改他人书籍分组返回 404 NOT_FOUND 且不落库", async () => {
    const res = await app.request(`/api/books/${OTHER_BOOK}`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ group: "武侠" }),
    });
    expect(res.status).toBe(404);
    expect(
      ((await res.json()) as { error: { code: string } }).error.code,
    ).toBe("NOT_FOUND");
    expect(db._books.get(OTHER_BOOK)!.group_name).toBeNull();
  });
});
