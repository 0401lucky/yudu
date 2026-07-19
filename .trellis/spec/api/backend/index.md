# @yudu/api 后端开发指南

> Cloudflare Workers + Hono 的 API 层约定。包路径：`apps/api`。  
> 服务对象：**通用阅读器**后端（导入任意支持格式的作品，非仅小说）。  
> 权威定位：[../../guides/product-positioning.md](../../guides/product-positioning.md)

---

## 运行时与职责

| 项 | 现状 |
|----|------|
| 运行时 | Cloudflare Workers（`wrangler`），`nodejs_compat` |
| 框架 | Hono 4，`Bindings: Env` |
| 数据 | D1（元数据）+ R2（章节正文 / 封面 / 源文件） |
| 鉴权 | HttpOnly Cookie 会话（`yudu_session`） |
| 静态前端 | Workers Assets 绑定 `ASSETS`，非 `/api` 回退 SPA |
| 格式 | `parsers/` 注册表：`txt` / `md` / `epub`；`pdf` 预留未实现 |

入口：`apps/api/src/index.ts`。环境类型：`apps/api/src/env.ts`。

---

## 指南索引

| 指南 | 说明 |
|------|------|
| [目录结构](./directory-structure.md) | `routes` / `services` / `parsers` / `middleware` 分层 |
| [数据库与存储](./database-guidelines.md) | D1 schema、迁移、R2 key、查询模式 |
| [错误处理](./error-handling.md) | `{ error: { code, message } }` 与校验错误类 |
| [质量约定](./quality-guidelines.md) | 测试、类型、导入、禁止模式 |
| [日志](./logging-guidelines.md) | 当前几乎无结构化日志；错误以 HTTP JSON 返回 |

---

## 核心原则（摘要）

1. **路由薄、服务厚**：HTTP 解析 / 鉴权 / 状态码在 `routes/`；业务与 I/O 在 `services/`；格式解析在 `parsers/`。
2. **用户隔离**：凡读写入库/R2 的书籍数据必须带 `user_id`（或 `c.get("userId")`）。
3. **跨端契约来自 `@yudu/shared`**：响应体用 `UserPublic`、`BookSummary` 等类型，字段 camelCase；D1 列 snake_case，在路由/服务边界映射。
4. **错误形态统一**：业务失败 `c.json({ error: { code, message } }, status)`；不要抛裸字符串给前端。

---

## 验证命令

```bash
pnpm --filter @yudu/api test
pnpm --filter @yudu/api typecheck
```

本地 dev：`pnpm dev:api`（默认 `http://127.0.0.1:8787`）。
