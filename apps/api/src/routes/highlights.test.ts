import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { highlightsRoutes } from "./highlights";
import { booksRoutes } from "./books";

type HighlightRow = {
  id: string;
  user_id: string;
  book_id: string;
  chapter_index: number;
  start_offset: number;
  end_offset: number;
  color: string;
  excerpt: string;
  note: string | null;
  created_at: number;
};

const USER_ID = "user-1";
const MY_BOOK = "book-1";
const OTHER_BOOK = "book-2"; // 归属 user-2

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - books 预置 user-1 的 book-1 与 user-2 的 book-2
 * - highlights 存内存 Map，模拟 UNIQUE 约束与 meta.changes
 */
function createMockDb() {
  const books = new Map<string, { id: string; user_id: string }>([
    [MY_BOOK, { id: MY_BOOK, user_id: USER_ID }],
    [OTHER_BOOK, { id: OTHER_BOOK, user_id: "user-2" }],
  ]);
  const highlights = new Map<string, HighlightRow>();

  function anchorOf(row: {
    user_id: string;
    book_id: string;
    chapter_index: number;
    start_offset: number;
    end_offset: number;
  }): string {
    return [
      row.user_id,
      row.book_id,
      row.chapter_index,
      row.start_offset,
      row.end_offset,
    ].join("|");
  }

  function toResultRow(row: HighlightRow) {
    return {
      id: row.id,
      chapter_index: row.chapter_index,
      start_offset: row.start_offset,
      end_offset: row.end_offset,
      color: row.color,
      excerpt: row.excerpt,
      note: row.note,
      created_at: row.created_at,
    };
  }

  function makeStmt(sql: string) {
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            if (sql.includes("INSERT INTO highlights")) {
              const row: HighlightRow = {
                id: args[0] as string,
                user_id: args[1] as string,
                book_id: args[2] as string,
                chapter_index: args[3] as number,
                start_offset: args[4] as number,
                end_offset: args[5] as number,
                color: args[6] as string,
                excerpt: args[7] as string,
                note: args[8] as string | null,
                created_at: args[9] as number,
              };
              for (const existing of highlights.values()) {
                if (anchorOf(existing) === anchorOf(row)) {
                  throw new Error(
                    "UNIQUE constraint failed: highlights.user_id, highlights.book_id, highlights.chapter_index, highlights.start_offset, highlights.end_offset",
                  );
                }
              }
              highlights.set(row.id, row);
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE highlights")) {
              // 动态 SET：按 sql 中出现的列顺序消费 args，尾部固定 id/userId/bookId
              const values: Partial<Pick<HighlightRow, "color" | "note">> = {};
              let cursor = 0;
              if (sql.includes("color = ?")) {
                values.color = args[cursor++] as string;
              }
              if (sql.includes("note = ?")) {
                values.note = args[cursor++] as string | null;
              }
              const [id, userId, bookId] = args.slice(cursor) as [
                string,
                string,
                string,
              ];
              const row = highlights.get(id);
              if (row && row.user_id === userId && row.book_id === bookId) {
                Object.assign(row, values);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            }
            if (sql.includes("DELETE FROM highlights")) {
              const [id, userId, bookId] = args as [string, string, string];
              const row = highlights.get(id);
              if (row && row.user_id === userId && row.book_id === bookId) {
                highlights.delete(id);
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
            if (sql.includes("COUNT(*)") && sql.includes("FROM highlights")) {
              const [userId, bookId] = args as [string, string];
              let cnt = 0;
              for (const row of highlights.values()) {
                if (row.user_id === userId && row.book_id === bookId) cnt++;
              }
              return { cnt } as T;
            }
            // 按锚点查（幂等预检查 / 并发兜底二次查询）
            if (
              sql.includes("FROM highlights") &&
              sql.includes("start_offset = ?")
            ) {
              const [userId, bookId, chapterIndex, startOffset, endOffset] =
                args as [string, string, number, number, number];
              for (const row of highlights.values()) {
                if (
                  row.user_id === userId &&
                  row.book_id === bookId &&
                  row.chapter_index === chapterIndex &&
                  row.start_offset === startOffset &&
                  row.end_offset === endOffset
                ) {
                  return toResultRow(row) as T;
                }
              }
              return null;
            }
            // 按 id 查（PATCH 改色前置查询）
            if (sql.includes("FROM highlights") && sql.includes("id = ?")) {
              const [id, userId, bookId] = args as [string, string, string];
              const row = highlights.get(id);
              if (row && row.user_id === userId && row.book_id === bookId) {
                return toResultRow(row) as T;
              }
              return null;
            }
            throw new Error(`unexpected first sql: ${sql}`);
          },
          async all<T>() {
            if (sql.includes("FROM highlights") && sql.includes("ORDER BY")) {
              const [userId, bookId] = args as [string, string];
              const rows = [...highlights.values()]
                .filter(
                  (row) => row.user_id === userId && row.book_id === bookId,
                )
                .sort(
                  (a, b) =>
                    a.chapter_index - b.chapter_index ||
                    a.start_offset - b.start_offset,
                )
                .map(toResultRow);
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
    _highlights: highlights,
  };

  return db as unknown as D1Database & {
    _highlights: Map<string, HighlightRow>;
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  // 与 index.ts 一致：booksRoutes 与 highlightsRoutes 同前缀挂载，
  // 顺带验证高亮子路径不被 booksRoutes 吞掉
  app.route("/api/books", booksRoutes);
  app.route("/api/books", highlightsRoutes);
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

function postBody(
  chapterIndex: number,
  startOffset: number,
  endOffset: number,
  color = "yellow",
  excerpt = "摘录",
) {
  return JSON.stringify({ chapterIndex, startOffset, endOffset, color, excerpt });
}

function seedRow(
  id: string,
  chapterIndex: number,
  startOffset: number,
  endOffset: number,
  color = "yellow",
  note: string | null = null,
): HighlightRow {
  return {
    id,
    user_id: USER_ID,
    book_id: MY_BOOK,
    chapter_index: chapterIndex,
    start_offset: startOffset,
    end_offset: endOffset,
    color,
    excerpt: `摘录 ${id}`,
    note,
    created_at: Date.now(),
  };
}

describe("highlights routes", () => {
  let db: ReturnType<typeof createMockDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createMockDb();
    app = createApp(db);
  });

  it("未登录访问返回 401", async () => {
    const list = await app.request(`/api/books/${MY_BOOK}/highlights`);
    expect(list.status).toBe(401);

    const create = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: postBody(0, 0, 5),
    });
    expect(create.status).toBe(401);

    const patch = await app.request(`/api/books/${MY_BOOK}/highlights/x`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: "green" }),
    });
    expect(patch.status).toBe(401);

    const del = await app.request(`/api/books/${MY_BOOK}/highlights/x`, {
      method: "DELETE",
    });
    expect(del.status).toBe(401);
  });

  it("访问他人书籍返回 404 NOT_FOUND", async () => {
    const list = await app.request(`/api/books/${OTHER_BOOK}/highlights`, {
      headers: authedHeaders,
    });
    expect(list.status).toBe(404);
    const listBody = (await list.json()) as { error: { code: string } };
    expect(listBody.error.code).toBe("NOT_FOUND");

    const create = await app.request(`/api/books/${OTHER_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0, 5),
    });
    expect(create.status).toBe(404);

    const patch = await app.request(`/api/books/${OTHER_BOOK}/highlights/x`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ color: "green" }),
    });
    expect(patch.status).toBe(404);

    const del = await app.request(`/api/books/${OTHER_BOOK}/highlights/x`, {
      method: "DELETE",
      headers: authedHeaders,
    });
    expect(del.status).toBe(404);
  });

  it("创建成功返回 201 与 camelCase DTO，列表按章序与起点排序", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(2, 300, 320, "blue", "第三章的摘录"),
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as {
      id: string;
      chapterIndex: number;
      startOffset: number;
      endOffset: number;
      color: string;
      excerpt: string;
      createdAt: number;
    };
    expect(dto.id).toBeTruthy();
    expect(dto.chapterIndex).toBe(2);
    expect(dto.startOffset).toBe(300);
    expect(dto.endOffset).toBe(320);
    expect(dto.color).toBe("blue");
    expect(dto.excerpt).toBe("第三章的摘录");
    expect(dto.createdAt).toBeGreaterThan(0);

    // 再插两条乱序锚点，验证列表排序
    await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 500, 510),
    });
    await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(2, 100, 130, "green"),
    });

    const list = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      headers: authedHeaders,
    });
    expect(list.status).toBe(200);
    const items = (await list.json()) as {
      chapterIndex: number;
      startOffset: number;
    }[];
    expect(items.map((h) => [h.chapterIndex, h.startOffset])).toEqual([
      [0, 500],
      [2, 100],
      [2, 300],
    ]);
  });

  it("超长摘录截断到 120 字符存储", async () => {
    const res = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0, 200, "yellow", "长".repeat(200)),
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { excerpt: string };
    expect(dto.excerpt).toBe("长".repeat(120));
  });

  it("同锚点重复创建幂等返回 200 与已有记录", async () => {
    const first = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 600, 660, "yellow", "第一次"),
    });
    expect(first.status).toBe(201);
    const firstDto = (await first.json()) as { id: string };

    const second = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 600, 660, "green", "第二次"),
    });
    expect(second.status).toBe(200);
    const secondDto = (await second.json()) as {
      id: string;
      color: string;
      excerpt: string;
    };
    expect(secondDto.id).toBe(firstDto.id);
    // 返回已有记录，颜色与摘录不被覆盖
    expect(secondDto.color).toBe("yellow");
    expect(secondDto.excerpt).toBe("第一次");

    expect(db._highlights.size).toBe(1);
  });

  it("PATCH 改色成功返回更新后的 DTO；不存在的 id 返回 404", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20, "yellow"));

    const res = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ color: "blue" }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { id: string; color: string };
    expect(dto.id).toBe("h-1");
    expect(dto.color).toBe("blue");
    expect(db._highlights.get("h-1")?.color).toBe("blue");

    const missing = await app.request(
      `/api/books/${MY_BOOK}/highlights/nope`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({ color: "green" }),
      },
    );
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("PATCH 非法颜色返回 400 INVALID_HIGHLIGHT", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20));

    const res = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ color: "red" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_HIGHLIGHT");
    expect(db._highlights.get("h-1")?.color).toBe("yellow");
  });

  it("删除成功 204；重复删除或不存在的 id 返回 404", async () => {
    const create = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0, 5),
    });
    const dto = (await create.json()) as { id: string };

    const del = await app.request(
      `/api/books/${MY_BOOK}/highlights/${dto.id}`,
      { method: "DELETE", headers: authedHeaders },
    );
    expect(del.status).toBe(204);
    expect(db._highlights.size).toBe(0);

    const again = await app.request(
      `/api/books/${MY_BOOK}/highlights/${dto.id}`,
      { method: "DELETE", headers: authedHeaders },
    );
    expect(again.status).toBe(404);
    const body = (await again.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("单书达到 500 条上限后拒绝新增，但同锚点仍幂等返回", async () => {
    for (let i = 0; i < 500; i++) {
      db._highlights.set(`seed-${i}`, seedRow(`seed-${i}`, 0, i * 10, i * 10 + 5));
    }

    const res = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(1, 0, 5),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("HIGHLIGHT_LIMIT");
    expect(db._highlights.size).toBe(500);

    // 已有锚点：幂等分支优先于上限
    const dup = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 50, 55),
    });
    expect(dup.status).toBe(200);
    const dupDto = (await dup.json()) as { id: string };
    expect(dupDto.id).toBe("seed-5");
  });

  it("非法参数返回 400 INVALID_HIGHLIGHT", async () => {
    const cases: Record<string, unknown>[] = [
      // 负数偏移
      { chapterIndex: 0, startOffset: -1, endOffset: 5, color: "yellow", excerpt: "x" },
      // 小数偏移
      { chapterIndex: 0, startOffset: 0, endOffset: 1.5, color: "yellow", excerpt: "x" },
      // end <= start
      { chapterIndex: 0, startOffset: 5, endOffset: 5, color: "yellow", excerpt: "x" },
      // 选区超长（> 1000）
      { chapterIndex: 0, startOffset: 0, endOffset: 1001, color: "yellow", excerpt: "x" },
      // 颜色不在白名单
      { chapterIndex: 0, startOffset: 0, endOffset: 5, color: "red", excerpt: "x" },
      // 摘录不是字符串
      { chapterIndex: 0, startOffset: 0, endOffset: 5, color: "yellow", excerpt: 42 },
    ];
    for (const body of cases) {
      const res = await app.request(`/api/books/${MY_BOOK}/highlights`, {
        method: "POST",
        headers: authedHeaders,
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      expect(
        ((await res.json()) as { error: { code: string } }).error.code,
      ).toBe("INVALID_HIGHLIGHT");
    }
    expect(db._highlights.size).toBe(0);

    // 恰好 1000 字符的选区合法
    const ok = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 0, 1000),
    });
    expect(ok.status).toBe(201);
  });

  it("请求体不是合法 JSON 返回 400 INVALID_BODY", async () => {
    const create = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: "not-json",
    });
    expect(create.status).toBe(400);
    const createBody = (await create.json()) as { error: { code: string } };
    expect(createBody.error.code).toBe("INVALID_BODY");

    const patch = await app.request(`/api/books/${MY_BOOK}/highlights/x`, {
      method: "PATCH",
      headers: authedHeaders,
      body: "not-json",
    });
    expect(patch.status).toBe(400);
    const patchBody = (await patch.json()) as { error: { code: string } };
    expect(patchBody.error.code).toBe("INVALID_BODY");
  });

  it("插入时并发触发 UNIQUE 冲突，按幂等语义返回已有记录", async () => {
    // 预置同锚点高亮，模拟并发请求抢先落库
    db._highlights.set("race-1", seedRow("race-1", 3, 77, 90, "green"));

    // 让第一次锚点预检查返回 null（模拟检查瞬间记录尚未写入），
    // 使 INSERT 抛 UNIQUE 后走 catch 分支的二次查询
    const rawPrepare = db.prepare.bind(db);
    type Stmt = ReturnType<typeof rawPrepare>;
    let probeSkipped = false;
    const patchable = db as unknown as { prepare: (sql: string) => Stmt };
    patchable.prepare = (sql: string) => {
      const stmt = rawPrepare(sql);
      const isAnchorQuery =
        sql.includes("FROM highlights") && sql.includes("start_offset = ?");
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

    const res = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(3, 77, 90, "yellow", "并发后到"),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { id: string; color: string };
    expect(dto.id).toBe("race-1");
    expect(dto.color).toBe("green");
    expect(db._highlights.size).toBe(1);
  });

  it("创建带笔记：trim 存储；不带/空白笔记存 null", async () => {
    const withNote = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        startOffset: 0,
        endOffset: 5,
        color: "yellow",
        excerpt: "摘录",
        note: "  这段写得真好  ",
      }),
    });
    expect(withNote.status).toBe(201);
    const dto = (await withNote.json()) as { id: string; note: string | null };
    expect(dto.note).toBe("这段写得真好");
    expect(db._highlights.get(dto.id)?.note).toBe("这段写得真好");

    const noNote = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 10, 15),
    });
    expect(noNote.status).toBe(201);
    expect(((await noNote.json()) as { note: string | null }).note).toBeNull();

    const blankNote = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        startOffset: 20,
        endOffset: 25,
        color: "yellow",
        excerpt: "摘录",
        note: "   ",
      }),
    });
    expect(blankNote.status).toBe(201);
    expect(
      ((await blankNote.json()) as { note: string | null }).note,
    ).toBeNull();
  });

  it("创建时笔记超 500 字符或非字符串返回 400；恰 500 合法", async () => {
    const tooLong = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        startOffset: 0,
        endOffset: 5,
        color: "yellow",
        excerpt: "摘录",
        note: "长".repeat(501),
      }),
    });
    expect(tooLong.status).toBe(400);
    expect(
      ((await tooLong.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_HIGHLIGHT");

    const badType = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        startOffset: 0,
        endOffset: 5,
        color: "yellow",
        excerpt: "摘录",
        note: 42,
      }),
    });
    expect(badType.status).toBe(400);
    expect(
      ((await badType.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_HIGHLIGHT");
    expect(db._highlights.size).toBe(0);

    const exact = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: JSON.stringify({
        chapterIndex: 0,
        startOffset: 0,
        endOffset: 5,
        color: "yellow",
        excerpt: "摘录",
        note: "长".repeat(500),
      }),
    });
    expect(exact.status).toBe(201);
    expect(((await exact.json()) as { note: string | null }).note).toBe(
      "长".repeat(500),
    );
  });

  it("PATCH 更新笔记：只带 note 也可；颜色不受影响", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20, "green"));

    const res = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ note: " 新想法 " }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      id: string;
      color: string;
      note: string | null;
    };
    expect(dto.note).toBe("新想法");
    expect(dto.color).toBe("green");
    expect(db._highlights.get("h-1")?.note).toBe("新想法");
    expect(db._highlights.get("h-1")?.color).toBe("green");
  });

  it("PATCH note 为 null 或空串清除笔记（存 null）", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20, "yellow", "旧想法"));

    const byEmpty = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ note: "" }),
    });
    expect(byEmpty.status).toBe(200);
    expect(((await byEmpty.json()) as { note: string | null }).note).toBeNull();
    expect(db._highlights.get("h-1")?.note).toBeNull();

    db._highlights.set("h-2", seedRow("h-2", 1, 10, 20, "yellow", "旧想法"));
    const byNull = await app.request(`/api/books/${MY_BOOK}/highlights/h-2`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ note: null }),
    });
    expect(byNull.status).toBe(200);
    expect(((await byNull.json()) as { note: string | null }).note).toBeNull();
    expect(db._highlights.get("h-2")?.note).toBeNull();
  });

  it("PATCH 同时改色与改笔记；笔记超限或两者皆缺返回 400", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20, "yellow", "旧想法"));

    const both = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ color: "blue", note: "换个说法" }),
    });
    expect(both.status).toBe(200);
    const dto = (await both.json()) as { color: string; note: string | null };
    expect(dto.color).toBe("blue");
    expect(dto.note).toBe("换个说法");

    const tooLong = await app.request(`/api/books/${MY_BOOK}/highlights/h-1`, {
      method: "PATCH",
      headers: authedHeaders,
      body: JSON.stringify({ note: "长".repeat(501) }),
    });
    expect(tooLong.status).toBe(400);
    expect(
      ((await tooLong.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_HIGHLIGHT");
    // 校验失败不落库
    expect(db._highlights.get("h-1")?.note).toBe("换个说法");

    const emptyBody = await app.request(
      `/api/books/${MY_BOOK}/highlights/h-1`,
      {
        method: "PATCH",
        headers: authedHeaders,
        body: JSON.stringify({}),
      },
    );
    expect(emptyBody.status).toBe(400);
    expect(
      ((await emptyBody.json()) as { error: { code: string } }).error.code,
    ).toBe("INVALID_HIGHLIGHT");
  });

  it("列表与幂等返回均带 note 字段", async () => {
    db._highlights.set("h-1", seedRow("h-1", 0, 10, 20, "yellow", "有想法"));
    db._highlights.set("h-2", seedRow("h-2", 1, 10, 20, "green"));

    const list = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      headers: authedHeaders,
    });
    expect(list.status).toBe(200);
    const items = (await list.json()) as { id: string; note: string | null }[];
    expect(items.find((h) => h.id === "h-1")?.note).toBe("有想法");
    expect(items.find((h) => h.id === "h-2")?.note).toBeNull();

    // 同锚点幂等返回已有记录的 note
    const dup = await app.request(`/api/books/${MY_BOOK}/highlights`, {
      method: "POST",
      headers: authedHeaders,
      body: postBody(0, 10, 20),
    });
    expect(dup.status).toBe(200);
    expect(((await dup.json()) as { note: string | null }).note).toBe(
      "有想法",
    );
  });
});
