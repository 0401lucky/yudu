# Task 3 报告：密码与会话服务 + 鉴权中间件

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/src/services/password.ts` |
| 新建 | `apps/api/src/services/password.test.ts` |
| 新建 | `apps/api/src/services/session.ts` |
| 新建 | `apps/api/src/services/session.test.ts` |
| 新建 | `apps/api/src/middleware/auth.ts` |

### 接口

| 导出 | 说明 |
|------|------|
| `hashPassword(password)` | PBKDF2-SHA256，格式 `pbkdf2$iterations$saltB64$hashB64`，iterations = 100_000 |
| `verifyPassword(password, hash)` | 恒定时间比较校验 |
| `createSession(db, userId, secret)` | 32 字节随机 token（base64url），库中只存 HMAC 哈希；返回 `{ id, token, expiresAt }` |
| `hashToken(token, secret)` | HMAC-SHA256 → hex |
| `deleteSession(db, sessionId)` | 按 id 删除会话 |
| `resolveSession(db, token, secret)` | 用原始 token 查未过期会话（供中间件 / 登出复用） |
| `authMiddleware` | Cookie `yudu_session` → 校验会话 → `c.set('userId', ...)`；失败 401 |

### 设计要点

- **密码**：Web Crypto `PBKDF2` + `SHA-256`，Workers 友好，无 Node 依赖。
- **会话**：Cookie 存**原始 token**；`sessions.token_hash` 存 HMAC-SHA256(token, SESSION_SECRET)；过期时间 `SESSION_DAYS`（30 天）。
- **鉴权**：读 `SESSION_COOKIE`（`yudu_session`），失败体为 `{ error: { code: "UNAUTHORIZED", message: "请先登录" } }`。
- **未挂载路由**：中间件已就绪，Task 4 认证路由挂载时使用。

## Commits

- `d59e016` — `feat(api): 密码哈希与会话鉴权`
  - 5 files changed, 323 insertions(+)
  - 包含：password / session 服务与测试、auth 中间件

## TDD 证据

### RED（password）

仅写入 `password.test.ts`、未实现 `password.ts` 时：

```
FAIL  src/services/password.test.ts
Error: Failed to load url ./password (resolved id: ./password)
... Does the file exist?

Test Files  1 failed (1)
Tests       no tests
```

### GREEN（password）

实现 `password.ts` 后：

```
✓ src/services/password.test.ts (1 test)

Test Files  1 passed (1)
Tests       1 passed (1)
```

### GREEN（session + 全量）

实现 `session.ts` / `session.test.ts` / `auth.ts` 后：

```
✓ src/services/password.test.ts (1 test)
✓ src/services/session.test.ts (4 tests)

Test Files  2 passed (2)
Tests       5 passed (5)
```

session 用内存 mock D1 覆盖：`hashToken` 稳定性、`createSession` 只存哈希、`resolveSession`、删除后失效、过期会话拒绝。

## Test Summary

| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @yudu/api test` | **5 passed**（password 1 + session 4）✅ |
| `pnpm --filter @yudu/api typecheck` | 通过 ✅ |
| auth 中间件单测 | 未单独编写（brief 未要求；逻辑依赖 `resolveSession` 已测） |

## Concerns

1. **auth 中间件无独立单测**：依赖 `resolveSession` + Hono Cookie；Task 4 集成测 `/api/me` 时建议补齐端到端路径。
2. **PBKDF2 100k 在本地 Node 约 0.3–1.8s**：Workers 上可接受；若注册/登录压测偏慢可再评估 iterations（勿低于 100_000）。
3. **`resolveSession` 为 brief 接口外辅助函数**：auth / 后续 logout 需要，已导出；非过度抽象。
4. **Cookie 仅存原始 token**：靠 `token_hash` 索引查找；未采用 `sessionId.token` 复合格式，实现更简单。
5. **未在 `index.ts` 挂载中间件**：符合 Task 3 范围；Task 4 路由层接入。

## Report Path

`D:\lucky0401\Documents\小说\小说阅读器\.superpowers\sdd\task-3-report.md`
