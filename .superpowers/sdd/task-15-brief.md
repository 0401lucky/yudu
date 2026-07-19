### Task 15: 生产部署配置与 README

**Files:**
- Modify: `apps/api/wrangler.toml`
- Create/Modify: `apps/web` 的 Pages 配置（`wrangler.toml` pages 或文档说明 dashboard 连接）
- Modify: `README.md`
- Create: `apps/web/vite.config.ts` production `base` 如需

**Interfaces:**
- README 步骤：  
  1. `wrangler login`  
  2. 创建 D1 `yudu`、R2 `yudu-books`，填回 database_id  
  3. `wrangler d1 migrations apply yudu --remote`  
  4. `wrangler secret put SESSION_SECRET`  
  5. 部署 api；部署 web；配置 Pages 环境把 `/api/*` 回源到 Worker（或使用 **Pages project 绑定同一 Worker 路由**）  

**推荐部署拓扑（写进 README 并实现一种）：**

**拓扑 A（简单）：** Worker 提供 API；Pages 只托管静态；自定义域下 `api.example.com` + `read.example.com`，web 的 `VITE_API_BASE` 指向 api 域，CORS 放行。

**拓扑 B（同域）：** 使用 Cloudflare Pages Functions 或 Worker routes `example.com/api/*`。

本 Task **实现拓扑 A 的 CORS**：api 读取环境变量 `WEB_ORIGIN`，反射允许该 Origin + credentials。

- [ ] **Step 1: CORS 中间件**

```ts
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const allowed = c.env.WEB_ORIGIN; // e.g. https://yudu.pages.dev
  if (origin && allowed && origin === allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Headers", "Content-Type");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});
```

本地 dev：`WEB_ORIGIN=http://127.0.0.1:5173`

- [ ] **Step 2: 写清 README 部署与本地开发**

- [ ] **Step 3: 运行 `pnpm test` 与 `pnpm typecheck` 全绿**

- [ ] **Step 4: 对照 spec 验收清单手工勾选主路径**

- [ ] **Step 5: Commit**

```bash
git commit -am "docs: 部署说明与 CORS 生产配置"
```

---

## Spec 覆盖自检

| Spec 项 | Task |
|---------|------|
| Cloudflare Pages+Worker+D1+R2 | 1, 2, 15 |
| 响应式 | 9, 11, 14 |
| 账号密码会话 | 3, 4, 5 |
| 云同步书架/进度 | 8, 9, 12 |
| txt/md/epub | 6, 7, 8 |
| PDF 预留 | shared `BookFormat` 含 pdf，导入拒绝 |
| 左右翻页 | 10, 11 |
| char_offset 进度 | 12 |
| 雨夜书房主题 | 1 css, 13, 14 |
| 30MB 限制 | 8 + constants |
| 不碰随笔/ | fixtures 自建 |
| 删除书 | 8, 9 |
| 安全隔离 | 3, 4, 8 |

## 类型一致性备忘

- Cookie 名：`yudu_session`（`SESSION_COOKIE`）
- 章节序号字段：DB `chapters.idx`，API JSON `index` / `chapterIndex`（camelCase）
- 进度：`charOffset` 对应页 `pageStarts[page]`
- 格式：`txt` \| `md` \| `epub`（小写）

---

## 执行交接

Plan complete and saved to `docs/superpowers/plans/2026-07-11-novel-reader.md`.

实现时推荐：

1. **Subagent-Driven（推荐）** — 每任务新开子代理，任务间审查  
2. **Inline Execution** — 本会话按 executing-plans 连续执行并设检查点  

请选择一种方式开始写代码。
