import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import {
  importBooksBatch,
  reparseBook,
  type UploadFile,
} from "./importBook";

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

type R2Entry = { value: Uint8Array | string; contentType?: string };

/**
 * 内存 mock：覆盖 importBooksBatch（pdf 短路分支 + 文本建书路径）与
 * reparseBook 前置校验所需的全部 SQL / R2 调用。
 */
function createMockEnv() {
  const books = new Map<string, BookRow>();
  const chapters: ChapterRow[] = [];
  const r2 = new Map<string, R2Entry>();

  function execWrite(sql: string, args: unknown[]) {
    if (sql.includes("INSERT INTO books") && sql.includes("'pdf'")) {
      const [id, userId, title, sourceKey, createdAt, updatedAt] = args as [
        string,
        string,
        string,
        string,
        number,
        number,
      ];
      books.set(id, {
        id,
        user_id: userId,
        title,
        author: null,
        format: "pdf",
        cover_r2_key: null,
        source_r2_key: sourceKey,
        status: "processing",
        error_message: null,
        chapter_count: 0,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { success: true };
    }
    if (sql.includes("INSERT INTO books")) {
      const [id, userId, title, format, sourceKey, createdAt, updatedAt] =
        args as [string, string, string, string, string, number, number];
      books.set(id, {
        id,
        user_id: userId,
        title,
        author: null,
        format,
        cover_r2_key: null,
        source_r2_key: sourceKey,
        status: "processing",
        error_message: null,
        chapter_count: 0,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { success: true };
    }
    if (sql.includes("UPDATE books SET") && sql.includes("title = ?")) {
      // createBookFromGroup 完成（batch 内）
      const [title, author, coverKey, count, updatedAt, id, userId] = args as [
        string,
        string | null,
        string,
        number,
        number,
        string,
        string,
      ];
      const b = books.get(id);
      if (b && b.user_id === userId) {
        b.title = title;
        b.author = author;
        b.cover_r2_key = coverKey;
        b.status = "ready";
        b.error_message = null;
        b.chapter_count = count;
        b.updated_at = updatedAt;
      }
      return { success: true };
    }
    if (
      sql.includes("UPDATE books SET") &&
      sql.includes("cover_r2_key = ?") &&
      sql.includes("status = 'ready'")
    ) {
      // createPdfBook 完成
      const [coverKey, updatedAt, id, userId] = args as [
        string,
        number,
        string,
        string,
      ];
      const b = books.get(id);
      if (b && b.user_id === userId) {
        b.cover_r2_key = coverKey;
        b.status = "ready";
        b.error_message = null;
        b.updated_at = updatedAt;
      }
      return { success: true };
    }
    if (sql.includes("UPDATE books SET status = 'failed'")) {
      const [message, updatedAt, id] = args as [string, number, string];
      const b = books.get(id);
      if (b) {
        b.status = "failed";
        b.error_message = message;
        b.updated_at = updatedAt;
      }
      return { success: true };
    }
    if (sql.includes("INSERT INTO chapters")) {
      const [id, bookId, idx, title, r2KeyStr, charCount] = args as [
        string,
        string,
        number,
        string,
        string,
        number,
      ];
      chapters.push({
        id,
        book_id: bookId,
        idx,
        title,
        r2_key: r2KeyStr,
        char_count: charCount,
      });
      return { success: true };
    }
    if (sql.includes("DELETE FROM chapters")) {
      const bookId = args[0] as string;
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (chapters[i]!.book_id === bookId) chapters.splice(i, 1);
      }
      return { success: true };
    }
    throw new Error(`unexpected run: ${sql}`);
  }

  function execFirst(sql: string, args: unknown[]): unknown {
    if (
      sql.includes("FROM books") &&
      sql.includes("status = 'ready'") &&
      sql.includes("title = ?")
    ) {
      // findReadyBookByTitle（含 format != 'pdf' 过滤）
      const [userId, title] = args as [string, string];
      const excludePdf = sql.includes("format != 'pdf'");
      const rows = [...books.values()]
        .filter(
          (b) =>
            b.user_id === userId &&
            b.status === "ready" &&
            b.title === title &&
            (!excludePdf || b.format !== "pdf"),
        )
        .sort((a, b) => b.updated_at - a.updated_at);
      return rows[0] ?? null;
    }
    if (sql.includes("FROM books WHERE id = ? AND user_id = ?")) {
      const [id, userId] = args as [string, string];
      const b = books.get(id);
      return b && b.user_id === userId ? b : null;
    }
    throw new Error(`unexpected first: ${sql}`);
  }

  function execAll(sql: string, args: unknown[]): unknown[] {
    if (sql.includes("FROM chapters")) {
      const bookId = args[0] as string;
      return chapters
        .filter((c) => c.book_id === bookId)
        .sort((a, b) => a.idx - b.idx);
    }
    throw new Error(`unexpected all: ${sql}`);
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              return execWrite(sql, args);
            },
            async first<T>() {
              return execFirst(sql, args) as T | null;
            },
            async all<T>() {
              return { results: execAll(sql, args) as T[] };
            },
          };
        },
      };
    },
    async batch(stmts: { run: () => Promise<unknown> }[]) {
      for (const s of stmts) {
        await s.run();
      }
      return [];
    },
  };

  const bucket = {
    async put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView,
      opts?: { httpMetadata?: { contentType?: string } },
    ) {
      let stored: Uint8Array | string;
      if (typeof value === "string") {
        stored = value;
      } else if (value instanceof ArrayBuffer) {
        stored = new Uint8Array(value.slice(0));
      } else {
        stored = new Uint8Array(
          value.buffer.slice(
            value.byteOffset,
            value.byteOffset + value.byteLength,
          ),
        );
      }
      r2.set(key, { value: stored, contentType: opts?.httpMetadata?.contentType });
    },
    async get(key: string) {
      const entry = r2.get(key);
      if (!entry) return null;
      const bytes =
        typeof entry.value === "string"
          ? new TextEncoder().encode(entry.value)
          : entry.value;
      return {
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        text: async () =>
          typeof entry.value === "string"
            ? entry.value
            : new TextDecoder().decode(entry.value),
      };
    },
    async list(opts: { prefix: string }) {
      const keys = [...r2.keys()].filter((k) => k.startsWith(opts.prefix));
      return {
        objects: keys.map((key) => ({ key })),
        truncated: false,
        cursor: undefined,
      };
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

  return { env, books, chapters, r2 };
}

