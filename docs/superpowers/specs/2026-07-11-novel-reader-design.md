# 雨读 · 阅读器设计文档（历史稿）

**日期：** 2026-07-11  
**状态：** 架构与实现仍可参考；**产品定位已更新**  
**形态：** Cloudflare 可部署的响应式 Web 应用  
**实现路线：** 方案 1 — SPA + Worker API + D1 + R2  

> ⚠️ **2026-07-20 定位变更**  
> 雨读现为 **通用在线阅读器**（文档 / 笔记 / 电子书等），不再限定「小说」。  
> AI 与开发者请以 [`.trellis/spec/guides/product-positioning.md`](../../../.trellis/spec/guides/product-positioning.md) 为准。  
> 下文仍含早期「小说」措辞，仅作架构与范围历史记录；PDF 等扩展按新定位规划。

---

## 1. 背景与目标

### 1.1 要解决什么

做一个**好看**的中文阅读器（早期目标偏小说）：支持账号、云端书架与进度同步，可导入本地文件，在手机 / 平板 / 电脑上沉浸阅读。

### 1.2 成功标准

- 在 Cloudflare 上一键可部署（Pages + Worker + D1 + R2）
- 布局响应式：手机、平板、桌面均可用，阅读区舒适
- 支持注册登录；书籍与进度按用户隔离并云端同步
- 导入 **txt / md / epub** 后可左右翻页阅读
- 视觉达到「精装独立产品」水准，而非模板后台或网文站皮肤
- 不修改、不依赖仓库外的 `随笔/` 目录（可作样例内容参考）

### 1.3 非目标（第一版不做）

- PDF 阅读（仅预留格式扩展点）
- 连续滚动阅读模式（可后续加）
- 社交、评论、书城、版权分发
- 多人共享书架 / 家庭账号
- 原生 App / 桌面壳（Electron / Tauri）
- 服务端整本预分页缓存（首版客户端按章测量分页）

---

## 2. 用户与核心流程

### 2.1 目标用户

主要是本人：导入自己的小说（含自写 md 章节或常见网文 txt / epub），跨设备接着读。

### 2.2 核心流程

1. **注册 / 登录** → 进入书架  
2. **导入文件**（拖拽或选择）→ 解析 → 上传云端 → 书架出现封面与书名  
3. **打开书籍** → 左右翻页阅读 → 进度自动同步  
4. **换设备登录** → 书架与进度恢复  
5. **阅读设置** → 主题 / 字号 / 行距等写入偏好并影响分页  

---

## 3. 系统架构

### 3.1 总览

```
┌─────────────────────────────────────┐
│  浏览器 SPA（Vite + React + TS）     │
│  书架 UI · 导入 · 左右翻页阅读器     │
└─────────────────┬───────────────────┘
                  │ HTTPS / Cookie 会话
                  ▼
┌─────────────────────────────────────┐
│  Cloudflare Pages                    │
│  静态资源 + SPA 回退路由               │
└─────────────────┬───────────────────┘
                  │ /api/*
                  ▼
┌─────────────────────────────────────┐
│  Cloudflare Worker（Hono）           │
│  鉴权 · 书籍 CRUD · 上传 · 解析调度    │
├──────────────┬──────────────────────┤
│  D1          │  R2                   │
│  用户/会话    │  原始文件（可选）       │
│  书籍元数据   │  分章正文              │
│  章节目录     │  封面                  │
│  进度/偏好    │                        │
└──────────────┴──────────────────────┘
```

### 3.2 职责边界

| 层 | 职责 |
|----|------|
| **SPA** | UI/动效、导入校验、章节拉取、版心测量与左右翻页、本地乐观更新进度 |
| **Worker API** | 鉴权、授权校验、元数据 CRUD、R2 读写、格式解析、错误状态 |
| **D1** | 结构化、可查询的小数据 |
| **R2** | 大文本与二进制（章节、封面、原始上传） |

### 3.3 技术选型（锁定）

