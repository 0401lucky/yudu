# Task 4 报告：认证路由（注册 / 登录 / 登出 / me）

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/src/routes/auth.ts` |
| 新建 | `apps/api/src/routes/auth.test.ts` |
| 修改 | `apps/api/src/index.ts`（挂载路由） |

### 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | body `{ email, password }` → **201** + `UserPublic`；`Set-Cookie: yudu_session` |
| POST | `/api/auth/login` | 同上 → **200** + user；Set-Cookie |
| POST | `/api/auth/logout` | 删会话 + 清 Cookie → **204** |
| GET | `/api/me` | 需登录 → **200** user / **401** |

### 行为细节

- **邮箱**：`trim().toLowerCase()`；须含 `@`
- **密码**：最少 8 位
- **重复邮箱**：`409` + `{ error: { code: "EMAIL_TAKEN", message: "该邮箱已注册" } }`
- **注册默认偏好**：`theme=night`, `font_size=18`, `line_height=1.75`, `page_margin=normal`（与用户同 batch 写入）
- **Cookie**：`HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`（30 天）；`c.req.url` 为 https 时加 `Secure`
- **错误登录**：`401 INVALID_CREDENTIALS`（不区分邮箱是否存在）
- **校验失败**：`400 VALIDATION_ERROR` / `INVALID_BODY`

### 挂载方式

```ts
app.route("/api/auth", authRoutes);
app.route("/api", meRoutes);
```

复用 Task 3：`hashPassword` / `verifyPassword`、`createSession` / `resolveSession` / `deleteSession`、`authMiddleware`。

## Commits

- `ef51fe3` — `feat(api): 注册登录登出与 /api/me`
  - 3 files changed, 548 insertions(+)
  - 包含：`routes/auth.ts`、`routes/auth.test.ts`、`index.ts` 挂载

## Test Summary

### 单元测试（mock D1 + Hono `app.request`）

```
pnpm --filter @yudu/api test
✓ src/services/password.test.ts (1)
✓ src/services/session.test.ts (4)
✓ src/routes/auth.test.ts (6)
  - 注册 201 + Cookie + 默认偏好
  - 重复邮箱 409 EMAIL_TAKEN
  - 密码过短 400
  - 登录后 /api/me 同一用户
  - 错误密码 / 无 Cookie → 401
  - 登出后 me 401

Test Files  3 passed
Tests       11 passed
```

### 类型检查

`pnpm --filter @yudu/api typecheck` → 通过

### wrangler 本地 curl（http://127.0.0.1:8787）

| 步骤 | 结果 |
|------|------|
| POST register `a@test.com` | **201**，Set-Cookie `yudu_session=...; HttpOnly; SameSite=Lax` |
| GET /api/me（带 cookie） | **200**，同一 email |
| 再次 register 同邮箱 | **409 EMAIL_TAKEN** |
| POST login（邮箱大小写不同） | **200** + 新 Cookie |
| POST logout | **204** |
| GET /api/me（登出后） | **401 UNAUTHORIZED** |

## Concerns

1. **邮箱格式校验较松**：仅检查含 `@`，未做完整 RFC 校验；MVP 足够，后续可加强。
2. **D1 batch 原子性**：用户 + 偏好同 batch；若 createSession 在 batch 之后失败，会留下无会话用户（可重新登录），可接受。
3. **登出不要求有效会话**：有 token 则尽量删库中会话，始终清 Cookie 并 204（幂等友好）。
4. **auth 中间件仅设 `userId`**：logout 自行 `resolveSession`，未扩展 Variables（刻意保持中间件最小）。
5. **PBKDF2 100k**：注册/登录在 Node 单测约 0.3–0.7s/次；Workers 生产可接受。

## Report Path

`D:\lucky0401\Documents\小说\小说阅读器\.superpowers\sdd\task-4-report.md`
