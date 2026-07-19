# 类型安全 — @yudu/web

## 共享类型唯一来源

从 `@yudu/shared` 导入：

- `UserPublic`、`BookSummary`、`BookDetail`、`ChapterContent`、`ChapterMeta`
- `ReadingProgress`、`UserPreferences`、`ThemeId`、`ApiErrorBody`
- 常量：`MAX_UPLOAD_BYTES`、`SUPPORTED_FORMATS`、`SESSION_COOKIE` 等（前端校验可对齐）

**不要**在 web 内再定义一套 `interface Book { ... }` 与 API 并行。

## API 层类型

`lib/api.ts`：

```typescript
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T>
```

- 调用方指定 `T` 为 shared 类型：`api<BookSummary[]>`、`api<UserPublic>`
- 失败：解析 `ApiErrorBody`，抛 `ApiError`
- 204：返回 `undefined as T`
- `FormData` **不要**手动设 `Content-Type: application/json`

页面捕获：

```typescript
function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
```

（`LibraryPage` / `ReaderPage` 使用同类模式。）

## 组件 Props

- 显式 `interface XxxProps`；书籍用 `BookSummary` / `BookDetail`，勿 `book: any`
- 事件回调写清参数：`onDelete: (bookId: string) => void`

## 本地类型

仅前端关心的结构可留在 hooks：

- `Bookmark`（`useBookmarks.ts`）
- `LocalReaderPrefs` / `FontFamilyId`（`useLocalReaderPrefs.ts`）
- `PendingPage`（`ReaderPage` 内）

这些**不**进入 shared，除非后端也要契约。

## 环境变量

- `import.meta.env.VITE_API_BASE`：可选 API 前缀；默认 `""`（同源 `/api`）
- 类型声明：`src/vite-env.d.ts`

## 反模式

- `as any` 抹平 API 响应
- 用 `string` 表示 theme/status 而不用 shared 联合类型
- 在组件里 `JSON.parse` 后不校验数组/字段（书签 hook 至少 `Array.isArray`）
