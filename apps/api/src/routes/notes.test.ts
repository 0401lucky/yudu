import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { SESSION_COOKIE } from "@yudu/shared";
import type { Env } from "../env";
import { notesRoutes } from "./notes";

type NoteRow = {
  id: string;
  book_id: string;
  chapter_index: number;
  start_offset: number;
  end_offset: number;
  color: string;
  excerpt: string;
  note: string | null;
  created_at: number;
  book_title: string;
  book_author: string | null;
  chapter_title: string | null;
};

const USER_ID = "user-1";

/**
 * Mock D1：
 * - sessions 查询无条件返回 user-1 的有效会话（带 Cookie 即视为已登录）
 * - 笔记汇总大查询按内存行数组回放（越权隔离由 WHERE user_id 模拟）
 */
function createMockDb(rowsByUser: Map<string, NoteRow[]>) {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("FROM sessions") && sql.includes("token_hash")) {
                return { id: "sess-1", user_id: USER_ID } as T;
              }
              throw new Error(`unexpected first sql: ${sql}`);
            },
            async all<T>() {
              if (sql.includes("FROM highlights") && sql.includes("JOIN books")) {
                const [userId] = args as [string];
                const rows = [...(rowsByUser.get(userId) ?? [])].sort(
                  (a, b) =>
                    a.book_title.localeCompare(b.book_title) ||
                    a.chapter_index - b.chapter_index ||
                    a.start_offset - b.start_offset,
                );
                return { results: rows as T[] };
              }
              throw new Error(`unexpected all sql: ${sql}`);
            },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/notes", notesRoutes);
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

const authedHeaders = { Cookie: `${SESSION_COOKIE}=any-token` };

function row(partial: Partial<NoteRow> & { id: string }): NoteRow {
  return {
    book_id: "book-a",
    chapter_index: 0,
    start_offset: 0,
    end_offset: 5,
    color: "yellow",
    excerpt: `摘录 ${partial.id}`,
    note: null,
    created_at: 1700000000000,
    book_title: "书 A",
    book_author: null,
    chapter_title: "第一章 起始",
    ...partial,
  };
}

describe("notes routes", () => {
  let rowsByUser: Map<string, NoteRow[]>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    rowsByUser = new Map();
    app = createApp(createMockDb(rowsByUser));
  });

  it("未登录访问返回 401", async () => {
    const res = await app.request("/api/notes");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("无任何高亮时返回空数组", async () => {
    const res = await app.request("/api/notes", { headers: authedHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("按书分组、组内按章序与起点排序，字段为 camelCase 且带 note", async () => {
    rowsByUser.set(USER_ID, [
      row({
        id: "h-1",
        book_id: "book-a",
        chapter_index: 2,
        start_offset: 100,
        end_offset: 130,
        note: "有想法",
        book_title: "书 A",
        book_author: "作者甲",
        chapter_title: "第三章",
      }),
      row({
        id: "h-2",
        book_id: "book-a",
        chapter_index: 0,
        start_offset: 10,
        end_offset: 20,
        book_title: "书 A",
        book_author: "作者甲",
        chapter_title: "第一章",
      }),
      row({
        id: "h-3",
        book_id: "book-b",
        chapter_index: 1,
        start_offset: 5,
        end_offset: 9,
        color: "blue",
        book_title: "书 B",
        chapter_title: "第二章",
      }),
    ]);

    const res = await app.request("/api/notes", { headers: authedHeaders });
    expect(res.status).toBe(200);
    const groups = (await res.json()) as {
      bookId: string;
      bookTitle: string;
      bookAuthor: string | null;
      highlights: {
        id: string;
        chapterIndex: number;
        startOffset: number;
        color: string;
        note: string | null;
        chapterTitle: string;
      }[];
    }[];

    expect(groups).toHaveLength(2);
    expect(groups[0]!.bookId).toBe("book-a");
    expect(groups[0]!.bookTitle).toBe("书 A");
    expect(groups[0]!.bookAuthor).toBe("作者甲");
    // 组内按章序 + 起点排序
    expect(groups[0]!.highlights.map((h) => h.id)).toEqual(["h-2", "h-1"]);
    expect(groups[0]!.highlights[1]!.note).toBe("有想法");
    expect(groups[0]!.highlights[1]!.chapterTitle).toBe("第三章");
    expect(groups[0]!.highlights[0]!.note).toBeNull();

    expect(groups[1]!.bookId).toBe("book-b");
    expect(groups[1]!.bookAuthor).toBeNull();
    expect(groups[1]!.highlights[0]!.color).toBe("blue");
    expect(groups[1]!.highlights[0]!.chapterTitle).toBe("第二章");
  });

  it("chapters 缺失或标题为空时章节标题兜底「第 N 章」", async () => {
    rowsByUser.set(USER_ID, [
      row({ id: "h-1", chapter_index: 4, chapter_title: null }),
      row({
        id: "h-2",
        chapter_index: 0,
        start_offset: 50,
        chapter_title: "   ",
      }),
    ]);

    const res = await app.request("/api/notes", { headers: authedHeaders });
    const groups = (await res.json()) as {
      highlights: { id: string; chapterTitle: string }[];
    }[];
    const byId = new Map(
      groups[0]!.highlights.map((h) => [h.id, h.chapterTitle]),
    );
    expect(byId.get("h-1")).toBe("第 5 章");
    expect(byId.get("h-2")).toBe("第 1 章");
  });

  it("仅返回当前用户的高亮（他人数据隔离）", async () => {
    rowsByUser.set(USER_ID, [row({ id: "mine" })]);
    rowsByUser.set("user-2", [
      row({ id: "theirs", book_id: "book-x", book_title: "别人的书" }),
    ]);

    const res = await app.request("/api/notes", { headers: authedHeaders });
    const groups = (await res.json()) as {
      highlights: { id: string }[];
    }[];
    expect(groups).toHaveLength(1);
    expect(groups[0]!.highlights.map((h) => h.id)).toEqual(["mine"]);
  });
});
