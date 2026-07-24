import type {
  ApiErrorBody,
  BookDetail,
  BookmarkDto,
  BookSummary,
  ChapterContent,
  ReadingProgress,
  UserPreferences,
  UserPublic,
} from "@yudu/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
  /\/$/,
  "",
) ?? "";

function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // FormData 需由浏览器自动设置 multipart boundary，不可强行 application/json
  if (
    init?.body != null &&
    !headers.has("Content-Type") &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      if (!res.ok) {
        throw new ApiError(res.status, "INVALID_RESPONSE", text || res.statusText);
      }
      throw new ApiError(res.status, "INVALID_RESPONSE", "响应不是合法 JSON");
    }
  }

  if (!res.ok) {
    const body = data as ApiErrorBody | undefined;
    const code = body?.error?.code ?? "UNKNOWN";
    const message =
      body?.error?.message ?? (res.statusText || "请求失败");
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}

export function getMe(): Promise<UserPublic> {
  return api<UserPublic>("/api/me");
}

export function login(email: string, password: string): Promise<UserPublic> {
  return api<UserPublic>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string): Promise<UserPublic> {
  return api<UserPublic>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return api<void>("/api/auth/logout", { method: "POST" });
}

export function listBooks(): Promise<BookSummary[]> {
  return api<BookSummary[]>("/api/books");
}

/** 批量导入；单文件也可。响应始终为 BookSummary[]（同批「书名-序号」会合并） */
export async function importBooks(files: File[]): Promise<BookSummary[]> {
  if (!files.length) {
    throw new ApiError(400, "MISSING_FILE", "请选择文件");
  }
  const form = new FormData();
  for (const file of files) {
    // 同时带 files 与 file，兼容旧服务端
    form.append("files", file);
  }
  // 单文件时再带一份 file，兼容性更好
  if (files.length === 1) {
    form.append("file", files[0]!);
  }
  const data = await api<BookSummary[] | BookSummary>("/api/books/import", {
    method: "POST",
    body: form,
  });
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "id" in data) return [data];
  throw new ApiError(500, "INVALID_RESPONSE", "导入响应格式异常");
}

/** @deprecated 使用 importBooks */
export function importBook(file: File): Promise<BookSummary[]> {
  return importBooks([file]);
}

export function deleteBook(bookId: string): Promise<void> {
  return api<void>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "DELETE",
  });
}

/** 从源文件重新解析 Markdown 书 */
export function reparseBook(bookId: string): Promise<BookSummary> {
  return api<BookSummary>(
    `/api/books/${encodeURIComponent(bookId)}/reparse`,
    { method: "POST" },
  );
}

export function getBook(bookId: string): Promise<BookDetail> {
  return api<BookDetail>(`/api/books/${encodeURIComponent(bookId)}`);
}

export function getChapter(
  bookId: string,
  index: number,
): Promise<ChapterContent> {
  return api<ChapterContent>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${index}`,
  );
}

export function getProgress(bookId: string): Promise<ReadingProgress> {
  return api<ReadingProgress>(
    `/api/progress/${encodeURIComponent(bookId)}`,
  );
}

export function putProgress(
  bookId: string,
  body: {
    chapterIndex: number;
    charOffset: number;
    pageInChapter?: number | null;
  },
): Promise<ReadingProgress> {
  return api<ReadingProgress>(
    `/api/progress/${encodeURIComponent(bookId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export function getPreferences(): Promise<UserPreferences> {
  return api<UserPreferences>("/api/preferences");
}

export function putPreferences(
  body: Partial<UserPreferences>,
): Promise<UserPreferences> {
  return api<UserPreferences>("/api/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function listBookmarks(bookId: string): Promise<BookmarkDto[]> {
  return api<BookmarkDto[]>(
    `/api/books/${encodeURIComponent(bookId)}/bookmarks`,
  );
}

/** 创建书签；同锚点重复创建时服务端幂等返回已有记录 */
export function createBookmark(
  bookId: string,
  body: { chapterIndex: number; charOffset: number; label: string },
): Promise<BookmarkDto> {
  return api<BookmarkDto>(
    `/api/books/${encodeURIComponent(bookId)}/bookmarks`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function deleteBookmark(bookId: string, id: string): Promise<void> {
  return api<void>(
    `/api/books/${encodeURIComponent(bookId)}/bookmarks/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
