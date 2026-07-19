### Task 3: 密码与会话服务 + 鉴权中间件

**Files:**
- Create: `apps/api/src/services/password.ts`
- Create: `apps/api/src/services/session.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/services/password.test.ts`
- Create: `apps/api/src/services/session.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`
  - `createSession(db, userId, secret): Promise<{ id: string; token: string; expiresAt: number }>`
  - `hashToken(token: string, secret: string): Promise<string>`
  - `deleteSession(db, sessionId): Promise<void>`
  - `authMiddleware`：成功时 `c.set('userId', string)`，失败 401
- Consumes: `Env.DB`, `Env.SESSION_SECRET`, `SESSION_COOKIE`, `SESSION_DAYS`

- [ ] **Step 1: 写 password 失败测试**

使用 Web Crypto PBKDF2（Workers 友好），测试：

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("哈希后能校验正确密码", async () => {
    const hash = await hashPassword("正确密码123");
    expect(hash).not.toContain("正确密码123");
    expect(await verifyPassword("正确密码123", hash)).toBe(true);
    expect(await verifyPassword("错误", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: 实现 password.ts 并跑通测试**

实现格式建议：`pbkdf2$iterations$saltB64$hashB64`，iterations ≥ 100_000，SHA-256。

```bash
pnpm --filter @yudu/api test
```

Expected: PASS

- [ ] **Step 3: 实现 session.ts**

- `token`：32 字节随机，base64url  
- `token_hash`：HMAC-SHA256(token, SESSION_SECRET) 的 hex/base64  
- Cookie 值存 **原始 token**（或 `sessionId.token` 复合），库中只存 hash  

- [ ] **Step 4: 实现 auth 中间件**

从 Cookie 读 `yudu_session` → 查 sessions 且未过期 → `c.set('userId', ...)`；否则 `401` + `{ error: { code: "UNAUTHORIZED", message: "请先登录" } }`。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): 密码哈希与会话鉴权"
```

---

