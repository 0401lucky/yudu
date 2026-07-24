# 目录结构 — @yudu/api

## 包布局

```
apps/api/
├── src/
│   ├── index.ts              # Hono 应用入口、CORS、/api 挂载、SPA 回退
│   ├── env.ts                # Env 绑定类型（DB / BOOKS_BUCKET / SESSION_SECRET / …）
│   ├── middleware/
│   │   └── auth.ts           # Cookie 会话 → c.set("userId")
│   ├── routes/
│   │   ├── auth.ts           # 注册 / 登录 / 登出 / me
│   │   ├── books.ts          # 导入、列表、详情、章节、封面、删除
│   │   ├── progress.ts       # 阅读进度 GET/PUT
│   │   ├── preferences.ts    # 用户偏好 GET/PUT
│   │   └── *.test.ts         # 路由级 vitest（mock D1）
│   ├── services/
│   │   ├── session.ts        # 会话创建 / 解析 / 删除（HMAC token hash）
│   │   ├── password.ts       # PBKDF2 哈希与校验
│   │   ├── importBook.ts     # 批量导入、系列合并、删书
│   │   ├── storage.ts        # R2 key 与读写封装
│   │   └── cover.ts          # SVG 封面生成
│   └── parsers/
│       ├── types.ts          # ParseResult / ParsedChapter（新格式统一输出）
│       ├── txt.ts / md.ts / epub.ts
│       ├── （无 pdf.ts）      # PDF 不走解析器：importBook 短路存 R2 原件，
│       │                     # routes/books 的 /:id/source 透传给前端 pdf.js
│       └── *.test.ts
├── migrations/
│   └── 0001_init.sql         # D1 迁移
├── fixtures/                 # 解析测试样例（txt/md/epub）
├── wrangler.toml
└── package.json              # @yudu/api
```

## 分层规则

| 层 | 放什么 | 不放什么 |
|----|--------|----------|
| `routes/` | HTTP 方法、参数解析、`authMiddleware`、状态码、`c.json` 映射 | 复杂解析、R2 批量写入细节 |
| `services/` | D1/R2 事务式流程、会话/密码、导入合并逻辑 | 直接读 `c.req` |
| `parsers/` | 字节 → `ParseResult`（纯函数向） | 写库、写 R2、鉴权 |
| `middleware/` | 跨路由横切（鉴权） | 业务分支 |

**参考实现：**

- 导入：`routes/books.ts` 收 FormData → `services/importBook.importBooksBatch`
- 鉴权：`middleware/auth.ts` → `services/session.resolveSession`
- 解析：`importBook` 按扩展名调 `parseTxt` / `parseMd` / `parseEpub`

## 命名约定

- 文件：camelCase（`importBook.ts`、`auth.ts`）
- 路由导出：`xxxRoutes`（如 `booksRoutes`），`Hono<{ Bindings: Env; Variables: AuthVariables }>`
- 环境：只通过 `c.env` / 函数参数 `env: Env` 访问绑定，不读全局

## 新增功能放哪里

| 需求 | 位置 |
|------|------|
| 新 REST 资源 | `routes/<name>.ts`，在 `index.ts` `app.route` |
| 需登录 | `xxxRoutes.use("*", authMiddleware)` |
| 新存储逻辑 | `services/` + 必要时 `migrations/` |
| 新文件格式 | `parsers/<fmt>.ts` + `importBook.detectFormat` + shared `SUPPORTED_FORMATS` |

## 反模式

- 在 `index.ts` 堆业务逻辑（入口只做挂载与 CORS / SPA）
- 路由里直接大段 `BOOKS_BUCKET.put` 而不经 `storage.ts`
- 新建「utils 垃圾桶」；优先落在现有 service / parser
