# Hooks 约定 — @yudu/web

## 现有 hooks

| Hook | 文件 | 用途 |
|------|------|------|
| `useAuth` | `lib/auth.tsx` | 会话用户、login/register/logout/refresh |
| `useThemePrefs` | `components/ThemeProvider.tsx` | 云端 `UserPreferences` + DOM 主题 |
| `useProgressSync` | `hooks/useProgressSync.ts` | 阅读进度防抖写入 + 离开页 flush |
| `useBookmarks` | `hooks/useBookmarks.ts` | 云端书签（乐观增删 + 旧 localStorage 数据一次性迁移） |
| `useLocalReaderPrefs` | `hooks/useLocalReaderPrefs.ts` | 字体族/亮度，**仅本地**，不改 D1 |

## 编写规则

1. **以 `use` 开头**；返回对象字段名稳定，便于解构。
2. **副作用可取消**：`useEffect` 内异步请求用 `cancelled` 标志（`LibraryPage`、`ReaderPage`、`auth` 初始化同模式）。
3. **Provider hooks 必须守卫**：

```typescript
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 须在 AuthProvider 内使用");
  return ctx;
}
```

4. **本地持久化 key 带前缀**：`yudu.reader.local`、`yudu.reader.bookmarks.${bookId}`；读写 try/catch，失败静默。
5. **不打断阅读**：`useProgressSync` 的 `putProgress` 失败吞掉；书签拉取失败静默降级，增删失败回滚并短暂提示。

## 进度同步细节

- 防抖 1s（`DEBOUNCE_MS`）
- `visibilitychange` hidden / `pagehide` / unmount 时 `flush`
- `charOffset` 由页比例近似（书架百分比用）；`pageInChapter` 用于恢复页码

## 数据请求习惯

当前**没有**通用 `useQuery`。页面内：

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const data = await listBooks();
      if (!cancelled) setBooks(data);
    } catch (err) {
      if (!cancelled) setError(errMessage(err, "…"));
    }
  })();
  return () => { cancelled = true; };
}, []);
```

需要轮询时参考 `LibraryPage` 的 `pollEpoch`（processing 书籍，2s × 最多 60 次）。

## 反模式

- 在 hook 里硬编码完整 API URL（应用 `lib/api.ts`）
- 无清理的 `setInterval` / 未清理的 debounce timer