const USER = "u1";

function pdfFile(name: string): UploadFile {
  // 后端不解析 PDF，字节内容只需非空
  return { name, bytes: new TextEncoder().encode("%PDF-1.4\n测试内容") };
}

function textFile(name: string, content: string): UploadFile {
  return { name, bytes: new TextEncoder().encode(content) };
}

describe("importBooksBatch — pdf 分支", () => {
  it("pdf 导入：ready、chapter_count=0、不写 chapters、源文件与封面入 R2", async () => {
    const { env, books, chapters, r2 } = createMockEnv();
    const summaries = await importBooksBatch(env, USER, [
      pdfFile("旅行笔记.pdf"),
    ]);

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.format).toBe("pdf");
    expect(s.status).toBe("ready");
    expect(s.title).toBe("旅行笔记");
    expect(s.chapterCount).toBe(0);
    expect(s.progressPercent).toBeNull();
    expect(s.coverUrl).toBe(`/api/books/${s.id}/cover`);

    const row = books.get(s.id)!;
    expect(row.format).toBe("pdf");
    expect(row.status).toBe("ready");
    expect(row.chapter_count).toBe(0);
    expect(row.source_r2_key).toBeTruthy();
    expect(chapters).toHaveLength(0);

    // 源文件以 application/pdf 存入 R2
    const source = r2.get(row.source_r2_key!)!;
    expect(source).toBeTruthy();
    expect(source.contentType).toBe("application/pdf");
    // 生成了占位封面
    expect(row.cover_r2_key).toBeTruthy();
    expect(r2.get(row.cover_r2_key!)).toBeTruthy();
  });

  it("同名 pdf 重复导入不合并：各自成书", async () => {
    const { env, books } = createMockEnv();
    const first = await importBooksBatch(env, USER, [pdfFile("周报.pdf")]);
    const second = await importBooksBatch(env, USER, [pdfFile("周报.pdf")]);

    expect(first[0]!.id).not.toBe(second[0]!.id);
    expect(books.size).toBe(2);
    for (const b of books.values()) {
      expect(b.format).toBe("pdf");
      expect(b.status).toBe("ready");
    }
  });

  it("带序号的 pdf 也不参与系列合并", async () => {
    const { env, books } = createMockEnv();
    const summaries = await importBooksBatch(env, USER, [
      pdfFile("手册-01.pdf"),
      pdfFile("手册-02.pdf"),
    ]);

    expect(summaries).toHaveLength(2);
    expect(books.size).toBe(2);
    const titles = summaries.map((s) => s.title).sort();
    expect(titles).toEqual(["手册-01", "手册-02"]);
  });

  it("已有同名 ready pdf 书时，序号 txt 不追加到 pdf 书", async () => {
    const { env, books } = createMockEnv();
    const [pdfBook] = await importBooksBatch(env, USER, [
      pdfFile("旅行笔记.pdf"),
    ]);

    const [txtBook] = await importBooksBatch(env, USER, [
      textFile("旅行笔记-02.txt", "第一章 出发\n这是一段正文内容。"),
    ]);

    // 新建 txt 书而非把章节塞进 pdf 书
    expect(txtBook!.id).not.toBe(pdfBook!.id);
    expect(txtBook!.format).toBe("txt");
    expect(books.get(pdfBook!.id)!.chapter_count).toBe(0);
    expect(books.get(pdfBook!.id)!.format).toBe("pdf");
  });

  it("空 pdf 文件抛 EMPTY_FILE", async () => {
    const { env } = createMockEnv();
    await expect(
      importBooksBatch(env, USER, [{ name: "空.pdf", bytes: new Uint8Array() }]),
    ).rejects.toMatchObject({ code: "EMPTY_FILE" });
  });

  it("R2 写入失败：书标 failed、错误信息可读、不写章节", async () => {
    const { env, books, chapters } = createMockEnv();
    (env.BOOKS_BUCKET as unknown as { put: () => Promise<never> }).put =
      async () => {
        throw new Error("R2 不可用");
      };

    const summaries = await importBooksBatch(env, USER, [pdfFile("报告.pdf")]);

    expect(summaries).toHaveLength(1);
    const s = summaries[0]!;
    expect(s.status).toBe("failed");
    expect(s.errorMessage).toContain("R2 不可用");
    expect(s.coverUrl).toBeNull();

    const row = books.get(s.id)!;
    expect(row.status).toBe("failed");
    expect(row.chapter_count).toBe(0);
    expect(chapters).toHaveLength(0);
  });
});

