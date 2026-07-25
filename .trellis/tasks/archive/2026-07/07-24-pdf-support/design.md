# PDF 支持 MVP — 技术设计

## 总体路线

后端"存储 + 透传"，前端 pdf.js 渲染。PDF 是**非章节化格式**：不入 `chapters` 表，正文即 R2 源文件本身。

```
ImportDropzone(.pdf) → POST /api/books/import → detectFormat='pdf'
  → 跳过 parseByFormat，仅 r2Key.source 存原件 + books 记录(status=ready, chapter_count=0)
阅读：ReaderPage 按 format 分流 → PdfReaderView
  → fetch /api/books/:id/source (credentials) → ArrayBuffer → pdfjs.getDocument
  → canvas 渲染当前页；翻页/进度同步复用现有约定
```

## 后端改动（apps/api）

### importBook.ts

- `detectFormat`：`.pdf` 扩展名 → `"pdf"`（保持现有按扩展名策略）。
- 分组：pdf 文件**不参与** `seriesGroupKey` 合并——每个 pdf 独立成组（在分组循环处按 format 短路）。
- pdf 分支：跳过 `parseGroupChapters`，直接：存源文件（复用 `r2Key.source(userId, bookId, name)` 与 `source_r2_key` 记录）→ 写 books（`format='pdf'`, `status='ready'`, `chapter_count=0`）→ 不写 chapters。
- 追加语义：同名 PDF 再导入 = 新建一本（不追加章节）；`findReadyBookByTitle` 匹配逻辑对 pdf 跳过。
- `reparseBook`：format 为 pdf 时抛 `ReparseError`（400 `UNSUPPORTED_FORMAT`）。
- `deleteBook`：确认现有实现按 R2 前缀删除已覆盖源文件（研究时确认 `listSourceObjects` 存在，删除路径复用）。

### 新路由 `GET /api/books/:id/source`（books.ts 内新增）

- authMiddleware + 归属校验（照抄 cover 路由 `books.ts:310-346` 的结构）。
- 读 `books.source_r2_key` → `getObject` → 流式 `c.body(obj.body)`；`Content-Type: application/pdf`；`Cache-Control: private, max-age=3600`。
- 仅对 `format='pdf'` 开放（其他格式 404 `NO_SOURCE`，避免变成任意源文件下载口——txt/md/epub 的源文件不在本接口范围）。

### shared

- `SUPPORTED_FORMATS` 加 `"pdf"`：注意 `BookFormat = (typeof SUPPORTED_FORMATS)[number] | "pdf"` 会产生冗余联合，顺手改为 `(typeof SUPPORTED_FORMATS)[number]`（类型收敛，无行为变化）。
- `constants.ts` 注释同步（pdf 不再是"规划中"）。

## 前端改动（apps/web）

### 依赖与加载

- `pdfjs-dist`（^4.x）。worker 配置：`import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"` + `GlobalWorkerOptions.workerSrc = workerUrl`（Vite 静态资源方案，避免 CDN 依赖）。
- `PdfReaderView` 经 `React.lazy(() => import(...))` 挂载，pdfjs 只进该 chunk；`Suspense` fallback 用现有"加载中…"样式。

### ReaderPage 分流

- `book.format === 'pdf'` 时渲染 `<PdfReaderView bookId book />`，不进入章节加载 effect（现有 `getChapter` effect 对 pdf 书跳过——`chapters` 为空数组本就无章可取，需短路防错）。
- Header/Footer（ReaderChrome）复用：标题、页码 label（"第 X / Y 页"）、进度条 seek、主题切换照旧；目录/书签按钮对 pdf 隐藏；设置面板对 pdf 隐藏字体项（canvas 不吃字体设置）或整体隐藏——MVP 选择：目录、书签、设置入口对 pdf 均隐藏，仅保留主题切换与进度条。

### PdfReaderView（新组件）

- 加载：`fetch('/api/books/:id/source', {credentials:'include'})` → `arrayBuffer` → `getDocument({data}).promise`（fetch 走同源 cookie，绕开 pdf.js url 模式的 withCredentials 配置面）。
- 状态：`loading / error / {pdf, numPages, pageIndex}`。
- 渲染：单 `<canvas>`，`page.getViewport({scale: containerWidth / baseViewport.width * devicePixelRatio})`，canvas CSS 尺寸 = 容器宽，像素尺寸 × dpr；页码变化即渲染（取消进行中的 renderTask 防竞态）。
- 翻页交互：与 `ReaderViewport.tsx:141-197` 同约定（pointer 事件轴锁定 + SWIPE_THRESHOLD=48 + 点击三分区）。简单优先：MVP 在组件内实现同约定（约 60 行），不抽象共享 hook；若实施时发现可低成本抽 `usePageGestures` 再抽。
- 进度：`pageIndex` 变化 → `useProgressSync.schedule(0, 0, pageIndex)`；挂载时 `getProgress` 恢复 `pageInChapter`（clamp 到 numPages-1）。
- resize：容器 ResizeObserver → 重渲染当前页。

### ImportDropzone / 书架

- `ACCEPT` 加 `.pdf` / `application/pdf`，提示文案加 PDF。
- `BookCard`：已显示 format 徽标则自动生效（确认现状，若无则加小徽标）；`progressPercent === null` 显示"—"路径确认无 NaN。

## 安全

- pdf.js 默认不执行 PDF 内嵌 JS（`isEvalSupported` 默认关闭路径确认）；渲染仅 canvas 绘制，无 `dangerouslySetInnerHTML`。
- source 接口严格归属校验 + 仅 pdf 格式开放。

## 风险

| 风险 | 缓解 |
|------|------|
| pdfjs-dist 体积（~1MB+） | React.lazy 独立 chunk；验收项含 bundle 检查 |
| 30MB PDF 全量进内存（ArrayBuffer） | 上限内可接受；Range 分段是后续优化 |
| 加密/损坏 PDF | getDocument 异常 → 错误态 UI |
| Workers Assets 与 `run_worker_first` 下 `?url` worker 资源路径 | Vite 产物在 assets 目录，走静态资源回退路径，构建后手验 |
