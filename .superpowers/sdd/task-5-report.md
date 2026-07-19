# Task 5 报告：前端 API 客户端、路由与认证页

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/web/src/lib/api.ts` |
| 新建 | `apps/web/src/lib/auth.tsx` |
| 新建 | `apps/web/src/pages/LandingPage.tsx` |
| 新建 | `apps/web/src/pages/LoginPage.tsx` |
| 新建 | `apps/web/src/pages/RegisterPage.tsx` |
| 新建 | `apps/web/src/pages/LibraryPage.tsx`（占位） |
| 新建 | `apps/web/src/pages/SettingsPage.tsx`（占位） |
| 修改 | `apps/web/src/App.tsx`（路由 + `RequireAuth`） |
| 修改 | `apps/web/src/main.tsx`（`BrowserRouter` + `AuthProvider`） |

### API 客户端（`lib/api.ts`）

- `api<T>(path, init)`：默认 `credentials: 'include'`；有 body 时补 `Content-Type: application/json`
- 非 ok：解析 `{ error: { code, message } }`，抛 `ApiError`（`status` / `code` / `message`）
- 204：返回 `undefined`
- 封装：`getMe` / `login` / `register` / `logout`

### 会话上下文（`lib/auth.tsx`）

- `AuthProvider` 提供：`user`、`loading`、`login`、`register`、`logout`、`refresh`
- 挂载时 `GET /api/me` 恢复会话；401 视为未登录
- `useAuth()` 须在 Provider 内使用

### 路由

| 路径 | 行为 |
|------|------|
| `/` | 落地页；已登录 → `/library` |
| `/login` | 登录；已登录 → `/library` |
| `/register` | 注册；已登录 → `/library` |
| `/library` | 需登录，否则 → `/login`（占位书架） |
| `/settings` | 需登录，否则 → `/login`（占位设置 + 登出） |
| `*` | → `/` |

### UI

- 雨夜书房风格：CSS 变量 `--bg` / `--bg-elevated` / `--accent` / `--border` 等
- 登录/注册：居中卡片；前端密码 ≥8；错误展示 `error.message`（简体中文）
- 落地页：品牌名、一句话、装饰预览帧、登录/注册 CTA

## Commits

- `3da3500` — `feat(web): 认证页面与会话上下文`
  - 9 files changed, 660 insertions(+), 7 deletions(-)

## Test Summary

### 类型检查

```
pnpm --filter @yudu/web typecheck
→ 通过（tsc --noEmit）
```

### 构建

```
pnpm --filter @yudu/web build
→ 通过（tsc -b && vite build，46 modules）
```

### 代理联调 / 浏览器

**未在本任务中执行完整浏览器联调**（未同时启动 `dev:api` + `dev:web` 做注册→书架流程）。

验证依赖：

- Vite 代理已配置：`/api` → `http://127.0.0.1:8787`（`apps/web/vite.config.ts`）
- 后端认证接口已由 Task 4 覆盖（register/login/logout/me）

建议本地验证：

```bash
pnpm dev:api   # 8787
pnpm dev:web   # Vite，经代理调 /api
# 浏览器打开落地页 → 注册 → 应进入 /library 占位页
```

## Concerns

1. **浏览器 E2E 未跑**：Cookie 跨端口经 Vite 代理是否正常，需人工点一次确认。
2. **初始 refresh 与非 401 错误**：挂载时 `getMe` 网络失败也会当未登录（`user=null`），避免阻塞首屏；后续可加 toast。
3. **书架/设置仍为占位**：符合 Task 5 范围，完整 UI 在后续任务。
4. **无前端单元测试**：本任务以 typecheck/build 为主；可后续为 `api` 解析逻辑补 vitest。
