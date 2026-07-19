# 技术设计：Markdown 渲染 + 重新解析

## 1. 架构边界

```
导入 / 重解析
  └─ api/parsers/md.ts     分章 + 章节 body 保留 MD 子集源文（不再 toPlainText 整章剥离）
  └─ R2 chapters/*.json    { title, text, sequence?, sourceFile? }  text=md 源文（md 书）
  └─ D1 chapters.char_count 可用「纯文本长度」估算（strip 后 length），书架进度更稳

阅读
  └─ BookDetail.format === "md"
        → ReaderViewport contentMode="markdown"
        → 前端轻量 MD→React（无 dangerouslySetInnerHTML）
  └─ 其它 format
        → contentMode="plain"（现状）

重解析
  └─ POST /api/books/:id/reparse
  └─ 读 R2 source/ 前缀全部对象 → 按文件名序号合并 → 覆写章节
  └─ 失败不删旧章节；成功后夹取 reading_progress.chapter_index
```

| 层 | 改动 | 不改 |
|----|------|------|
| `@yudu/shared` | 通常可不改契约（`text` 仍为 string；语义对 md 变为「可渲染源文」） | 不强制新字段 |
| `@yudu/api` | `parseMd` 输出、`reparseBook` 服务、books 路由 | txt/epub 解析逻辑 |
| `@yudu/web` | 轻量渲染、`ReaderViewport`、书架重解析 UI + api client | 全局状态库 |

## 2. 数据与契约

### 2.1 章节存储

- R2 JSON 仍为 `ChapterPayload`：`{ title, text, sequence?, sourceFile? }`。
- **md 书**：`text` = 该章 Markdown **子集源文**（已去 front matter、已去掉用作分章的标题行；保留 `**` / `*` / 列表 / 章内 `#` 等）。
- **txt/epub**：`text` 仍为纯文本。
- `char_count`：写入 D1 时对 md 使用 `plainTextLength(text)`（与阅读器 strip 规则一致的近似），避免 `**` 拉高进度分母；plain 书仍用 `text.length`。

### 2.2 API 响应

- `ChapterContent` 不变：`{ index, title, text }`。
- 前端用 `BookDetail.format` 决定是否按 MD 渲染；**不**单独加 `contentType` 字段（减少 shared 变更）。未重解析的旧 md 书 `text` 已是纯文本，按 MD 渲染亦安全（无标记则原样段落）。

### 2.3 重新解析 API

```
POST /api/books/:bookId/reparse
Auth: 必填
成功: 200 BookSummary（与列表项一致）
失败:
  404 BOOK_NOT_FOUND
  400 NOT_MARKDOWN — format !== md
  400 SOURCE_MISSING — 无源文件
  409 BUSY — 已在 processing（可选）
  500 / 200+错误体 — 解析失败时：status 仍为 ready，error 返回消息（旧章节保留）
```

**事务策略（失败保留旧文）：**

1. 校验 format=md、属主、源存在。
2. 将 `status` 置 `processing`（便于书架轮询）；**先不删** chapters。
3. 列出 `r2Key.bookPrefix + "source/"` 下全部对象；若空则回退 `source_r2_key` 单对象。
4. 内存中完整 `parseMd` + 多文件合并（复用 `parseFilenameSeries` / 与导入一致的排序）。
5. 成功：删除并重写 `chapters` 行与 R2 chapter keys（同 `appendChaptersToBook` 重写段）；`status=ready`；`chapter_count` 更新；`error_message=null`。
6. 将 `reading_progress.chapter_index` 夹到 `[0, chapter_count-1]`；`page_in_chapter` 可保留由客户端夹取。
7. 任一步解析/写失败：`status` 恢复 `ready`（若原先 ready），**不**改 chapters；HTTP 4xx/5xx + `{ error: { code, message } }`。

多文件源：按文件名 sequence 排序后合并章节，与初次导入系列书行为对齐；无法解析序号时按 key 名字排序。

## 3. Markdown 解析（API）

修改 `apps/api/src/parsers/md.ts`：

- **保留** `splitMdChapters` 层级策略与 front matter 剥离。
- 章 body：**停止**对整章调用 `toPlainText`；改为：
  - 规范化换行；
  - 可选：压缩过量空行；
  - **不**剥离 inline 标记。
