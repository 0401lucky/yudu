# @yudu/web 前端开发指南

> Vite + React + Tailwind 的 SPA。包路径：`apps/web`。产品名：**雨读**。

---

## 技术栈（锁定）

| 项 | 选择 |
|----|------|
| 构建 | Vite 6 + `@vitejs/plugin-react` |
| UI | React 18、函数组件 + hooks |
| 路由 | `react-router-dom` v7（`BrowserRouter`） |
| 样式 | Tailwind 3 + CSS 变量主题（`index.css`） |
| 数据 | `fetch` + Cookie（`credentials: "include"`），无 React Query / Redux |
| 共享类型 | `@yudu/shared` |

开发代理：`vite.config.ts` 将 `/api` 转到 `http://127.0.0.1:8787`。生产与 API **同源**（Workers Assets）。

---

## 指南索引

| 指南 | 说明 |
|------|------|
| [目录结构](./directory-structure.md) | pages / components / hooks / lib |
| [组件约定](./component-guidelines.md) | 展示组件、阅读器 UI、主题 token |
| [Hooks](./hook-guidelines.md) | 进度同步、书签、本地偏好 |
| [状态管理](./state-management.md) | Context + 页面本地 state，无全局 store |
| [类型安全](./type-safety.md) | shared DTO、ApiError |
| [质量约定](./quality-guidelines.md) | 无障碍、移动端、禁止模式 |

---

## 路由一览

| 路径 | 页面 | 鉴权 |
|------|------|------|
| `/` | LandingPage | 公开 |
| `/login` `/register` | 登录注册 | 公开 |
| `/library` | 书架 | 需登录 |
| `/settings` | 设置 | 需登录 |
| `/read/:bookId` | 阅读器 | 需登录 |

鉴权壳：`App.tsx` 的 `RequireAuth`（`useAuth` + `<Navigate to="/login">`）。

---

## 验证命令

```bash
pnpm --filter @yudu/web typecheck
pnpm --filter @yudu/web build
pnpm --filter @yudu/web test
```