describe("importBooksBatch — txt/md/epub 回归", () => {
  it("txt 导入照常分章 ready", async () => {
    const { env, chapters } = createMockEnv();
    const content = [
      "第一章 开端",
      "这里是第一章的正文，字数足够成章。",
      "第二章 发展",
      "这里是第二章的正文，情节继续推进。",
    ].join("\n");
    const summaries = await importBooksBatch(env, USER, [
      textFile("样例书.txt", content),
    ]);

    expect(summaries[0]!.status).toBe("ready");
    expect(summaries[0]!.format).toBe("txt");
    expect(summaries[0]!.chapterCount).toBeGreaterThanOrEqual(1);
    expect(chapters.length).toBe(summaries[0]!.chapterCount);
  });

  it("md 导入照常 ready", async () => {
    const { env } = createMockEnv();
    const md = "## 第一章\n\n这是**加粗**正文。\n\n## 第二章\n\n继续。\n";
    const summaries = await importBooksBatch(env, USER, [
      textFile("笔记.md", md),
    ]);

    expect(summaries[0]!.status).toBe("ready");
    expect(summaries[0]!.format).toBe("md");
    expect(summaries[0]!.chapterCount).toBe(2);
  });

  it("epub 导入照常 ready", async () => {
    const { env } = createMockEnv();
    const summaries = await importBooksBatch(env, USER, [
      { name: "minimal.epub", bytes: MINIMAL_EPUB },
    ]);

    expect(summaries[0]!.status).toBe("ready");
    expect(summaries[0]!.format).toBe("epub");
    expect(summaries[0]!.chapterCount).toBeGreaterThanOrEqual(1);
  });

  it("pdf 与 txt 混合批次：各自建书互不影响", async () => {
    const { env, books } = createMockEnv();
    const summaries = await importBooksBatch(env, USER, [
      pdfFile("报告.pdf"),
      textFile("小说.txt", "第一章 序\n正文若干。"),
    ]);

    expect(summaries).toHaveLength(2);
    expect(books.size).toBe(2);
    const formats = summaries.map((s) => s.format).sort();
    expect(formats).toEqual(["pdf", "txt"]);
    for (const s of summaries) {
      expect(s.status).toBe("ready");
    }
  });
});

describe("reparseBook — pdf 拒绝", () => {
  it("pdf 书 reparse 抛 UNSUPPORTED_FORMAT(400)", async () => {
    const { env, books } = createMockEnv();
    books.set("b-pdf", {
      id: "b-pdf",
      user_id: USER,
      title: "报告",
      author: null,
      format: "pdf",
      cover_r2_key: null,
      source_r2_key: "users/u1/books/b-pdf/source/报告.pdf",
      status: "ready",
      error_message: null,
      chapter_count: 0,
      created_at: 1,
      updated_at: 1,
    });

    await expect(reparseBook(env, USER, "b-pdf")).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
      status: 400,
    });
  });
});

