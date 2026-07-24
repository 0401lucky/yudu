# 雨读体验优化与功能增强（父任务）

## Goal

优化雨读的核心阅读体验并加入有粘性的创新功能。用户实际场景：小说 + md 笔记为主，PDF 有真实需求。本任务为父任务，持有需求集与任务地图，最终做跨子任务集成验收；实施在各子任务中进行。

## 范围（用户 2026-07-24 确认）

| # | 子任务 | 内容 | 规模 |
|---|--------|------|------|
| 1 | 书签云同步 | 书签从 localStorage 迁到 D1 按用户同步，换设备不丢 | 小-中 |
| 2 | 书内全文搜索 | 一本书内搜关键词，结果带摘录，点击跳转 | 中 |
| 3 | 阅读统计热力图 | 每日阅读时长记录，GitHub 风格热力图 + 连续天数 | 中 |
| 4 | PDF 支持 MVP | 上传 PDF + pdf.js 前端原样分页渲染 + 进度云同步 | 大 |

推荐执行顺序：1 → 2 → 3 → 4（从小到大，先建立云同步 CRUD 模式，PDF 最后独立攻坚）。

## 明确不做（本次）

- 雨夜沉浸模式（雨声白噪音、专注模式）——用户未选
- AI 前情回顾（Workers AI）——用户未选
- PDF 内文字搜索、PDF 书签（MVP 不覆盖）
- 跨书全库搜索（仅书内）

## 关键技术事实（研究结论，子任务共享）

- 技术栈：Workers + Hono + D1 + R2；前端 Vite + React 18 + Tailwind，无全局 store（`fetch` + Cookie）。
- 章节正文存 R2（每章一个 JSON `{title,text}`，`chapters.r2_key`），D1 只存元数据（`apps/api/migrations/0001_init.sql`）。
- 现书签仅 localStorage（`apps/web/src/hooks/useBookmarks.ts`），锚点 `pageInChapter` 依赖设备视口/字号，跨设备不稳定；云同步需改用 `charOffset` 锚点（进度同步已用同款近似：`ReaderPage.tsx:141-150`）。
- 云同步既有模式参照：`reading_progress` 表 + `apps/api/src/routes/progress.ts`（UPSERT + 所有权校验）+ `useProgressSync.ts`（debounce + visibilitychange flush）。
- 导入流程：`importBooksBatch`（`apps/api/src/services/importBook.ts`）→ `detectFormat`（按扩展名）→ `parseByFormat` → 源文件存 R2 `r2Key.source(userId, bookId, name)`，`books.source_r2_key` 记录。
- `ReaderViewport` 的 `contentMode` 现为 `"plain" | "markdown"`（CSS 多栏分页）；PDF 不走多栏，按产品定位文档扩展独立渲染路径。
- `BookFormat` 已含 `"pdf"`（`packages/shared/src/constants.ts`），`SUPPORTED_FORMATS` 白名单未放开。
- 上传上限 `MAX_UPLOAD_BYTES = 30MB`。

## 跨子任务验收标准（父任务集成验收）

- [ ] 四个子任务各自验收通过并归档。
- [ ] `pnpm typecheck` / `pnpm test` / `pnpm build` 全仓通过。
- [ ] 手机宽度与桌面布局均正常（既有验收惯例）。
- [ ] 现有功能无回归：txt/md/epub 导入、翻页、目录、进度恢复、主题切换。
- [ ] 更新 `.trellis/spec/` 与 `README.md` 的能力表（PDF 从"规划中"移入"当前能力"等）。

## 子任务目录

见本目录 `subtasks/`（由 task.py 管理）。