| 领域 | 选择 | 说明 |
|------|------|------|
| 前端 | Vite + React 19 + TypeScript | 组件生态成熟，适合复杂阅读器状态 |
| 样式 | Tailwind CSS + CSS 变量主题 | 响应式与双主题高效 |
| 路由 | React Router | SPA 多页 |
| API | Hono on Workers | 轻量、类型友好 |
| 数据库 | Cloudflare D1 | SQLite 语义，账号/进度足够 |
| 对象存储 | Cloudflare R2 | 章节正文与封面 |
| 鉴权 | 邮箱+密码 + HttpOnly Cookie 会话 | MVP 简单可靠；后续可加 OAuth |
| 密码 | 强哈希（如 bcrypt/argon2 的 Workers 可用实现） | 不明文存储 |
| 部署 | Cloudflare Pages（前端）+ Worker 绑定 D1/R2 | 与账号体系统一 |
| 包管理 | pnpm（或 npm，实现时二选一写死） |  monorepo 或单仓双入口均可 |

推荐仓库结构（单仓）：

```
/
├── apps/web/          # Vite React SPA
├── apps/api/          # Hono Worker
├── packages/shared/   # 共享类型、校验 schema
├── docs/superpowers/  # 设计与计划
└── wrangler.toml      # 或分应用各自配置
```

若为降低脚手架成本，也可 **单包**：`src/client` + `src/worker`，设计约束不变。

---

## 4. 信息架构与路由

| 路由 | 未登录 | 已登录 |
|------|--------|--------|
| `/` | 品牌落地页（简介 + 登录/注册入口） | 重定向 `/library` |
| `/login` | 登录 | 重定向书架 |
| `/register` | 注册 | 重定向书架 |
| `/library` | 重定向登录 | 书架：导入、列表、搜索 |
| `/read/:bookId` | 重定向登录 | 沉浸阅读 |
| `/settings` | 重定向登录 | 账号、主题默认、登出 |

深链：`/read/:bookId?chapter=` 可选，用于目录跳转；进度仍以服务端记录为准（冲突时服务端更新时间更新）。

---

## 5. 数据模型

### 5.1 D1 表

#### users

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| email | TEXT UNIQUE | 小写规范化 |
| password_hash | TEXT | |
| display_name | TEXT NULL | 可选 |
| created_at | INTEGER | Unix ms |
| updated_at | INTEGER | |

#### sessions

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT FK | |
| token_hash | TEXT | 只存哈希 |
| expires_at | INTEGER | |
| created_at | INTEGER | |

#### books

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| user_id | TEXT FK | 隔离 |
| title | TEXT | |
| author | TEXT NULL | |
| format | TEXT | `txt` \| `md` \| `epub`（预留 `pdf`） |
| cover_r2_key | TEXT NULL | |
| source_r2_key | TEXT NULL | 原始文件，可选 |
| status | TEXT | `processing` \| `ready` \| `failed` |
| error_message | TEXT NULL | status=failed 时 |
| chapter_count | INTEGER | 默认 0 |
| created_at | INTEGER | |
| updated_at | INTEGER | |

#### chapters

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| book_id | TEXT FK | |
| idx | INTEGER | 从 0 连续 |
| title | TEXT | |
| r2_key | TEXT | 章节正文对象 |
| char_count | INTEGER | 用于进度估算等 |
| UNIQUE(book_id, idx) | | |

#### reading_progress

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT | |
| book_id | TEXT | |
| chapter_index | INTEGER | |
| char_offset | INTEGER | 章内字符偏移（分页重算后的稳定锚点） |
| page_in_chapter | INTEGER | 展示用，可能因版式变化失效 |
| updated_at | INTEGER | |
| PRIMARY KEY (user_id, book_id) | | |

**进度权威字段：`chapter_index` + `char_offset`。**  
`page_in_chapter` 仅作 UI 提示；字号/窗口变化后由 `char_offset` 映射到新页码。

#### user_preferences

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT PK | |
| theme | TEXT | `night` \| `paper` |
| font_size | INTEGER | px，有合理上下限 |
| line_height | REAL | 如 1.75 |
| page_margin | TEXT | `compact` \| `normal` \| `relaxed` |
| updated_at | INTEGER | |

### 5.2 R2 键约定

```
users/{userId}/books/{bookId}/source/{filename}
users/{userId}/books/{bookId}/chapters/{idx}.json   # 或 .txt
users/{userId}/books/{bookId}/cover.webp
```

