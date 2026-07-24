import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { booksRoutes } from "./books";

const USER_ID = "user-1";
const PDF_BOOK = "book-pdf"; // user-1 的 pdf 书
const TXT_BOOK = "book-txt"; // user-1 的 txt 书
const LOST_BOOK = "book-lost"; // user-1 的 pdf 书但 R2 缺失
const OTHER_BOOK = "book-2"; // 归属 user-2 的 pdf 书

const PDF_KEY = `users/${USER_ID}/books/${PDF_BOOK}/source/sample.pdf`;
const LOST_KEY = `users/${USER_ID}/books/${LOST_BOOK}/source/lost.pdf`;

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n测试 PDF 内容");

/**
 * Mock D1：sessions 查询无条件返回 user-1 会话（带 Cookie 即视为已登录）；
 * books 预置 pdf / txt / 缺源 / 他人书。
 */
function createMockDb() {
  const books = new Map<
    string,
    { user_id: string; format: string; source_r2_key: string | null }
  >([
    [PDF_BOOK, { user_id: USER_ID, format: "pdf", source_r2_key: PDF_KEY }],
    [
      TXT_BOOK,
      {
        user_id: USER_ID,
        format: "txt",
        source_r2_key: `users/${USER_ID}/books/${TXT_BOOK}/source/a.txt`,
      },
    ],
    [LOST_BOOK, { user_id: USER_ID, format: "pdf", source_r2_key: LOST_KEY }],
    [OTHER_BOOK, { user_id: "user-2", format: "pdf", source_r2_key: "x" }],
  ]);

  return {
    prepare(sql: string) {
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
                return {
                  format: book.format,
                  source_r2_key: book.source_r2_key,
                } as T;
              }
              throw new Error(`unexpected first sql: ${sql}`);
            },
            async all() {
              throw new Error(`unexpected all sql: ${sql}`);
            },
            async run() {
              throw new Error(`unexpected run sql: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

/** Mock R2：仅 PDF_KEY 存在，返回 body 流 */
function createMockBucket() {
  return {
    async get(key: string) {
      if (key !== PDF_KEY) return null;
      return {
        body: new Blob([PDF_BYTES]).stream(),
        httpMetadata: { contentType: "application/pdf" },
      };
    },
  } as unknown as R2Bucket;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/books", booksRoutes);
  const env: Env = {
    DB: createMockDb(),
    BOOKS_BUCKET: createMockBucket(),
    SESSION_SECRET: "test-session-secret",
  };
  return {
    request(path: string, init?: RequestInit) {
      return app.request(path, init, env);
    },
  };
}

const authedHeaders = { Cookie: `${SESSION_COOKIE}=any-token` };

describe("GET /api/books/:id/source", () => {
  it("未登录返回 401", async () => {
    const app = createApp();
    const res = await app.request(`/api/books/${PDF_BOOK}/source`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("他人书籍返回 404 NOT_FOUND", async () => {
    const app = createApp();
    const res = await app.request(`/api/books/${OTHER_BOOK}/source`, {
      headers: authedHeaders,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("非 pdf 格式返回 404 NO_SOURCE", async () => {
    const app = createApp();
    const res = await app.request(`/api/books/${TXT_BOOK}/source`, {
      headers: authedHeaders,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NO_SOURCE");
  });

  it("R2 对象缺失返回 404 STORAGE_MISSING", async () => {
    const app = createApp();
    const res = await app.request(`/api/books/${LOST_BOOK}/source`, {
      headers: authedHeaders,
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("STORAGE_MISSING");
  });

  it("pdf 书成功返回原始字节流与响应头", async () => {
    const app = createApp();
    const res = await app.request(`/api/books/${PDF_BOOK}/source`, {
      headers: authedHeaders,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Cache-Control")).toContain("private");

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(PDF_BYTES);
  });
});
