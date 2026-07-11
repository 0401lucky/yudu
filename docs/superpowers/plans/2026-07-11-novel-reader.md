# 雨读 · 小说阅读器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可部署到 Cloudflare 的响应式小说阅读器：账号云同步、导入 txt/md/epub、左右翻页阅读，视觉为「雨夜书房」。

**Architecture:** Vite + React SPA 部署 Pages；Hono API 跑在 Workers；D1 存用户/元数据/进度/偏好；R2 存章节正文与封面。解析在 Worker 完成；分页在浏览器按章测量，进度以 `chapter_index + char_offset` 锚定。

**Tech Stack:** pnpm workspace、Vite 6、React 19、TypeScript、Tailwind CSS 4、React Router 7、Hono、Cloudflare Workers/D1/R2、Vitest、wrangler

**Spec:** `docs/superpowers/specs/2026-07-11-novel-reader-design.md`

## Global Constraints

- 语言：用户可见文案、提交信息、注释说明使用**简体中文**；代码标识符用英文
- 格式 MVP：`txt` | `md` | `epub`；`pdf` 仅类型预留，UI 不开放
- 阅读：仅左右翻页（不做滚动模式）
- 进度权威字段：`chapter_index` + `char_offset`
- 单文件上传上限：**30MB**
- 主题：默认 `night`（雨夜书房），可选 `paper`
- 不读取/修改仓库外 `随笔/`；测试用 fixture 自建在仓库内
- 密码不明文存储；会话 HttpOnly Cookie；资源按 `user_id` 隔离
- YAGNI：不做 OAuth、书签、搜索、PDF、滚动模式
- 每个 Task 结束必须可验证（测试或手动命令）并 commit

---

## 文件结构（锁定）

```
/
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json                   # 可选；无则用 pnpm -r scripts
├── .gitignore
├── README.md
├── apps/
│   ├── web/                     # SPA
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── public/
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── index.css        # 主题 CSS 变量
│   │       ├── lib/api.ts       # fetch 封装
│   │       ├── lib/auth.tsx     # 会话上下文
│   │       ├── lib/pagination.ts
│   │       ├── pages/
│   │       │   ├── LandingPage.tsx
│   │       │   ├── LoginPage.tsx
│   │       │   ├── RegisterPage.tsx
│   │       │   ├── LibraryPage.tsx
│   │       │   ├── ReaderPage.tsx
│   │       │   └── SettingsPage.tsx
│   │       ├── components/
│   │       │   ├── BookCard.tsx
│   │       │   ├── ImportDropzone.tsx
│   │       │   ├── ReaderViewport.tsx
│   │       │   ├── ReaderChrome.tsx
│   │       │   ├── TocDrawer.tsx
│   │       │   └── ThemeProvider.tsx
│   │       └── hooks/
│   │           ├── useProgressSync.ts
│   │           └── usePagination.ts
│   └── api/                     # Worker
│       ├── package.json
│       ├── wrangler.toml
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── migrations/
│       │   └── 0001_init.sql
│       └── src/
│           ├── index.ts         # Hono app export
│           ├── env.ts           # Env 类型
│           ├── db/
│           │   └── schema.ts    # 辅助 query（可选）
│           ├── middleware/
│           │   └── auth.ts
│           ├── routes/
│           │   ├── auth.ts
│           │   ├── books.ts
│           │   ├── progress.ts
│           │   └── preferences.ts
│           ├── services/
│           │   ├── password.ts
│           │   ├── session.ts
│           │   ├── storage.ts
│           │   ├── cover.ts
│           │   └── importBook.ts
│           └── parsers/
│               ├── types.ts
│               ├── txt.ts
│               ├── md.ts
│               └── epub.ts
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts
        │   ├── types.ts
        │   └── constants.ts
        └── vitest.config.ts
```

---