章节对象建议 JSON：`{ "title": "...", "text": "..." }`，便于扩展。

### 5.3 所有权

任何 book / chapter / progress / R2 对象访问前必须校验 `user_id === session.user_id`。禁止仅凭 `bookId` 猜测访问。

---

## 6. API 设计（概要）

前缀：`/api`。会话：`Cookie: session=...`（HttpOnly、Secure、SameSite=Lax）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | `{ email, password }` |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | 清会话 |
| GET | `/api/me` | 当前用户 |
| GET | `/api/books` | 书架列表 |
| POST | `/api/books/import` | multipart 上传并触发解析 |
| GET | `/api/books/:id` | 元数据 + 章节目录 |
| DELETE | `/api/books/:id` | 删书（D1 + R2） |
| GET | `/api/books/:id/chapters/:idx` | 取章正文（可短时缓存头） |
| GET | `/api/progress/:bookId` | 读进度 |
| PUT | `/api/progress/:bookId` | 写进度 `{ chapter_index, char_offset }` |
| GET/PUT | `/api/preferences` | 阅读偏好 |

错误响应统一：`{ "error": { "code": "...", "message": "..." } }`，HTTP 状态码语义化。

**导入超时：** Worker CPU/时长有限；MVP 同步解析即可，限制文件大小。若接近限制，状态保持 `processing` 并在后续迭代改为 Queue。第一版明确 **同步解析 + 体积上限**。

---

## 7. 导入与解析

### 7.1 通用流程

1. 前端校验扩展名与大小（建议上限 **30MB**，可配置）  
2. `POST /api/books/import`  
3. API：鉴权 → 写入 R2 source → 插入 `books`（`processing`）→ 解析  
4. 成功：写 chapters + R2 正文 + 更新 `ready`  
5. 失败：`failed` + `error_message`，书架可重试/删除  

### 7.2 格式规则

#### TXT

- 编码：优先 UTF-8；失败则尝试 GBK/GB18030（中文网文常见）  
- 分章启发式（按优先级）：  
  - `^第[零一二三四五六七八九十百千0-9]+章`  
  - `^Chapter\s+\d+`  
  - Markdown 风格行首 `#`  
- 无匹配：整本作为一章，标题用文件名  

#### Markdown

- 按 ATX 标题 `#` / `##` 分章（取更深或仅一级策略实现时写死一种：**以 `#` 或 `##` 中先出现的层级为主，同一文档保持一致**）  
- 正文：去 YAML front matter；渲染为纯文本段落流（阅读器不跑完整 MD 组件生态，保留段落与基础强调即可）  

#### EPUB

- 解压 ZIP → `META-INF/container.xml` → OPF → spine 顺序  
- 提取各 HTML/XHTML 文本，去脚本/样式，保留段落  
- 标题：优先 nav/toc，否则 HTML title / 文件名  
- 封面：若存在 cover image，转存 R2  

#### PDF（预留，不做）

- `format` 枚举可扩展 `pdf`  
- 解析器注册表模式：`parsers[format]`  
- 首版 UI 选择器不展示 PDF，或展示为「即将支持」禁用  

### 7.3 封面

- 有 epub 封面则用  
- 否则服务端或导入完成后前端生成 **书名抽象封面**（几何纹理 + 书名），上传 R2  
- 书架卡片统一竖版比例（约 2:3）  

---

## 8. 阅读器：左右翻页

### 8.1 分页模型

- **按章分页**：只对当前章（及预取邻章）做版心测量  
- 测量层：与可见页相同的 CSS（字号、行高、字体、宽度、内边距）  
- 输出：页数组，每页对应章内 `[startOffset, endOffset)`  
- 稳定进度：`char_offset` = 当前页 `startOffset`  

### 8.2 交互

| 输入 | 行为 |
|------|------|
| 点击右侧热区 / 左滑 / → | 下一页 |
| 点击左侧热区 / 右滑 / ← | 上一页 |
| 本章末页再下一页 | 跳转下一章第 1 页 |
| 本章首页再上一页 | 跳转上一章最后一页（需先拉上一章并分页） |
| 点击中央 | 显隐工具栏 |
| 目录选择章节 | 跳章，offset=0 |

