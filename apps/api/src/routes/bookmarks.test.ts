import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { bookmarksRoutes } from "./bookmarks";
import { booksRoutes } from "./books";

type BookmarkRow = {
  id: string;
  user_id: string;
  book_id: string;
  chapter_index: number;
  char_offset: number;
  label: string;
  created_at: number;
};

const USER_ID = "user-1";
const MY_BOOK = "book-1";
const OTHER_BOOK = "book-2"; // 归属 user-2

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - books 预置 user-1 的 book-1 与 user-2 的 book-2
 * - bookmarks 存内存 Map，模拟 UNIQUE 约束与 meta.changes
 */
function createMockDb() {
  const books = new Map<string, { id: string; user_id: string }>([
    [MY_BOOK, { id: MY_BOOK, user_id: USER_ID }],
    [OTHER_BOOK, { id: OTHER_BOOK, user_id: "user-2" }],
  ]);
  const bookmarks = new Map<string, BookmarkRow>();

  function anchorOf(row: {
    user_id: string;
    book_id: string;
    chapter_index: number;
    char_offset: number;
  }): string {
    return [row.user_id, row.book_id, row.chapter_index, row.char_offset].join(
      "|",
    );
  }

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT INTO bookmarks")) {
              const row: BookmarkRow = {
                id: args[0] as string,
                user_id: args[1] as string,
                book_id: args[2] as string,
                chapter_index: args[3] as number,
                char_offset: args[4] as number,
                label: args[5] as string,
                created_at: args[6] as number,
              };
              for (const existing of bookmarks.values()) {
                if (anchorOf(existing) === anchorOf(row)) {
                  throw new Error(
                    "UNIQUE constraint failed: bookmarks.user_id, bookmarks.book_id, bookmarks.chapter_index, bookmarks.char_offset",
                  );
                }
              }
              bookmarks.set(row.id, row);
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("DELETE FROM bookmarks")) {
              const [id, userId, bookId] = args as [string, string, string];
              const row = bookmarks.get(id);
              if (row && row.user_id === userId && row.book_id === bookId) {
                bookmarks.delete(id);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }
            throw new Error(`unexpected run sql: ${sql}`);
          },
          async first<T>() {
            if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
              return { id: "sess-1", user_id: USER_ID } as T;
            }
            if (sql.includes("FROM books")) {
              const [bookId, userId] = args as [string, string];
              const book = books.get(bookId);
              if (!book || book.user_id !== userId) return null;
              return { id: book.id } as T;
            }
            if (sql.includes("COUNT(*)") && sql.includes("FROM bookmarks")) {
              const [userId, bookId] = args as [string, string];
              let cnt = 0;
              for (const row of bookmarks.values()) {
                if (row.user_id === userId && row.book_id === bookId) cnt++;
              }
              return { cnt } as T;
            }
            if (
              sql.includes("FROM bookmarks") &&
              sql.includes("chapter_index = ?")
            ) {
              const [userId, bookId, chapterIndex, charOffset] = args as [
                string,
                string,
                number,
                number,
              ];
              for (const row of bookmarks.values()) {
                if (
                  row.user_id === userId &&
                  row.book_id === bookId &&
                  row.chapter_index === chapterIndex &&
                  row.char_offset === charOffset
                ) {
                  return {
                    id: row.id,
                    chapter_index: row.chapter_index,
                    char_offset: row.char_offset,
                    label: row.label,
                    created_at: row.created_at,
                  } as T;
                }
              }
              return null;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
          async all<T>() {
            if (sql.includes("FROM bookmarks") && sql.includes("ORDER BY")) {
              const [userId, bookId] = args as [string, string];
              const rows = [...bookmarks.values()]
                .filter(
                  (row) => row.user_id === userId && row.book_id === bookId,
                )
                .sort(
                  (a, b) =>
                    a.chapter_index - b.chapter_index ||
                    a.char_offset - b.char_offset,
                )
                .map((row) => ({
                  id: row.id,
                  chapter_index: row.chapter_index,
                  char_offset: row.char_offset,
                  label: row.label,
                  created_at: row.created_at,
                }));
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
    _bookmarks: bookmarks,
  };

  return db as unknown as D1Database & {
    _bookmarks: Map<string, BookmarkRow>;
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  // 与 index.ts 一致：booksRoutes 与 bookmarksRoutes 同前缀挂载，
  // 顺带验证书签子路径不被 booksRoutes 吞掉
  app.route("/api/books", booksRoutes);
  app.route("/api/books", bookmarksRoutes);
  const env: Env = {
    DB: db,
    BOOKS_BUCKET: {} as R2Bucket,
    SESSION_SECRET: "test-session-secret",
    AI_KEY_SECRET: "test-ai-key-secret",
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

function postBody(chapterIndex: number, charOffset: number, label = "书签") {
  return JSON.stringify({ chapterIndex, charOffset, label });
}

describe("bookmarks routes", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createMockDb();
    app = createApp(db);
  });

  it("未登录访问返回 401", async () => {
    const list = await app.request(`/api/books/${MY_BOOK}/bookmarks`);
    expect(list.status).toBe(401);

    const create = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: postBody(0, 0),
    });
    expect(create.status).toBe(401);

    const del = await app.request(`/api/books/${MY_BOOK}/bookmarks/x`, {
      method: "DELETE",
    });
    expect(del.status).toBe(401);
  });

  it("访问他人书籍返回 404 NOT_FOUND", async () => {
    const list = await app.request(`/api/books/${OTHER_BOOK}/bookmarks`, {
      headers: authedHeaders,
    });
    expect(list.status).toBe(404);
    const listBody = (await list.json()) as { error: { code: string } };
    expect(listBody.error.code).toBe("NOT_FOUND");

    const create = await app.request(`/api/books/${OTHER_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0),
    });
    expect(create.status).toBe(404);

    const del = await app.request(`/api/books/${OTHER_BOOK}/bookmarks/x`, {
      method: "DELETE",
      headers: authedHeaders,
    });
    expect(del.status).toBe(404);
  });

  it("创建成功返回 201 与 camelCase DTO，列表按章序与偏移排序", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(2, 300, "第三章 · 摘录"),
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as {
      id: string;
      chapterIndex: number;
      charOffset: number;
      label: string;
      createdAt: number;
    };
    expect(dto.id).toBeTruthy();
    expect(dto.chapterIndex).toBe(2);
    expect(dto.charOffset).toBe(300);
    expect(dto.label).toBe("第三章 · 摘录");
    expect(dto.createdAt).toBeGreaterThan(0);

    // 再插两条乱序锚点，验证列表排序
    await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 500, "开头"),
    });
    await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(2, 100, "第三章前段"),
    });

    const list = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      headers: authedHeaders,
    });
    expect(list.status).toBe(200);
    const items = (await list.json()) as {
      chapterIndex: number;
      charOffset: number;
    }[];
    expect(items.map((b) => [b.chapterIndex, b.charOffset])).toEqual([
      [0, 500],
      [2, 100],
      [2, 300],
    ]);
  });

  it("同锚点重复创建幂等返回 200 与已有记录", async () => {
    const first = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 600, "第一次"),
    });
    expect(first.status).toBe(201);
    const firstDto = (await first.json()) as { id: string };

    const second = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 600, "第二次"),
    });
    expect(second.status).toBe(200);
    const secondDto = (await second.json()) as { id: string; label: string };
    expect(secondDto.id).toBe(firstDto.id);
    // 返回已有记录，label 不被覆盖
    expect(secondDto.label).toBe("第一次");

    expect(db._bookmarks.size).toBe(1);
  });

  it("删除成功 204；重复删除或不存在的 id 返回 404", async () => {
    const create = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0),
    });
    const dto = (await create.json()) as { id: string };

    const del = await app.request(
      `/api/books/${MY_BOOK}/bookmarks/${dto.id}`,
      { method: "DELETE", headers: authedHeaders },
    );
    expect(del.status).toBe(204);
    expect(db._bookmarks.size).toBe(0);

    const again = await app.request(
      `/api/books/${MY_BOOK}/bookmarks/${dto.id}`,
      { method: "DELETE", headers: authedHeaders },
    );
    expect(again.status).toBe(404);
    const body = (await again.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("单书达到 200 条上限后拒绝新增，但同锚点仍幂等返回", async () => {
    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      db._bookmarks.set(`seed-${i}`, {
        id: `seed-${i}`,
        user_id: USER_ID,
        book_id: MY_BOOK,
        chapter_index: 0,
        char_offset: i,
        label: `书签 ${i}`,
        created_at: now,
      });
    }

    const res = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 0, "第 201 个"),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BOOKMARK_LIMIT");
    expect(db._bookmarks.size).toBe(200);

    // 已有锚点：幂等分支优先于上限
    const dup = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 5, "重复"),
    });
    expect(dup.status).toBe(200);
    const dupDto = (await dup.json()) as { id: string };
    expect(dupDto.id).toBe("seed-5");
  });

  it("非法参数返回 400 INVALID_BOOKMARK", async () => {
    const negative = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ chapterIndex: -1, charOffset: 0, label: "x" }),
    });
    expect(negative.status).toBe(400);
    expect(
      ((await negative.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_BOOKMARK");

    const fraction = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ chapterIndex: 0, charOffset: 1.5, label: "x" }),
    });
    expect(fraction.status).toBe(400);

    const emptyLabel = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({ chapterIndex: 0, charOffset: 0, label: "   " }),
    });
    expect(emptyLabel.status).toBe(400);

    const longLabel = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        charOffset: 0,
        label: "长".repeat(101),
      }),
    });
    expect(longLabel.status).toBe(400);
  });

  it("请求体不是合法 JSON 返回 400 INVALID_BODY", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_BODY");
  });

  it("插入时并发触发 UNIQUE 冲突，按幂等语义返回已有记录", async () => {
    // 预置同锚点书签，模拟并发请求抢先落库
    db._bookmarks.set("race-1", {
      id: "race-1",
      user_id: USER_ID,
      book_id: MY_BOOK,
      chapter_index: 3,
      char_offset: 77,
      label: "并发先到",
      created_at: Date.now(),
    });

    // 让第一次锚点预检查返回 null（模拟检查瞬间记录尚未写入），
    // 使 INSERT 抛 UNIQUE 后走 catch 分支的二次查询
    const rawPrepare = db.prepare.bind(db);
    type Stmt = ReturnType<typeof rawPrepare>;
    let probeSkipped = false;
    const patchable = db as unknown as { prepare: (sql: string) => Stmt };
    patchable.prepare = (sql: string) => {
      const stmt = rawPrepare(sql);
      const isAnchorQuery =
        sql.includes("FROM bookmarks") && sql.includes("chapter_index = ?");
      if (!isAnchorQuery || probeSkipped) return stmt;
      const patched = {
        bind(...args: unknown[]) {
          const bound = stmt.bind(...args);
          return {
            ...bound,
            async first<T>() {
              if (!probeSkipped) {
                probeSkipped = true;
                return null as T;
              }
              return bound.first<T>();
            },
          };
        },
      };
      return patched as unknown as Stmt;
    };

    const res = await app.request(`/api/books/${MY_BOOK}/bookmarks`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(3, 77, "并发后到"),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { id: string; label: string };
    expect(dto.id).toBe("race-1");
    expect(dto.label).toBe("并发先到");
    expect(db._bookmarks.size).toBe(1);
  });
});
