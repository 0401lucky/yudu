# 状态管理 — @yudu/web

## 分层（现状）

```
AuthProvider（用户会话）
  └── ThemeProvider（云端阅读偏好 + data-theme）
        └── 页面 useState / 局部 hooks
              ├── useProgressSync → PUT /api/progress
              ├── useBookmarks → /api/books/:id/bookmarks（云端）
              ├── useChapterWindow → GET /api/books/:id/chapters/:idx（三章窗口缓存）
              └── useLocalReaderPrefs → localStorage
```

**没有** Redux、Zustand、Jotai、React Query。新状态默认用 `useState` / `useReducer` / Context，不要为了「架构完整」引入仓库。

## 全局 Context

| Context | 状态 | 持久化 |
|---------|------|--------|
| `AuthProvider` | `user`、`loading` | Cookie 会话；启动时 `GET /api/me` |
| `ThemeProvider` | `prefs`（theme/fontSize/lineHeight/pageMargin） | `GET/PUT /api/preferences`；未登录用默认 night |

`setPrefs`：先 `applyLocal` 乐观更新 DOM，再 `putPreferences` 以服务端结果为准。

## 页面状态

- **LibraryPage**：`books`、`loading`、`importing`、`error`、删除中 id、processing 轮询 epoch
- **ReaderPage**：书详情、章节窗口、页码（仅翻页模式）、chrome/toc/settings 显隐、`pendingPageRef` 跨章落页（翻页）、`pendingScroll` 跨章落位（滚动）

跨组件且仅阅读页用的状态，优先放 `ReaderPage` 再 props 下传，或抽 hook；不必升到 App。

## 约定：阅读位置统一锚点 charOffset

**What**：阅读位置的跨模式公共坐标是 `chapterIndex + charOffset`（章内近似字符偏移）。翻页/滚动两种视口各自把它换算成页号或 scrollTop；恢复进度、目录/书签/搜索跳转、模式互切一律以该锚点传递。

**Why**：滚动模式没有"页"概念，页号无法互通；charOffset 是进度/书签后端既有字段，统一后两模式共享同一份云端进度。

**规则**：
- 恢复优先 `{ charOffset }`，`pageInChapter` 仅回退旧记录（换算见 hook 指南）
- 新增跳转入口时传 `(chapterIndex, charOffset)`，不要传页号
- 上报后端的偏移必须为非负整数（`round`/`ceil` 后夹取）

## 服务端 vs 本地

| 数据 | 位置 |
|------|------|
| 用户、书架、章节、进度、主题字号行距边距、书签 | API / D1 |
| 字体 serif/sans、亮度蒙层、阅读模式 page/scroll | localStorage `yudu.reader.local` |

扩展「仅本机」阅读选项时，优先 `useLocalReaderPrefs`，避免无迁移就改 D1。

## API 客户端状态

`lib/api.ts` 无缓存层。列表在导入/删除后主动 `listBooks` 或本地 merge。阅读进度靠 hook 推送，不以全局 store 镜像。

## 反模式

- 把整本 `ChapterContent` 放进 Context「方便」导致多余重渲染
- 用 URL query 同步每一页码（当前用内存 + 云进度即可）
- 假设有全局 `useStore()` API