动画：水平位移动画 + 轻阴影；时长约 200–280ms；减弱动效遵循 `prefers-reduced-motion`。

### 8.3 版式变化

字号、行距、边距、窗口 resize、旋转屏幕时：

1. 记录当前 `char_offset`  
2. 重新测量分页  
3. 找到包含该 offset 的新页并跳转  

### 8.4 进度同步

- 本地立即更新  
- 防抖 **800ms–1500ms** 后 `PUT /api/progress`  
- 页面 `visibilitychange` / `beforeunload` 时尽量 flush  
- 多端：以后写入为准（`updated_at`）；不做 OT  

### 8.5 响应式版心

| 断点 | 阅读栏 |
|------|--------|
| 手机 | 近全宽，水平 padding 适中 |
| 平板 | 居中，max-width ~640px |
| 桌面 | 居中，max-width ~720px；两侧大热区 |

竖屏 / 横屏均保持可读行长（约 30–40 中文字/行 为目标，随字号浮动）。

---

## 9. 界面与视觉设计

### 9.1 设计主题名：**雨夜书房**

用户要求「好看」且授权审美代定，定调如下：

- **默认：深夜书房（night）**  
  - 背景：近黑偏墨绿 `#0c0f0e` – `#121816`  
  - 正文：暖灰 `#e6e2d6`  
  - 强调：琥珀金 `#c4a574`  
  - 次要文字：低对比灰绿  
- **可选：纸页（paper）**  
  - 背景：米白 `#f4efe4`  
  - 正文：深墨 `#1c1916`  
  - 强调：赭石 / 墨棕  
- **字体：**  
  - 正文：`"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif`（实现时用可合法加载的网络字体或系统回退，避免侵权字体）  
  - UI：无衬线系统栈，干净克制  
- **书架：** 竖版封面网格；悬停微抬升与阴影；空状态有插画式文案引导导入  
- **阅读页：** 默认沉浸隐藏 chrome；工具栏毛玻璃或实色弱对比条，不抢正文  
- **动效：** 短、软；禁止紫粉霓虹、大面积无意义渐变、廉价 3D 翻书  
- **品牌感：** 产品名可暂定 **「雨读」** 或 **「页间」**（实现前可改）；落地页一句话定位 + 精致 mock 阅读帧  

### 9.2 关键界面结构

**书架**

- 顶栏：产品名、搜索、导入按钮、设置入口  
- 主体：响应式网格（2 / 3 / 4–5 列）  
- 卡片：封面、书名、作者、进度百分比、状态徽标（处理中/失败）  
- 导入：拖拽浮层 + 文件选择；处理中卡片骨架屏  

**阅读**

- 底层：翻页画布  
- 顶栏（可隐）：返回、书名、目录  
- 底栏（可隐）：章内页进度、全局粗进度、设置（字号/主题/行距）  
- 目录抽屉：从左侧滑出章节列表  

**登录 / 注册**

- 居中卡片，与整体暗色调一致；表单极简；错误行内提示  

### 9.3 无障碍与基础体验

- 可聚焦控件有可见 focus ring  
- 对比度在 night/paper 下均达到可读  
- 触控热区 ≥ 44px（工具栏按钮）  
- 支持键盘翻页  

---

## 10. 错误处理

| 场景 | 处理 |
|------|------|
| 错误密码 / 邮箱已注册 | 400 + 明确文案，不泄露多余信息 |
| 未登录访问 API | 401，前端跳转登录 |
| 访问他人书籍 | 404（不暴露存在性）或 403 |
| 不支持格式 | 导入前拦截 + API 校验 |
| 编码失败 / epub 损坏 | `failed` + 可读原因 |
| 文件过大 | 前端 + API 双重拒绝 |
| 章节拉取失败 | 阅读页 toast + 重试 |
| 进度同步失败 | 本地保留，后台重试；不打断阅读 |
| Worker 解析超时 | 标 failed，提示缩小文件或稍后重试 |

---

## 11. 安全

