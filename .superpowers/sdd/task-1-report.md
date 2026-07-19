# Task 1 报告：脚手架与工作区

## 状态

**DONE**

## 摘要

已初始化雨读 monorepo：根 workspace、`@yudu/shared`、`@yudu/api`（Hono + Wrangler 占位）、`@yudu/web`（Vite + React + Tailwind 占位）。安装、API 健康检查、web 生产构建与 typecheck 均通过。

## 提交

| SHA | 说明 |
|-----|------|
| `4ee73ce` | chore: 初始化雨读 monorepo 脚手架 |

分支：`feat/yudu-reader`

## 创建的文件

### 根目录
- `package.json` — workspace scripts（dev:web / dev:api / build / test / typecheck）
- `pnpm-workspace.yaml` — `apps/*`、`packages/*`
- `.gitignore` — node_modules、dist、.wrangler、env、`*.tsbuildinfo` 等
- `README.md` — 项目简介与开发命令
- `pnpm-lock.yaml` — 锁文件（随 install 生成）

### `packages/shared`
- `package.json`、`tsconfig.json`
- `src/constants.ts` — MAX_UPLOAD_BYTES、SUPPORTED_FORMATS、SESSION_* 等
- `src/types.ts` — Book/User/Progress/Preferences/ApiError 等共享类型
- `src/index.ts` — re-export

### `apps/api`
- `package.json` — hono、`@yudu/shared: workspace:*`、wrangler 等
- `tsconfig.json`、`wrangler.toml`（D1 `DB` + R2 `BOOKS_BUCKET`）
- `src/env.ts` — Env 类型
- `src/index.ts` — `GET /api/health` → `{ ok: true, name: "雨读" }`

### `apps/web`
- `package.json` — react、react-dom、react-router-dom、`@yudu/shared`、vite、tailwind
- `vite.config.ts` — `/api` 代理到 `http://127.0.0.1:8787`
- `tsconfig.json`、`index.html`、`postcss.config.js`、`tailwind.config.js`
- `src/main.tsx`、`src/App.tsx`（标题「雨读」+ 副文案「雨夜书房」）
- `src/index.css` — Tailwind 指令 + 雨夜书房 CSS 变量（night/paper）
- `src/vite-env.d.ts`

## 验证

| 步骤 | 结果 |
|------|------|
| `pnpm install` | 成功（4 workspace projects，~3.5min） |
| `wrangler dev --port 8787` | Ready on http://127.0.0.1:8787 |
| `GET /api/health` | `{"ok":true,"name":"雨读"}`（控制台中文可能因编码乱码，源码与响应体正确） |
| `pnpm --filter @yudu/web build` | 成功（vite build，27 modules） |
| `tsc --noEmit`（shared / api / web） | 成功 |

未在浏览器中人工打开 `pnpm --filter @yudu/web dev`，但生产构建已包含 App 文案与样式，dev 应可同样渲染。

## 自检（Self-review）

### 符合 brief
- [x] root workspace 文件
- [x] shared 包类型与常量按 brief 原文
- [x] api Hono 健康检查占位 + wrangler.toml 绑定
- [x] web Vite React-TS + Tailwind + 代理 + 雨读/雨夜书房 + CSS 变量
- [x] 可 install；health 可用；web 可 build
- [x] 提交信息按要求

### 相对 brief 的合理补充（YAGNI 内）
- web：`postcss.config.js`、`tailwind.config.js`、`vite-env.d.ts`（Tailwind/Vite 必需）
- 各包 `tsconfig.json`（typecheck 必需）
- `.gitignore` 增加 `*.tsbuildinfo`（避免提交 tsc 增量缓存）
- 提交包含 `pnpm-lock.yaml`（可复现安装）

### 关注点 / 非阻塞
1. **pnpm 版本**：`packageManager` 声明 `pnpm@9.15.0`，本机实际为 10.x；install 正常，后续可用 corepack 对齐。
2. **wrangler**：本地为 3.114.17，提示可升级到 4.x；当前 health 正常。
3. **SESSION_SECRET**：`Env` 已声明，本地 dev 未配置 `.dev.vars`；health 不依赖该绑定，后续鉴权任务再补。
4. **shared 的 test script**：`vitest run` 尚无测试文件，直接跑 `test` 可能无用例或失败；本任务未要求写测试。
5. **web `build` 使用 `tsc -b`**：当前单包可用；若日后加 project references 再调整。

## 后续任务可用前提

- `pnpm install` / `pnpm dev:api` / `pnpm dev:web` 已可跑
- `@yudu/shared` 可被 web/api 以 `workspace:*` 引用
- API 路由约定前缀 `/api/*`，web 代理已就绪
