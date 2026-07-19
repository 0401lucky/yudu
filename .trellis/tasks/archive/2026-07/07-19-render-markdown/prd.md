# 添加 Markdown 渲染

## Goal

为雨读（小说阅读器）增加 **Markdown 可读渲染**：导入 `.md` 后，在阅读器中展示基础排版（粗体、斜体、列表等）；已导入的旧 MD 书可通过书架上的 **「重新解析」** 从 R2 源文件升级到新管线。

## Background

1. `.md` 已在 `SUPPORTED_FORMATS` 中；`apps/api/src/parsers/md.ts` 负责分章。
2. 当前 `toPlainText` / `stripInlineMd` 会剥掉强调与链接等标记，章节只存纯文本。
3. `ChapterContent.text` 为字符串；`ReaderViewport` 以纯文本 + CSS 多栏分页展示。
4. 原设计文档（§7.2）曾写「保留段落与基础强调」；实现未做到。
5. 进度用 `chapterIndex` / `pageInChapter` / 由 `text.length` 近似的 `charOffset`。
6. 导入时源文件写入 R2（`source_r2_key` 及同目录多 part）；书架对 `ready` 书尚无重解析入口。
7. 安全：阅读区不得对未消毒 HTML 使用 `dangerouslySetInnerHTML`。

## Decisions

| ID | 决策 |
|----|------|
| D1 | 渲染保真度 = **MVP 子集**（见 Requirements） |
| D2 | 旧书 = **产品化「重新解析」**（非静默全量） |
| D3 | 重解析后进度 = **保留 chapterIndex（越界夹到末章）+ pageInChapter 测量后夹取**；`charOffset` 按新章重算近似 |
| D4 | **仅 `format=md`** 富文本渲染；**仅 md 且有源文件** 显示重解析；入口在 **书架卡片** |
| D5 | 链接 = **可点，`http(s)` 新标签外开**（`noopener noreferrer`）；非法协议仅作文字 |

## Requirements

### 渲染（仅 Markdown 书）

- R1. 支持：段落/换行、**粗体**、*斜体*、章内标题（如 `###`，不参与分章）、无序/有序列表、行内代码、链接文字。
- R2. 分章规则保持现有 `parseMd`（优先 ≥2 个 `##`，否则 `#`）；分章标题不进入正文。
- R3. 去掉 YAML front matter；不渲染远程图片、表格、任务列表、脚注、数学、语法高亮、原始 HTML。
- R4. 新导入的 md：章节正文保留可渲染的 Markdown 子集源文（不再整章剥成纯文本）。
- R5. 阅读器对 `format=md` 按 R1 渲染；分页（CSS 多栏）、字号/行高/字体/边距仍生效。
- R6. 链接：`http`/`https` 可点并新开；点击不触发翻页；其它协议不可点。

### 重新解析

- R7. 书架卡片为 `format=md` 且 `status` 为 `ready`（或可恢复的失败态，若仍有源）提供「重新解析」；无源时隐藏或禁用并可知原因（优先隐藏 / API 明确错误）。
- R8. 从 R2 源目录重跑 md 解析并覆写章节；**失败则保留旧章节**，向用户展示错误，书仍可读。
- R9. 成功后进度按 D3；过程有进行中反馈（可复用书架 `processing` 轮询）。
- R10. txt / epub 不出现该入口，导入与纯文本阅读不回归。

## Acceptance Criteria

- [ ] AC1. 样例 MD（含粗体、斜体、行内代码、列表、章内标题、http 链接）**新导入**后，阅读页可见对应样式，标记不整段裸露。
- [ ] AC2. 旧纯文本章节的 md 书，经书架「重新解析」成功后满足 AC1。
- [ ] AC3. 重解析失败：有错误提示，旧章节仍可打开。
- [ ] AC4. 重解析成功：章节索引按 D3 夹取；页码不越界崩溃。
- [ ] AC5. MD 书多栏分页与阅读设置（字号/行高/字体/边距）可用。
- [ ] AC6. 无标记段落可读，不低于当前纯文本体验。
- [ ] AC7. txt/epub 导入与阅读无回归；无 Markdown「重新解析」按钮。
- [ ] AC8. 仅 `format=md` 走富文本渲染路径。
- [ ] AC9. 点击 http(s) 链接新标签打开且不误触发翻页；`javascript:` 等不可点。
- [ ] AC10. 相关单测（md 解析保留标记 / 重解析服务或路由）与 web/api typecheck、构建、测试通过。

## Out of Scope

- 完整 GFM、远程图、PDF、在线 MD 编辑器
- 静默全库自动重解析
- 按章节标题智能对齐进度
- txt/epub 富文本或重解析

## Open Questions

（无 — 产品决策已收敛）
