# PDF 支持 MVP

## Goal

PDF 文件可上传入库、可在阅读器中原样分页阅读、页码进度云同步——满足"笔记多为 PDF"的真实需求。

## Background

- `BookFormat` 已含 `"pdf"`（`packages/shared/src/constants.ts`），但 `SUPPORTED_FORMATS` 白名单未放开，无解析器、无导入入口。
- 产品定位文档（`.trellis/spec/guides/product-positioning.md`）已给出扩展清单：shared → parsers → importBook → web，并明确 PDF 这类非文本流格式应扩展 `ReaderViewport` 的 `contentMode` 或等价机制，勿把二进制塞进纯文本渲染。
- 技术路线（父任务规划已定）：**前端 pdf.js 原样渲染**。后端不解析（Workers CPU 限制 + 提纯质量差），只存原始文件并提供流式读取。

## Requirements

1. **导入**：`ImportDropzone` 接受 `.pdf`；后端识别 pdf 格式，跳过章节解析，仅存原始文件到 R2，书记录 `format='pdf'`、`status='ready'`、`chapter_count=0`；PDF 不参与"书名-序号"系列合并（一文件一书）；30MB 上限沿用。
2. **源文件接口**：新增鉴权接口返回 R2 原始 PDF 流，供前端 pdf.js 加载。
3. **阅读**：`format==='pdf'` 的书进入独立 PDF 阅读视图（pdf.js canvas 逐页渲染）：
   - 页面适配视口宽度（fit-width），高分屏清晰（devicePixelRatio）。
   - 翻页交互与现有约定一致：点击左/右 30% 区域翻页、中间唤出工具栏、左右滑动手势、键盘方向键。
   - 工具栏显示"第 X / Y 页"，进度条可 seek 到任意页。
4. **进度云同步**：复用 `reading_progress`（`chapterIndex=0, charOffset=0, pageInChapter=PDF 页码`），debounce 上报与恢复模式与现有一致。
5. **书架**：PDF 书显示格式徽标；`progressPercent` 为 null 时显示占位（不显示百分比）。
6. **降级与容错**：损坏/加密 PDF 加载失败时给出明确错误提示与返回书架入口；`reparse` 对 pdf 返回不支持。
7. **性能**：pdfjs-dist 按需加载（动态 import + code splitting），不进入主 bundle；仅渲染当前页（可选预渲染相邻页）。

## Acceptance Criteria

- [ ] 拖入 10MB 级中文 PDF 导入成功，书架出现且带 PDF 徽标。
- [ ] 打开后正常渲染、文字清晰（高分屏无糊）、翻页流畅（点击/滑动/键盘三通道）。
- [ ] 翻到第 N 页后刷新，恢复到第 N 页；另一浏览器同账号打开恢复到第 N 页。
- [ ] 进度条 seek 跳页正确，页码显示"X / Y"。
- [ ] 主 bundle 体积无明显增长（pdfjs 在独立 chunk，构建产物可验证）。
- [ ] 损坏 PDF（如截断文件）打开显示错误态而非白屏。
- [ ] txt/md/epub 导入与阅读无回归；`SUPPORTED_FORMATS` 相关测试更新。
- [ ] 移动端（375px）与桌面渲染布局均正常。
- [ ] `pnpm typecheck && pnpm test && pnpm build` 通过；导入分支与 source 路由有测试。

## Out of Scope（MVP 明确不做）

- PDF 内文字搜索、文字选择/复制、书签、outline 目录导航。
- 夜间模式反色渲染（canvas 不吃 CSS 主题；后续可加 filter 方案）。
- 缩放手势（pinch zoom）、双页视图、Range 分段加载。
- 后端提取 PDF 页数/封面（书架页数显示"—"）。