- 章 **title** 仍可用 `stripInlineMd`，目录更干净。
- 导出 `mdToPlainText`（或保留私有 `toPlainText`）供 `char_count` 与测试使用。

测试（`md.test.ts`）调整：

- 「剥离标记」用例改为「**保留** `**` / `*`」或拆成 plain helper 单测 + 章节 text 含标记。
- 仍断言分章数、front matter 不进正文。

## 4. 前端渲染（Web）

### 4.1 轻量解析器

新增例如 `apps/web/src/lib/mdInline.tsx` + `mdBlocks.ts`（命名以代码为准）：

- **不引入**完整 GFM 库（依赖面与 XSS 面更小，符合「不跑完整 MD 生态」）。
- 块级：空行分段；`#{1,6} ` 标题；`^[-*] ` / `^\d+\. ` 列表；其余段落。
- 行内：`**`、`*`、`` ` ``、`[text](url)`；输出 React 节点（`strong`/`em`/`code`/`a`）。
- 链接：仅 `href` 匹配 `^https?:` 时渲染 `<a target="_blank" rel="noopener noreferrer">`，并 `onClick={e => e.stopPropagation()}`；否则纯文字。
- **禁止**解析原始 HTML 标签为 DOM。

### 4.2 ReaderViewport

- Props 增加 `contentMode?: "plain" | "markdown"`（默认 `plain`）。
- `plain`：保持 `{text}` + `whitespace-pre-wrap`。
- `markdown`：在 track 内渲染块级结构；容器用正常段落流（`whitespace-normal`），列表/标题带与主题 token 一致的间距；**仍使用** CSS `column-width` 多栏分页。
- 字号/行高/字体继承自 track 样式；标题可略放大（如 1.15em），行内 code 用等宽 + 弱背景（CSS 变量）。
- `measure` 依赖仍含 text/字号等；markdown 结构变化后 `scrollWidth` 仍可测页数。

### 4.3 ReaderPage

- `contentMode={book.format === "md" ? "markdown" : "plain"}`。
- `charOffset` 近似：md 可用 `mdToPlainLength(chapter.text)` 若抽到 shared/web 工具，否则暂用 `text.length`（与现逻辑一致，可接受）。

### 4.4 书架 UI

- `BookCard`：当 `book.format === "md" && book.status === "ready"` 显示「重新解析」按钮（与删除并列，`stopPropagation`）。
- `LibraryPage`：`reparseBook(id)` → 乐观/置 processing → 复用现有 poll；成功 toast/状态文案；失败 `setError` 或卡片级提示。
- `lib/api.ts`：`reparseBook(bookId)` → `POST .../reparse`。

## 5. 安全

- 无 `dangerouslySetInnerHTML`。
- 链接协议白名单 `http:`/`https:`。
- 重解析仅属主 + md；R2 路径始终 `userId` 前缀。

## 6. 兼容与回滚

| 场景 | 行为 |
|------|------|
| 旧 md 未重解析 | text 为纯文本，markdown 模式当普通段落 |
| 新 md | 带标记源文 + 富文本 |
| 重解析失败 | 旧章节不动 |
| 回滚代码 | 旧前端把 md 源文当 plain 会显示 `**` 等标记；可再发前端或用户重解析前依赖版本一致 |

## 7. 关键权衡

| 方案 | 结论 |
|------|------|
| 存 HTML vs 存 MD 源文 | 选 **MD 源文 + React 渲染**，免消毒 HTML、与「子集」一致 |
| react-markdown 等库 | MVP **手写子集**，少依赖；若子集膨胀再换库 |
| shared 增加 contentFormat | 用 **book.format** 足够，少迁移 |
| 重解析只读 source_r2_key | 多 part 会丢章；改为 **list source/ 前缀** |

## 8. 验证命令

```bash
pnpm --filter @yudu/api test
pnpm --filter @yudu/api typecheck
pnpm --filter @yudu/web test
pnpm --filter @yudu/web typecheck
pnpm --filter @yudu/web build
pnpm --filter @yudu/shared test
```

（实现后跑 trellis-check。）