/** apps/api/fixtures/minimal.epub 的 base64（与 parsers/epub.test.ts 同源，避免依赖 node:fs） */
const MINIMAL_EPUB_B64 =
  "UEsDBBQAAAAAAKd061xvYassFAAAABQAAAAIAAAAbWltZXR5cGVhcHBsaWNhdGlvbi9lcHViK3ppcFBLAwQUAAAACACndOtcFrWz3K8AAAD8AAAAFgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWxdjsEKwjAQRO/9irBXqdWbhKYFQa8K6gfEdFuD6W5oUtG/N+1BiseBmfemrN+9Ey8cgmVSsF1vQCAZbix1Cm7XY76DuspKwxS1JRz+umlNQcE4kGQdbJCkewwyGskeqWEz9khRzjX5g0CVCVEOzLG1DsOUFlm0o3O51/Gh4HTYny/FNEyYNfsWRI+N1Xn8eFSgvXfW6JgOFYx3H9LMPHWHq2SEYtYUC085o+YPVfYFUEsDBBQAAAAIAKd061wSlY6VjQEAAKsCAAARAAAAT0VCUFMvY29udGVudC5vcGZVUr1u2zAQ3v0UBNdCopWlhSApQIcC3dsHYMmTRET8KUXWTqcsnTJ0ypYhU9ZkCYIMydM4Rh4jZ9qWnfF438/xu6tOl3ogf8CPypqaFvmcEjDCSmW6mv788S37Qk+bWeW4OOMdEESbsaZ9CK5kbLFY5Eq6Nre+Yyfz+WdmXUtJNOp3hExJMEG1CnxNv1p79l3Sg9MJOjUzQioNgUse+Fa6lGJSd9EPSVkKBgNoVBtZkRcsEZEqRXnwIEpONk30poxRyfI8yphpZZTmQwYu/qpQ7Yh1UAoqDNCsry9e7/+vbx5XL5erp9uE3nYmoPDAg/XN+uHy7e5q9Xz9dvEv4faNCTlw00VMrfnbJ8BUbxGbnxPDNdRUWAyGEmFNwMl2dYZDd0BZiontc9qGxo1qYQw7JRVAp/8f80jvod095c50lGiQimfh3KFjwrDNc9L/INJzV0x0LAL4Il/2QQ8fNbhzgxI84EJZan/CHU7zHo1YjU4ZIMHico1Y7ve3cUQTNJ2sij09MfDw2O7ymtk7UEsDBBQAAAAIAKd061xTRDjsQgEAAJ8BAAAUAAAAT0VCUFMvY2hhcHRlcjEueGh0bWxtkLtOwzAUhvc+xcFDCgM1EQttnHTgssJQBsa0tdKgXKzYalIhpApxGYqgUwVMSEgIqaFlQRQWHoYm4THIBRADk+Xf3+fz65B6YFvQpR43XUdFcmUFAXVabtt0DBXtNraW11BdK5GFje31xt7OJnSEbaX37IBUdbiKOkKwGsa+71f81YrrGViuVqs4yBiUsVRvayUAIkxhUS0Jw/msn4xvIRpOk4cBwUWeEVz0LAqix6iKBA0EbnGONAYHYOueYTo1kKmtwCHBOVk4Lc9k4q+0r3f1IkWablFPLJYDzstLqZWnaSdclCJNt93Lf+nI/xRLw+yNaZ/v1/HVVHKanCm/WHJzHD/exaOz6PQkmrx+9I8IZt9CBr2dx5PnaDgGyRJK9DSKB2F0+SIZQoH57AIk3WYKJOF9Gv64BBeF0tH5nr8AUEsDBBQAAAAIAKd061wmpJUHPwAAAEYAAAAPAAAAT0VCUFMvY292ZXIucG5n6wzwc+flkuJiYGDg9fRwCQLSjCDMwQYk5UWPdIIlXBxDKm4l/zl/IICfgaWVsaFlZY8iUILB09XPZZ1TQhMAUEsBAhQAFAAAAAAAp3TrXG9hqywUAAAAFAAAAAgAAAAAAAAAAAAAAAAAAAAAAG1pbWV0eXBlUEsBAhQAFAAAAAgAp3TrXBa1s9yvAAAA/AAAABYAAAAAAAAAAAAAAAAAOgAAAE1FVEEtSU5GL2NvbnRhaW5lci54bWxQSwECFAAUAAAACACndOtcEpWOlY0BAACrAgAAEQAAAAAAAAAAAAAAAAAdAQAAT0VCUFMvY29udGVudC5vcGZQSwECFAAUAAAACACndOtcU0Q47EIBAACfAQAAFAAAAAAAAAAAAAAAAADZAgAAT0VCUFMvY2hhcHRlcjEueGh0bWxQSwECFAAUAAAACACndOtcJqSVBz8AAABGAAAADwAAAAAAAAAAAAAAAABNBAAAT0VCUFMvY292ZXIucG5nUEsFBgAAAAAFAAUAOAEAALkEAAAAAA==";

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const MINIMAL_EPUB = fromBase64(MINIMAL_EPUB_B64);
