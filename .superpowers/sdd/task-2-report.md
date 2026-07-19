# Task 2 报告：D1 迁移与本地数据库

## Status

**完成**

## 变更摘要

| 操作 | 路径 |
|------|------|
| 新建 | `apps/api/migrations/0001_init.sql` |
| 修改 | `apps/api/wrangler.toml`（增加 `migrations_dir = "migrations"`） |
| 新建 | `apps/api/.dev.vars.example`（`SESSION_SECRET`） |
| 本地 | `apps/api/.dev.vars`（自 example 复制，已 gitignore，未提交） |

### 表结构（`0001_init.sql`）

- `users` — 用户账号
- `sessions` — 会话（含 `idx_sessions_user` / `idx_sessions_token`）
- `books` — 书籍元数据（含 `idx_books_user`）
- `chapters` — 章节（`UNIQUE(book_id, idx)`）
- `reading_progress` — 阅读进度（主键 `user_id, book_id`）
- `user_preferences` — 阅读偏好

## Commits

- `9b9c4e0` — `feat(api): 添加 D1 初始迁移`
  - 3 files changed, 65 insertions(+)
  - 包含：`migrations/0001_init.sql`、`.dev.vars.example`、`wrangler.toml`

## 验证 / Test Summary

| 检查项 | 结果 |
|--------|------|
| `pnpm --filter @yudu/api exec wrangler d1 migrations apply yudu --local` | 成功：`0001_init.sql` ✅，10 条 SQL 命令执行成功 |
| `wrangler d1 execute yudu --local --command "SELECT name FROM sqlite_master..."` | 表存在：`users`, `sessions`, `books`, `chapters`, `reading_progress`, `user_preferences`，以及 `d1_migrations` |
| `.dev.vars` 是否被 gitignore | 是（`.gitignore:4:.dev.vars`） |
| `.dev.vars.example` 是否纳入提交 | 是 |

本地 DB 路径：`apps/api/.wrangler/state/v3/d1`（database_id: `local-dev-placeholder`）。

## Concerns

1. **Wrangler 版本偏旧**：当前 `wrangler 3.114.17`，提示可升级至 v4；本地 apply 已成功，暂不阻塞。
2. **`database_id = "local-dev-placeholder"`**：仅本地可用；上线远程 D1 时需替换为真实 `database_id`，并用 `wrangler d1 migrations apply yudu --remote` 应用迁移。
3. **SQLite FK**：D1/SQLite 外键需连接启用 `PRAGMA foreign_keys = ON` 才生效；业务层查询/写入时应注意。
4. **非交互 apply**：CI/非 TTY 环境会自动确认迁移（fallback yes），行为符合预期。

## Report Path

`D:\lucky0401\Documents\小说\小说阅读器\.superpowers\sdd\task-2-report.md`
