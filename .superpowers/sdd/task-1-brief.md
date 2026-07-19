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