- 密码强哈希；会话 token 仅哈希入库  
- Cookie：HttpOnly、Secure、SameSite=Lax  
- 所有资源按 `user_id` 鉴权  
- 上传 MIME/扩展名白名单；R2 不直接公开写  
- 章节 HTML（epub）清洗，防 XSS；阅读区避免 `dangerouslySetInnerHTML` 未消毒内容  
- CORS 仅允许自己的 Pages 源  
- 基础速率限制（登录/注册）尽量在 Worker 内做简单节流  

---

## 12. 部署与环境

### 12.1 Cloudflare 资源

- Pages 项目：前端  
- Worker：API  
- D1 database：绑定 `DB`  
- R2 bucket：绑定 `BOOKS_BUCKET`  
- 密钥：`SESSION_SECRET` 等放 Secrets  

### 12.2 环境

- `development`：本地 `wrangler dev` + Vite proxy `/api`  
- `production`：自定义域或 `*.pages.dev`  

### 12.3 账号说明

实现阶段检查本机是否已 `wrangler login`。若未登录，引导用户完成 OAuth 登录后再创建 D1/R2/Pages。

---

## 13. 测试与验收

### 13.1 验收清单（MVP）

- [ ] 可注册、登录、登出  
- [ ] 导入 txt（UTF-8 与至少一种中文编码样例）、md、epub 各至少 1 本成功  
- [ ] 书架展示封面、书名、状态  
- [ ] 左右翻页、章节边界衔接、目录跳转  
- [ ] 调整字号后进度不「跳飞」（char_offset 锚定）  
- [ ] 进度刷新页面后恢复；另一浏览器登录同账号可见进度（云同步）  
- [ ] night / paper 主题切换  
- [ ] 手机宽度与桌面宽度布局正常  
- [ ] 删除书籍后列表与 R2 无残留关键路径  
- [ ] 部署到 Cloudflare 后上述主路径可用  

### 13.2 测试策略

- 解析函数：单元测试（txt 分章、md 标题、简易 epub fixture）  
- API：关键鉴权与隔离用例  
- 前端：分页算法纯函数测试（给定宽高字号与文本 → 页数稳定）  
- 手工：真机触控滑动与视觉走查  

---

## 14. 模块边界（便于实现与单测）

| 模块 | 职责 | 依赖 |
|------|------|------|
| `auth` | 注册登录会话 | D1 |
| `books` | 元数据与列表 | D1, R2 |
| `parsers/txt\|md\|epub` | 文件 → 章节数组 | 无业务 DB |
| `storage` | R2 键与读写封装 | R2 |
| `progress` | 读写进度 | D1 |
| `preferences` | 用户偏好 | D1 |
| `reader/pagination` | 文本 + 版式 → 页 | 纯前端 |
| `reader/viewport` | 翻页手势与动画 | pagination |
| `library/ui` | 书架与导入 | API client |
| `theme` | CSS 变量与主题 | preferences |

单元应能独立理解、独立测：例如换 epub 库不应影响分页算法。

---

## 15. 迭代路线（超出 MVP 的有序扩展）

1. PDF 导入（预留 format + 新 parser）  
2. 滚动阅读模式可选  
3. 书签 / 划线  
4. 全文搜索  
5. OAuth / 魔法链接  
6. 超大文件异步 Queue 解析  
7. 自定义字体上传  

---

## 16. 已决决议摘要

| 议题 | 决议 |
|------|------|
| 部署 | Cloudflare（Pages + Worker + D1 + R2） |
| 端型 | 响应式 Web |
| 账号 | 要；邮箱密码 + 云同步 |
| 格式 | txt / md / epub；PDF 预留 |
| 阅读 | 第一版左右翻页 |
| 审美 | 「雨夜书房」双主题，作者代定 |
| 架构 | SPA + Hono API，非 Next 全栈、非外置 BaaS |
| 进度锚点 | `chapter_index` + `char_offset` |
| 随笔目录 | 不纳入工程；可参考文风与 md 结构 |

---

## 17. 开放小项（实现时合理默认即可）

- 正式产品名：「雨读」暂定，可在落地页文案阶段最终确认  
- 单文件上限默认 30MB  
- monorepo 双包 vs 单包：以实现脚手架顺手为准，不改变本设计契约  

---

**请审阅本文档。** 若无修改意见，回复确认后将进入实现计划（writing-plans）；若有修改，直接说明要改的条款即可。
