import type {
  AiProviderMeta,
  AiSettingsDto,
  AnnualReportResponse,
  ApiErrorBody,
  BookDetail,
  BookmarkDto,
  BookSearchResult,
  BookSummary,
  ChapterContent,
  DailyReadingStat,
  HighlightColor,
  HighlightDto,
  NotesBookGroup,
  ReadingProgress,
  ReadingStatsResponse,
  StudioAssets,
  StudioBookDetail,
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

/** 更新书籍分组；null / 空串 = 移出分组，返回更新后的摘要 */
export function updateBookGroup(
  bookId: string,
  group: string | null,
): Promise<BookSummary> {
  return api<BookSummary>(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "PATCH",
    body: JSON.stringify({ group }),
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

/** 拉取书籍原始源文件（当前仅 PDF 开放）；失败时解析错误体抛 ApiError */
export async function fetchBookSource(bookId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    apiUrl(`/api/books/${encodeURIComponent(bookId)}/source`),
    { credentials: "include" },
  );
  if (!res.ok) {
    let code = "UNKNOWN";
    let message = res.statusText || "源文件加载失败";
    try {
      const body = (await res.json()) as ApiErrorBody;
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // 非 JSON 错误体，保留默认文案
    }
    throw new ApiError(res.status, code, message);
  }
  return res.arrayBuffer();
}

/** 书内全文搜索（关键词 2-50 字符，大小写不敏感） */
export function searchBook(
  bookId: string,
  q: string,
): Promise<BookSearchResult> {
  return api<BookSearchResult>(
    `/api/books/${encodeURIComponent(bookId)}/search?q=${encodeURIComponent(q)}`,
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

export function listHighlights(bookId: string): Promise<HighlightDto[]> {
  return api<HighlightDto[]>(
    `/api/books/${encodeURIComponent(bookId)}/highlights`,
  );
}

/** 创建高亮；同锚点重复创建时服务端幂等返回已有记录 */
export function createHighlight(
  bookId: string,
  body: {
    chapterIndex: number;
    startOffset: number;
    endOffset: number;
    color: HighlightColor;
    excerpt: string;
  },
): Promise<HighlightDto> {
  return api<HighlightDto>(
    `/api/books/${encodeURIComponent(bookId)}/highlights`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

/** 修改高亮颜色 */
export function patchHighlightColor(
  bookId: string,
  id: string,
  color: HighlightColor,
): Promise<HighlightDto> {
  return api<HighlightDto>(
    `/api/books/${encodeURIComponent(bookId)}/highlights/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ color }),
    },
  );
}

/** 修改高亮笔记；null / 空串 = 清除笔记 */
export function updateHighlightNote(
  bookId: string,
  id: string,
  note: string | null,
): Promise<HighlightDto> {
  return api<HighlightDto>(
    `/api/books/${encodeURIComponent(bookId)}/highlights/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ note }),
    },
  );
}

/** 笔记汇总：当前用户全部高亮按书分组（含章节标题） */
export function getNotes(): Promise<NotesBookGroup[]> {
  return api<NotesBookGroup[]>("/api/notes");
}

export function deleteHighlight(bookId: string, id: string): Promise<void> {
  return api<void>(
    `/api/books/${encodeURIComponent(bookId)}/highlights/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** 上报阅读时长增量；date 为用户本地日期 YYYY-MM-DD，seconds 为 1–300 整数 */
export function postReadingTime(body: {
  date: string;
  seconds: number;
}): Promise<DailyReadingStat> {
  return api<DailyReadingStat>("/api/stats/reading", {
    method: "POST",
    body: JSON.stringify(body),
    // pagehide/关标签时的最后一笔 flush 依赖 keepalive 才能在页面卸载后送达
    keepalive: true,
  });
}

/** 查询近 N 天阅读时长（仅非零记录，稀疏数组） */
export function getReadingStats(days?: number): Promise<ReadingStatsResponse> {
  const query = days != null ? `?days=${days}` : "";
  return api<ReadingStatsResponse>(`/api/stats/reading${query}`);
}

/** 年度阅读报告；year 缺省为当前年（服务端限 2020–当前年） */
export function getAnnualReport(year?: number): Promise<AnnualReportResponse> {
  const query = year != null ? `?year=${year}` : "";
  return api<AnnualReportResponse>(`/api/stats/annual${query}`);
}

/* —— AI 提供商配置（跟随账号；密钥服务端加密存储） —— */

/** 提供商列表只带掩码，不含明文密钥 */
export function getAiSettings(): Promise<AiSettingsDto> {
  return api<AiSettingsDto>("/api/ai/settings");
}

export function putAiDefaults(body: {
  defaultProviderId: string | null;
  defaultModel: string | null;
}): Promise<{ defaultProviderId: string | null; defaultModel: string | null }> {
  return api("/api/ai/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** 新建；`id` 由调用方生成，迁移旧配置时必须原样传入以保住书级绑定 */
export function createAiProvider(body: {
  id?: string;
  name: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
  models?: string[];
  modelsFetchedAt?: number;
}): Promise<AiProviderMeta> {
  return api<AiProviderMeta>("/api/ai/providers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 局部更新；不传 `apiKey` 表示保留原密钥 */
export function patchAiProvider(
  id: string,
  body: {
    name?: string;
    protocol?: string;
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
    modelsFetchedAt?: number;
  },
): Promise<AiProviderMeta> {
  return api<AiProviderMeta>(`/api/ai/providers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteAiProvider(id: string): Promise<void> {
  return api<void>(`/api/ai/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** 取明文密钥；仅在即将调用第三方 AI 接口前调用 */
export async function getAiProviderKey(id: string): Promise<string> {
  const res = await api<{ apiKey: string }>(
    `/api/ai/providers/${encodeURIComponent(id)}/key`,
  );
  return res.apiKey;
}

/* —— AI 创作台 —— */

export function listStudioBooks(): Promise<BookSummary[]> {
  return api<BookSummary[]>("/api/studio/books");
}

export function createStudioBook(body?: {
  title?: string;
  breakLimit?: boolean;
}): Promise<BookSummary> {
  return api<BookSummary>("/api/studio/books", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function getStudioBook(bookId: string): Promise<StudioBookDetail> {
  return api<StudioBookDetail>(
    `/api/studio/books/${encodeURIComponent(bookId)}`,
  );
}

export function patchStudioBook(
  bookId: string,
  body: {
    title?: string;
    breakLimit?: boolean;
    author?: string | null;
    model?: string | null;
    providerId?: string | null;
  },
): Promise<BookSummary> {
  return api<BookSummary>(`/api/studio/books/${encodeURIComponent(bookId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function putStudioAssets(
  bookId: string,
  assets: StudioAssets,
): Promise<StudioAssets> {
  return api<StudioAssets>(
    `/api/studio/books/${encodeURIComponent(bookId)}/assets`,
    {
      method: "PUT",
      body: JSON.stringify(assets),
    },
  );
}

export function setStudioShelf(
  bookId: string,
  onShelf: boolean,
): Promise<BookSummary> {
  return api<BookSummary>(
    `/api/studio/books/${encodeURIComponent(bookId)}/shelf`,
    {
      method: "POST",
      body: JSON.stringify({ onShelf }),
    },
  );
}

/** 创作台写/更新指定章 */
export function putStudioChapter(
  bookId: string,
  index: number,
  body: { title?: string; text?: string },
): Promise<{ index: number; title: string; charCount: number }> {
  return api(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${index}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

/** 创作台追加一章 */
export function appendStudioChapter(
  bookId: string,
  body: { title?: string; text?: string },
): Promise<{ index: number; title: string; charCount: number }> {
  return api(`/api/books/${encodeURIComponent(bookId)}/chapters`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
