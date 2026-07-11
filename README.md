# 雨读

在线小说阅读器 — **雨夜书房**。支持账号云同步、导入 txt / md / epub、左右翻页阅读。部署目标：Cloudflare Pages + Workers + D1 + R2。

## 结构

| 路径 | 说明 |
|------|------|
| `apps/web` | 前端（Vite + React + Tailwind） |
| `apps/api` | 后端（Cloudflare Workers + Hono） |
| `packages/shared` | 共享类型与常量 |
| `docs/superpowers/` | 设计规格与实现计划 |

## 本地开发

### 前置

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- [Cloudflare 账号](https://dash.cloudflare.com/)（仅部署时需要）

### 安装

```bash
pnpm install
```

### API 本地配置

```bash
cd apps/api
copy .dev.vars.example .dev.vars   # Windows
# 或: cp .dev.vars.example .dev.vars

# 应用 D1 本地迁移
pnpm exec wrangler d1 migrations apply yudu --local
```

`.dev.vars` 至少包含：

```
SESSION_SECRET=请换成足够长的随机字符串
WEB_ORIGIN=http://127.0.0.1:5173
```

### 启动

开两个终端：

```bash
pnpm dev:api   # http://127.0.0.1:8787
pnpm dev:web   # Vite，默认 5173，/api 代理到 8787
```

健康检查：`GET http://127.0.0.1:8787/api/health` → `{"ok":true,"name":"雨读"}`

### 测试

```bash
pnpm test
pnpm typecheck
```

## 生产部署（拓扑 A：分域 + CORS）

API 与前端可不同子域：例如 `api.example.com` + `read.example.com`。Cookie 跨站时需后续加强 `SameSite`/域名策略；**同主域子域**更省心。

### 1. 登录 Cloudflare

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

### 2. 创建 D1 与 R2

```bash
cd apps/api
pnpm exec wrangler d1 create yudu
pnpm exec wrangler r2 bucket create yudu-books
```

把输出的 `database_id` 填入 `apps/api/wrangler.toml` 的 `database_id`。

### 3. 远程迁移与密钥

```bash
pnpm exec wrangler d1 migrations apply yudu --remote
pnpm exec wrangler secret put SESSION_SECRET
# 可选：在 Dashboard 或 vars 设置 WEB_ORIGIN=https://你的前端域名
```

在 `wrangler.toml` 增加（或使用 Dashboard）：

```toml
[vars]
WEB_ORIGIN = "https://你的-pages-域名.pages.dev"
```

### 4. 部署 API

```bash
cd apps/api
pnpm exec wrangler deploy
```

记下 Worker 公网 URL。

### 5. 部署前端（Pages）

构建：

```bash
cd apps/web
# 若前后端不同源，构建前设置：
# set VITE_API_BASE=https://yudu-api.xxx.workers.dev
pnpm build
```

当前前端默认请求同源 `/api/*`（开发靠 Vite 代理）。生产若分域，需在 `apps/web` 增加 `VITE_API_BASE` 前缀支持（见下）。

**推荐同域路径：** 在 Cloudflare 将 `example.com/api/*` 路由到 Worker，Pages 只托管静态，前端保持相对路径 `/api`。

Pages 上传 `apps/web/dist`，或连接 Git 仓库构建命令：

```
pnpm install && pnpm --filter @yudu/web build
```

输出目录：`apps/web/dist`。

### 6. 验收清单

- [ ] 注册 / 登录 / 登出
- [ ] 导入 txt、md、epub
- [ ] 左右翻页、目录跳转
- [ ] 刷新后进度恢复
- [ ] 主题 night / paper
- [ ] 手机宽度与桌面布局正常

## 环境变量摘要

| 名称 | 位置 | 说明 |
|------|------|------|
| `SESSION_SECRET` | Worker Secret | 会话 HMAC |
| `WEB_ORIGIN` | Worker vars | 允许的前端 Origin（CORS） |
| `DB` | D1 binding | 元数据 |
| `BOOKS_BUCKET` | R2 binding | 章节与封面 |

## 许可

私人项目。
