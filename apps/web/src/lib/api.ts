import type { ApiErrorBody, BookSummary, UserPublic } from "@yudu/shared";

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

  const res = await fetch(path, {
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

export function importBook(file: File): Promise<BookSummary> {
  const form = new FormData();
  form.append("file", file);
  return api<BookSummary>("/api/books/import", {
    method: "POST",
    body: form,
  });
}

export function deleteBook(bookId: string): Promise<void> {
  return api<void>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "DELETE",
  });
}
