# 雨读（Yudu）

**通用在线阅读器** — 品牌气质「雨夜书房」。账号云同步、导入多格式文档、左右翻页沉浸阅读。

部署：Cloudflare Workers（API + 静态资源同源）+ D1 + R2。

> 产品定位（给 AI / 协作者）：[`.trellis/spec/guides/product-positioning.md`](./.trellis/spec/guides/product-positioning.md)

## 当前能力

| 能力 | 说明 |
|------|------|
| 账号 | 注册 / 登录 / 会话 Cookie |
| 导入 | **txt / md / epub / pdf**（系列文件名可合并；PDF 一文件一书） |
| 阅读 | 左右翻页、目录、主题 night/paper；PDF 原样分页渲染（pdf.js） |
| 书签 | **云同步**，跨设备互见 |
| 搜索 | **书内全文搜索**，摘录高亮与跳转 |
| 统计 | **每日阅读时长 + 年度热力图**、连续天数 |
| 同步 | 阅读进度、偏好云端；Markdown GFM 渲染 |

## 结构

| 路径 | 说明 |
|------|------|
| `apps/web` | 前端（Vite + React + Tailwind） |
| `apps/api` | 后端（Cloudflare Workers + Hono） |
| `packages/shared` | 共享类型与常量 |
| `.trellis/spec/` | 编码规范与产品定位（AI 必读） |
| `docs/superpowers/` | 历史设计与实现计划（架构参考） |

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

## 线上地址

**雨读：** https://yudu.jiezhi858.workers.dev  

（API 与前端同 Worker 同源部署，Cookie 与 `/api` 均在同一域名。）

## 生产部署（Workers + Assets 同源）

### 1. 登录 Cloudflare

```bash
pnpm exec wrangler login
pnpm --filter @yudu/api exec wrangler whoami
```

### 2. D1 与 R2

- D1：账号上限 10 个库时，可复用空库（当前配置 `novel-reading-platform-db`，**仅为历史库名**）
- R2：`yudu-books`（`wrangler r2 bucket create yudu-books`）

在 `apps/api/wrangler.toml` 填写 `database_id` 与 `bucket_name`。

### 3. 迁移与密钥

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply novel-reading-platform-db --remote
# 将随机字符串通过 stdin 写入
echo "你的长随机串" | pnpm exec wrangler secret put SESSION_SECRET
```

### 4. 构建前端并部署

```bash
# 仓库根目录
pnpm --filter @yudu/web build
cd apps/api
pnpm exec wrangler deploy
```

部署后访问 `https://yudu.<子域>.workers.dev`。

### 5. 验收清单

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
| `WEB_ORIGIN` | Worker vars（可选） | 分域 CORS 时用 |
| `DB` | D1 binding | 元数据 |
| `BOOKS_BUCKET` | R2 binding | 章节与封面 |
| `ASSETS` | Workers Assets | 前端静态资源 |

## 给 AI 协作者

1. 先读 [产品定位](./.trellis/spec/guides/product-positioning.md)  
2. 再读 [`.trellis/spec/guides/index.md`](./.trellis/spec/guides/index.md) 与对应包 `index.md`  
3. 任务流见 [`.trellis/workflow.md`](./.trellis/workflow.md)  
4. 新格式（如 PDF）按定位文档中的扩展清单改 shared → parsers → import → web  

## 许可

[MIT](./LICENSE) © 0401lucky
