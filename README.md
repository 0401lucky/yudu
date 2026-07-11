# 雨读

在线小说阅读器 — 雨夜书房。

## 结构

- `apps/web` — 前端（Vite + React）
- `apps/api` — 后端（Cloudflare Workers + Hono）
- `packages/shared` — 共享类型与常量

## 开发

```bash
pnpm install
pnpm dev:api   # http://127.0.0.1:8787
pnpm dev:web   # Vite 开发服务器
```

健康检查：`GET /api/health` → `{"ok":true,"name":"雨读"}`
