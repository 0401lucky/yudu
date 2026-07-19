# 质量约定 — @yudu/api

## TypeScript

- `strict` 项目；为 D1 行与请求体写明确类型，避免到处 `any`
- 环境：`Env`（`env.ts`）；鉴权变量：`AuthVariables`（`middleware/auth.ts`）
- 对外 DTO 从 `@yudu/shared` 导入；**不要**在 api 包重复定义 `BookSummary` 等

## 模块边界

| 允许 | 禁止 |
|------|------|
| api → `@yudu/shared` | shared → api / web |
| routes → services / middleware / shared | parsers → D1/R2 |
| services → parsers / storage / shared | 前端组件逻辑放进 Worker |

## 安全清单

- 会话 token 只存 **HMAC 哈希**（`session.hashToken`），Cookie 为原始 token
- 密码：`pbkdf2$iterations$salt$hash`（`password.ts`，100k 迭代）
- Cookie：`httpOnly`、`sameSite: Lax`、HTTPS 时 `secure`（`auth.ts` `setSessionCookie`）
- 上传：大小与扩展名校验；文件名消毒
- 所有书籍操作：`user_id` 条件

## 测试

- 运行器：vitest（`pnpm --filter @yudu/api test`）
- 风格：
  - **服务/解析单元测试**：`password.test.ts`、`session.test.ts`、`parsers/*.test.ts`（`fixtures/`）
  - **路由集成**：`routes/auth.test.ts` 用内存 mock D1 + 挂载 Hono 子应用
- 新解析器或导入规则：至少覆盖成功路径 + 1 个边界（编码、空文件、系列文件名）

### Mock D1 模式

参考 `auth.test.ts`：`createMockDb()` 按 SQL 子串分支实现 `prepare().bind().run/first`。不必上真实 miniflare，除非测 R2 流式。

## FormData / Workers 注意点

- **不要** `parseBody({ all: true })`（wrangler/miniflare 会抛错）；用 `c.req.formData()` + `form.getAll`
- 判断上传文件：勿依赖跨 realm 的 `instanceof File`；用 `Blob` + `name`（见 `isUploadFile`）

## SPA 与 API 同源

`wrangler.toml`：`run_worker_first = true`，`index.ts` 对非 `/api` 回退 `ASSETS.fetch`。改路由时勿让 `app.all("*")` 吞掉合法 API。

## CORS

仅当设置了 `WEB_ORIGIN` 且请求 `Origin` 完全匹配时反射 CORS 头。同源 Workers+Assets 部署可不设 `WEB_ORIGIN`。

## 反模式

- 新增全局可变状态（Workers 隔离模型下不可靠）
- 在请求路径做同步阻塞 CPU 超大解析而不考虑超时（大 epub 需保持可完成）
- 复制 `MAX_UPLOAD_BYTES` / `SESSION_COOKIE` 到 api 本地常量（应来自 shared）
