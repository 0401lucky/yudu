# 目录结构 — @yudu/web

## 包布局

```
apps/web/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.tsx              # Router + AuthProvider + ThemeProvider
│   ├── App.tsx               # 路由表与 RequireAuth
│   ├── index.css             # Tailwind + data-theme 变量 + 阅读区样式
│   ├── pages/                # 路由页面（默认 export 组件）
│   │   ├── LandingPage.tsx
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── LibraryPage.tsx
│   │   ├── ReaderPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/           # 可复用 UI（无业务路由绑定优先）
│   │   ├── BookCard.tsx
│   │   ├── ImportDropzone.tsx
│   │   ├── ReaderChrome.tsx
│   │   ├── ReaderViewport.tsx
│   │   ├── ReaderSettingsSheet.tsx
│   │   ├── TocDrawer.tsx
│   │   └── ThemeProvider.tsx
│   ├── hooks/
│   │   ├── useProgressSync.ts
│   │   ├── useBookmarks.ts
│   │   └── useLocalReaderPrefs.ts
│   └── lib/
│       ├── api.ts            # fetch 封装与全部 API 函数
│       └── auth.tsx          # AuthProvider / useAuth
└── package.json              # @yudu/web
```

## 放置规则

| 新增内容 | 位置 |
|----------|------|
| 新 URL 页面 | `pages/XxxPage.tsx`，在 `App.tsx` 注册 |
| 多页复用 UI | `components/` |
| 仅阅读页本地逻辑 | `hooks/` 或 `ReaderPage` 内 |
| 新后端调用 | **只**加在 `lib/api.ts`，页面不直接 `fetch` |
| 会话状态 | `lib/auth.tsx`，勿平行再造登录 Context |

## 命名

- 页面：`PascalCase` + `Page` 后缀，**default export**
- 组件：`PascalCase`，多为 default export（`BookCard`、`ImportDropzone`）
- hooks：`use` 前缀 camelCase
- 样式：Tailwind utility + 少量全局类（`.reader-page`、`.safe-top`）

## 反模式

- 在 `pages/` 复制 `api()` 逻辑而不走 `lib/api.ts`
- 新建 `services/` 或 `store/` 除非已有明确跨页状态需求（当前无）
- 把阅读器分页算法拆到 shared（分页在客户端 DOM 测量，属 web 专属）
