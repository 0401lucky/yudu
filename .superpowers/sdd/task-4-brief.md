### Task 4: 认证路由（注册 / 登录 / 登出 / me）

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts` 挂载路由
- Create: `apps/api/src/routes/auth.test.ts`（可用 miniflare/vitest-pool-workers 或对 Hono app 注入 mock DB；若本地 mock 成本过高，则用 wrangler + 脚本手工测并保留关键单测在 password/session）

**Interfaces:**
- `POST /api/auth/register` body `{ email, password }` → 201 + user；Set-Cookie
- `POST /api/auth/login` → 200 + user；Set-Cookie
- `POST /api/auth/logout` → 204；清 Cookie
- `GET /api/me` → 200 user | 401
- 密码最少 8 位；email 小写 trim；重复邮箱 `409 EMAIL_TAKEN`

- [ ] **Step 1: 实现 routes/auth.ts 并挂载**

注册时同时插入默认 `user_preferences`（theme=night, fontSize=18, lineHeight=1.75, pageMargin=normal）。

Cookie 属性：`HttpOnly; Path=/; SameSite=Lax; Max-Age=...`；生产加 `Secure`（`c.req.url` 为 https 时）。

- [ ] **Step 2: 本地验证**

```bash
# terminal 1
pnpm --filter @yudu/api dev

# terminal 2
curl -c cookies.txt -X POST http://127.0.0.1:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"a@test.com\",\"password\":\"password1\"}"
curl -b cookies.txt http://127.0.0.1:8787/api/me
```

Expected: me 返回同一 email。

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(api): 注册登录登出与 /api/me"
```

---