### Task 1: 脚手架与工作区

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/types.ts`, `packages/shared/src/constants.ts`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/wrangler.toml`, `apps/api/src/index.ts`, `apps/api/src/env.ts`
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css`

**Interfaces:**
- Produces: workspace 可 `pnpm install`；`@yudu/shared` 可被 web/api 引用；api 导出 Hono app 占位；web 可 `pnpm --filter web dev` 打开空白页

- [ ] **Step 1: 写 root workspace 文件**

`package.json`:
```json
{
  "name": "yudu",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev:web": "pnpm --filter @yudu/web dev",
    "dev:api": "pnpm --filter @yudu/api dev",
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.gitignore`:
```
node_modules
dist
.wrangler
.dev.vars
*.local
.DS_Store
.env
.env.*
```

- [ ] **Step 2: 写 shared 包**

`packages/shared/package.json`:
```json
{
  "name": "@yudu/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`packages/shared/src/constants.ts`:
```ts
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const SUPPORTED_FORMATS = ["txt", "md", "epub"] as const;
export type BookFormat = (typeof SUPPORTED_FORMATS)[number] | "pdf";
export const SESSION_COOKIE = "yudu_session";
export const SESSION_DAYS = 30;
```

`packages/shared/src/types.ts`:
```ts
import type { BookFormat } from "./constants";

export type BookStatus = "processing" | "ready" | "failed";
export type ThemeId = "night" | "paper";

export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  coverUrl: string | null;
  status: BookStatus;
  errorMessage: string | null;
  chapterCount: number;
  progressPercent: number | null;
  updatedAt: number;
}

export interface ChapterMeta {
  index: number;
  title: string;
  charCount: number;
}

export interface BookDetail {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  status: BookStatus;
  chapters: ChapterMeta[];
}

export interface ChapterContent {
  index: number;
  title: string;
  text: string;
}

export interface ReadingProgress {
  bookId: string;
  chapterIndex: number;
  charOffset: number;
  pageInChapter: number | null;
  updatedAt: number;
}

export interface UserPreferences {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  pageMargin: "compact" | "normal" | "relaxed";
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
```

`packages/shared/src/index.ts`:
```ts
export * from "./constants";
export * from "./types";
```

- [ ] **Step 3: 写 api 占位**

`apps/api/package.json`: 依赖 `hono`、`@yudu/shared: workspace:*`；dev 依赖 `@cloudflare/workers-types`、`wrangler`、`typescript`、`vitest`；scripts: `dev`=`wrangler dev`，`deploy`=`wrangler deploy`，`test`=`vitest run`，`typecheck`=`tsc --noEmit`

`apps/api/wrangler.toml`:
```toml
name = "yudu-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "yudu"
database_id = "local-dev-placeholder"

[[r2_buckets]]
binding = "BOOKS_BUCKET"
bucket_name = "yudu-books"
```

`apps/api/src/env.ts`:
```ts
export type Env = {
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
  SESSION_SECRET: string;
};
```

`apps/api/src/index.ts`:
```ts
import { Hono } from "hono";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, name: "雨读" }));

export default app;
```

- [ ] **Step 4: 写 web 占位**

`apps/web`：Vite React-TS 模板结构；`vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:8787`；依赖 `react`、`react-dom`、`react-router-dom`、`@yudu/shared`；dev 依赖 Tailwind 按官方 Vite 安装方式配置。

`apps/web/src/App.tsx` 先渲染标题「雨读」与副文案「雨夜书房」。

`apps/web/src/index.css` 预置 CSS 变量：
```css
:root,
[data-theme="night"] {
  --bg: #0c0f0e;
  --bg-elevated: #121816;
  --text: #e6e2d6;
  --text-muted: #8a918c;
  --accent: #c4a574;
  --border: #24302a;
  --page-bg: #0e1311;
}
[data-theme="paper"] {
  --bg: #f4efe4;
  --bg-elevated: #fffaf0;
  --text: #1c1916;
  --text-muted: #6b6560;
  --accent: #8b6914;
  --border: #e0d6c6;
  --page-bg: #f7f2e8;
}
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, "Segoe UI", sans-serif;
}
```

- [ ] **Step 5: 安装并验证**

```bash
pnpm install
pnpm --filter @yudu/api exec wrangler dev --port 8787
# 另开终端
curl http://127.0.0.1:8787/api/health
```

Expected: JSON `{"ok":true,"name":"雨读"}`

```bash
pnpm --filter @yudu/web dev
```

Expected: 浏览器可见「雨读」。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore README.md packages apps
git commit -m "chore: 初始化雨读 monorepo 脚手架"
```

---

### Task 2: D1 迁移与本地数据库

**Files:**
- Create: `apps/api/migrations/0001_init.sql`
- Modify: `apps/api/wrangler.toml`（确认 migrations 目录）
- Create: `apps/api/.dev.vars.example`

**Interfaces:**
- Produces: 可 `wrangler d1 migrations apply yudu --local` 得到完整表

- [ ] **Step 1: 写迁移 SQL**

`apps/api/migrations/0001_init.sql`:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  cover_r2_key TEXT,
  source_r2_key TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_books_user ON books(user_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  UNIQUE(book_id, idx)
);

CREATE TABLE reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  char_offset INTEGER NOT NULL,
  page_in_chapter INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'night',
  font_size INTEGER NOT NULL DEFAULT 18,
  line_height REAL NOT NULL DEFAULT 1.75,
  page_margin TEXT NOT NULL DEFAULT 'normal',
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 2: 应用本地迁移**

```bash
cd apps/api
pnpm exec wrangler d1 migrations apply yudu --local
```

Expected: 成功应用 `0001_init.sql`。

- [ ] **Step 3: `.dev.vars.example`**

```
SESSION_SECRET=dev-only-change-me-to-long-random
```

复制为 `.dev.vars`（不提交）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations apps/api/.dev.vars.example apps/api/wrangler.toml
git commit -m "feat(api): 添加 D1 初始迁移"
```

---

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

### Task 4: 认证路由（注册 / 登录 / 登出 / me）

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts` 挂载路由
- Create: `apps/api/src/routes/auth.test.ts`（可用 miniflare/vitest-pool-workers 或对 Hono app 注入 mock DB；若本地 mock 成本过高，则用 wrangler + 脚本手工测并保留关键单测在 password/session）

**Interfaces:**
- `POST /api/auth/register` body `{ email, password }` → 201 + user；Set-Cookie
- `POST /api/auth/login` → 200 + user；Set-Cookie
- `POST /api/auth/logout` → 204；清 Cookie
- `GET /api/me` → 200 user | 401
- 密码最少 8 位；email 小写 trim；重复邮箱 `409 EMAIL_TAKEN`

- [ ] **Step 1: 实现 routes/auth.ts 并挂载**

注册时同时插入默认 `user_preferences`（theme=night, fontSize=18, lineHeight=1.75, pageMargin=normal）。

Cookie 属性：`HttpOnly; Path=/; SameSite=Lax; Max-Age=...`；生产加 `Secure`（`c.req.url` 为 https 时）。

- [ ] **Step 2: 本地验证**

```bash
# terminal 1
pnpm --filter @yudu/api dev

# terminal 2
curl -c cookies.txt -X POST http://127.0.0.1:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"a@test.com\",\"password\":\"password1\"}"
curl -b cookies.txt http://127.0.0.1:8787/api/me
```

Expected: me 返回同一 email。

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(api): 注册登录登出与 /api/me"
```

---

### Task 5: 前端 API 客户端、路由与认证页

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/auth.tsx`
- Create: `apps/web/src/pages/LandingPage.tsx`, `LoginPage.tsx`, `RegisterPage.tsx`, `LibraryPage.tsx`（占位）, `SettingsPage.tsx`（占位）
- Modify: `apps/web/src/App.tsx`, `apps/web/src/main.tsx`

**Interfaces:**
- `api<T>(path, init): Promise<T>`：`credentials: 'include'`；非 ok 抛 `ApiError`
- `AuthProvider`：`user`, `loading`, `login`, `register`, `logout`, `refresh`
- 路由守卫：未登录访问 `/library` → `/login`

- [ ] **Step 1: 实现 api.ts 与 auth.tsx**

- [ ] **Step 2: 实现登录/注册表单 UI（雨夜风格卡片）**

校验：前端密码 ≥8；错误展示 `error.message`。

- [ ] **Step 3: 代理联调**

同时开 `dev:api` 与 `dev:web`，浏览器完成注册→进入书架占位页。

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): 认证页面与会话上下文"
```

---

### Task 6: TXT / MD 解析器（TDD）

**Files:**
- Create: `apps/api/src/parsers/types.ts`
- Create: `apps/api/src/parsers/txt.ts`, `txt.test.ts`
- Create: `apps/api/src/parsers/md.ts`, `md.test.ts`
- Create: `apps/api/fixtures/sample.txt`, `sample.md`

**Interfaces:**
```ts
// parsers/types.ts
export interface ParsedChapter {
  title: string;
  text: string; // 纯文本，段落用 \n\n
}
export interface ParseResult {
  title: string;
  author: string | null;
  chapters: ParsedChapter[];
}
export function parseTxt(bytes: Uint8Array, filename: string): ParseResult;
export function parseMd(bytes: Uint8Array, filename: string): ParseResult;
```

- [ ] **Step 1: 写 txt 测试（先失败）**

Fixture 含两章：`第一章 开端\n\n正文甲\n\n第二章 继续\n\n正文乙`  
及 GBK 编码样例（可用预置二进制或跳过若生成困难——至少 UTF-8 两章 + 无标题整本一章）。

```ts
it("按「第×章」分章", () => {
  const r = parseTxt(new TextEncoder().encode(sample), "书.txt");
  expect(r.chapters).toHaveLength(2);
  expect(r.chapters[0].title).toMatch(/第一/);
});
```

- [ ] **Step 2: 实现 parseTxt**

编码：TextDecoder utf-8 fatal → 失败则用 `TextDecoder('gbk')`（nodejs_compat）或第三方；再失败 throw。

- [ ] **Step 3: 写 md 测试并实现**

- 去掉 `---` front matter  
- 以 `## ` 或 `# ` 分章：规则固定为 **优先用 `## ` 若存在至少 2 个，否则用 `# `**；若都没有，整篇一章，title=文件名  
- 剥离简单 markdown 标记为纯文本（`**` `*` `#` 行内）

- [ ] **Step 4: 测试通过后 Commit**

```bash
pnpm --filter @yudu/api test
git commit -am "feat(api): txt 与 md 解析器"
```

---

### Task 7: EPUB 解析器（TDD）

**Files:**
- Create: `apps/api/src/parsers/epub.ts`, `epub.test.ts`
- Create: `apps/api/fixtures/minimal.epub`（手写最小 ZIP：mimetype、container.xml、content.opf、一章 xhtml）
- Modify: `apps/api/package.json` 增加 `fflate` 或 `jszip`（选 **fflate** 更轻）

**Interfaces:**
- `parseEpub(bytes: Uint8Array, filename: string): Promise<ParseResult>`
- 可选返回 `coverBytes?: Uint8Array` 与 mime（扩展 ParseResult 或并行返回类型 `ParseResult & { cover?: { bytes: Uint8Array; contentType: string } }`）

- [ ] **Step 1: 生成 minimal.epub fixture 并写测试期望 chapters≥1**

- [ ] **Step 2: 实现：解压 → container → opf spine → 提文本**

HTML 去标签策略：`replace(/<script[\s\S]*?<\/script>/gi,"")` 等，再 `replace(/<[^>]+>/g,"")`，`&nbsp;` 等基础实体解码。

- [ ] **Step 3: 测试 PASS + Commit**

```bash
git commit -am "feat(api): epub 解析器"
```

---

### Task 8: R2 存储、封面、导入服务与书籍 API

**Files:**
- Create: `apps/api/src/services/storage.ts`
- Create: `apps/api/src/services/cover.ts`
- Create: `apps/api/src/services/importBook.ts`
- Create: `apps/api/src/routes/books.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
```ts
// storage
r2Key.source(userId, bookId, filename): string
r2Key.chapter(userId, bookId, idx): string
r2Key.cover(userId, bookId): string
putText/getText/putBytes/deletePrefix

// cover
generateCoverSvg(title: string, author: string | null): string // SVG 字符串，存 R2 为 image/svg+xml

// importBook
importBook(env, userId, file: { name: string; bytes: Uint8Array }): Promise<BookSummary>

// routes
POST /api/books/import   multipart field "file"
GET  /api/books
GET  /api/books/:id
DELETE /api/books/:id
GET  /api/books/:id/chapters/:idx
GET  /api/books/:id/cover  // 流式返回封面，鉴权后读 R2
```

- [ ] **Step 1: 实现 storage 与 cover**

抽象封面：深色背景 + 琥珀装饰线 + 书名（SVG text）。

- [ ] **Step 2: 实现 importBook**

流程：校验扩展名与 `MAX_UPLOAD_BYTES` → 建 book `processing` → put source → parse → 每章 put R2 JSON `{title,text}` → insert chapters → cover → `ready`；catch → `failed` + message。

title 默认：解析结果 title 或去掉扩展名的文件名。

- [ ] **Step 3: 实现 books 路由（全部 require auth）**

列表 join 进度算 `progressPercent`：  
`((chapterIndex + charOffset/ max(charCount,1)) / chapterCount) * 100` 粗算即可。

删除：删 R2 对象（列前缀或记录 keys）+ D1 cascade。

章节：`GET` 校验 book 属主，读 R2，返回 `ChapterContent`。

- [ ] **Step 4: curl 导入 UTF-8 txt 验证**

```bash
curl -b cookies.txt -F "file=@apps/api/fixtures/sample.txt" http://127.0.0.1:8787/api/books/import
curl -b cookies.txt http://127.0.0.1:8787/api/books
```

Expected: status ready，chapterCount≥1。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(api): 书籍导入与章节读取 API"
```

---

### Task 9: 书架页 UI（列表、导入、删除）

**Files:**
- Create: `apps/web/src/components/BookCard.tsx`
- Create: `apps/web/src/components/ImportDropzone.tsx`
- Modify: `apps/web/src/pages/LibraryPage.tsx`
- Modify: `apps/web/src/lib/api.ts` 增加 books 方法

**Interfaces:**
- 响应式网格：`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- 拖拽/点击导入；processing 轮询列表至 ready/failed（2s 间隔，最多 60 次）
- 卡片点击 → `/read/:bookId`（ready 才可）
- 删除：确认后 DELETE

- [ ] **Step 1: 实现组件与页面**

视觉：封面 2:3；悬停 translateY(-2px)+阴影；空状态文案「导入第一本书，在雨夜里打开它」。

- [ ] **Step 2: 手动验证导入与展示**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): 书架与导入交互"
```

---

### Task 10: 前端分页算法（TDD）

**Files:**
- Create: `apps/web/src/lib/pagination.ts`
- Create: `apps/web/src/lib/pagination.test.ts`
- Modify: `apps/web/package.json` 确保 vitest + jsdom/happy-dom

**Interfaces:**
```ts
export interface PageMetrics {
  width: number;      // 内容区 css px
  height: number;
  fontSize: number;
  lineHeight: number; // 倍数
  fontFamily: string;
  paragraphGap: number;
}

/** 返回每页起始 char offset（最后隐式到 text.length） */
export function paginateText(text: string, metrics: PageMetrics): number[];

/** 给定 offset 找页码 0-based */
export function pageIndexForOffset(pageStarts: number[], offset: number): number;
```

- [ ] **Step 1: 写测试**

因 Node 无真实布局，**分页实现采用「估算模型」而非 DOM 测量**（规格允许客户端分页；为可测与 Workers 无关，用 canvas 或纯逻辑）：

**锁定实现策略（可测、稳定）：**
- 使用固定字符宽度近似：中文宽 ≈ `fontSize`，ASCII ≈ `fontSize * 0.55`
- 行高 `fontSize * lineHeight`
- 按段落 `\n\n` 分割，段内按字符累加宽换行
- 填满 `height` 则新页  
此策略在 UI 用同一函数，保证测试与运行一致。若后续要 DOM 精测，可替换实现但保留接口。

测试：
```ts
it("空文本一页", () => {
  expect(paginateText("", metrics)).toEqual([0]);
});
it("长文本多页且 offset 映射稳定", () => {
  const text = "测".repeat(5000);
  const starts = paginateText(text, { width: 320, height: 480, fontSize: 18, lineHeight: 1.75, fontFamily: "serif", paragraphGap: 12 });
  expect(starts.length).toBeGreaterThan(3);
  expect(pageIndexForOffset(starts, starts[2])).toBe(2);
});
```

- [ ] **Step 2: 实现并 PASS**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): 可测试的左右翻页分页算法"
```

---

### Task 11: 阅读器页面（翻页、目录、预取章）

**Files:**
- Create: `apps/web/src/hooks/usePagination.ts`
- Create: `apps/web/src/components/ReaderViewport.tsx`
- Create: `apps/web/src/components/ReaderChrome.tsx`
- Create: `apps/web/src/components/TocDrawer.tsx`
- Create: `apps/web/src/pages/ReaderPage.tsx`
- Modify: `apps/web/src/App.tsx` 路由

**Interfaces:**
- `ReaderPage` 加载 `BookDetail` + progress + preferences
- 拉当前章 `ChapterContent`，`paginateText` 得页；显示 `text.slice(start, end)`
- 手势：pointer 事件左右滑阈值 > 50px；点击左 30% / 右 30% 热区；键盘 ArrowLeft/Right
- 中央 40% 切换 chrome 显隐
- 章末下一页 → chapter+1 offset 0；章首上一页 → 上章最后一页
- `prefers-reduced-motion: reduce` 时无位移动画

- [ ] **Step 1: 实现 ReaderViewport 与键盘/点击/滑动**

正文字体 CSS：
```css
.reader-page {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  color: var(--text);
  background: var(--page-bg);
}
```

版心：外层 flex 居中，内层 `width: min(100%, 720px)`，padding 随 `pageMargin`。

- [ ] **Step 2: TocDrawer 跳章**

- [ ] **Step 3: 手动验证样例书完整翻页**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): 左右翻页阅读器与目录"
```

---

### Task 12: 进度 API 与前端同步

**Files:**
- Create: `apps/api/src/routes/progress.ts`
- Create: `apps/web/src/hooks/useProgressSync.ts`
- Modify: `apps/api/src/index.ts`, `ReaderPage.tsx`

**Interfaces:**
- `GET /api/progress/:bookId` → ReadingProgress | 默认 chapter 0 offset 0
- `PUT /api/progress/:bookId` body `{ chapterIndex, charOffset, pageInChapter? }`
- `useProgressSync`：本地 state；防抖 1000ms PUT；`visibilitychange` hidden 时 flush

- [ ] **Step 1: API 实现 + curl 验证**

- [ ] **Step 2: 接入 ReaderPage：进入时 GET，翻页更新 offset=pageStarts[page]**

- [ ] **Step 3: 刷新浏览器应回到附近页**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: 阅读进度云同步"
```

---

### Task 13: 偏好设置、主题切换、设置页

**Files:**
- Create: `apps/api/src/routes/preferences.ts`
- Create: `apps/web/src/components/ThemeProvider.tsx`
- Modify: `SettingsPage.tsx`, `ReaderChrome.tsx`, `App.tsx`

**Interfaces:**
- `GET/PUT /api/preferences`
- fontSize 范围 14–28；lineHeight 1.4–2.2
- ThemeProvider：`document.documentElement.setAttribute('data-theme', theme)`
- 阅读器内改字号立即重分页并保持 charOffset

- [ ] **Step 1: API + 前端设置页（主题、字号、行距、边距、登出）**

- [ ] **Step 2: 阅读器工具栏快捷改字号/主题**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: 用户阅读偏好与双主题"
```

---

### Task 14: 落地页视觉打磨与全局响应式

**Files:**
- Modify: `LandingPage.tsx`, `index.css`, 各 page 细调
- Create: `apps/web/index.html` 标题「雨读」、meta viewport

**Interfaces:**
- 落地页：产品名、一句话、登录/注册 CTA、装饰性阅读预览帧
- 统一 focus ring：`outline: 2px solid var(--accent)`
- 安全区：`env(safe-area-inset-*)` 用于阅读底栏

- [ ] **Step 1: 实现落地页与细节**

- [ ] **Step 2: 用浏览器 375 / 768 / 1280 宽度检查无横向滚动条、书架与阅读可用**

- [ ] **Step 3: Commit**

```bash
git commit -am "style(web): 雨夜书房落地页与响应式打磨"
```

---

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
