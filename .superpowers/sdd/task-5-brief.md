### Task 5: 前端 API 客户端、路由与认证页

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/auth.tsx`
- Create: `apps/web/src/pages/LandingPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `LibraryPage.tsx`（占位）, `SettingsPage.tsx`（占位）
- Modify: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`

**Interfaces:**
- `api<T>(path, init): Promise<T>`：`credentials: 'include'`；非 ok 抛 `ApiError`
- `AuthProvider`：`user`, `loading`, `login`, `register`, `logout`, `refresh`
- 路由守卫：未登录访问 `/library` → `/login`

- [ ] **Step 1: 实现 api.ts 与 auth.tsx**

- [ ] **Step 2: 实现登录/注册表单 UI（雨夜风格卡片）**

校验：前端密码 ≥8；错误展示 `error.message`。

- [ ] **Step 3: 代理联调**

同时开 `dev:api` 与 `dev:web`，浏览器完成注册→进入书架占位页。

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): 认证页面与会话上下文"
```

---

