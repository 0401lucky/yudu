# 阅读体验优化设计（移动端为主）

日期：2026-07-11
分支：feat/yudu-reader

## 背景与问题

阅读页当前用 JS 估算分页（`apps/web/src/lib/pagination.ts`）：按"中文字宽≈字号、
ASCII≈0.55 字号"猜测每页容量，把估算出的该页文字塞进 `overflow:hidden` 容器。
估算与浏览器真实排版必然有误差，偏乐观时多出的文字被裁掉，表现为**移动端正文被遮挡 /
缺行**。历史提交（加 safety 余量、改流式布局）都是在打补丁，未根治。

## 目标

1. 根治遮挡/裁字（核心）。
2. 加翻页动画，让"翻页了"这件事可感知。
3. 阅读页内直接可调主题/字体等，不必进设置页。
4. 补充常用阅读功能。

## 方案总览

### A. 分页：改用 CSS 多栏（column），弃用 JS 估算

- 整章文字渲染进一个容器，`column-width` = 页宽、`column-gap` = 0、高度 = 可读区。
  浏览器把整章自动切成 N 栏，**每栏 = 一页**，永不裁字。
- 总页数 = `round(scrollWidth / 页宽)`；翻页 = 改容器 `transform: translateX(-page*页宽)`。
- 段落用 `white-space: pre-wrap` 或按 `\n\n` 拆 `<p>`；沿用现有字体/行距/边距变量。
- 弃用 `paginateText`/`metrics`/`safety`/`measureRef` 那套估算；`pagination.ts` 及其
  测试删除（连带 `pageSlice`/`pageIndexForOffset`）。

### B. 翻页动画 + 手势

- 章内翻页：`transition: transform .28s ease` 横向滑动；`prefers-reduced-motion` 降为瞬切。
- 手势：保留 pointer 滑动判定；点两侧翻页、点中间唤出/隐藏工具栏（沿用现有热区比例）。
- 章节边界：翻过本章末页 → 载入下一章（保留现有换章 setState，但换章后落到第 0 页），
  暂不做跨章无缝拼接轨道（YAGNI，先保证无裁字与动画）。

### C. 进度模型调整

- 进度从 `charOffset` 改为**页比例**：记录 `pageInChapter` 与总页数即可恢复。
  云同步 `putProgress` 仍发送 `chapterIndex` + `charOffset`（用页起点近似）+ `pageInChapter`，
  后端无需改。恢复时用 `pageInChapter` 定位页。
- 全书百分比 = 章内进度按章加权，用于底部进度条。

### D. 阅读设置面板（页内直达）

- 底栏加"Aa"按钮，唤出**从底部滑入的设置面板**，集中：字号、行距、页边距、主题、
  字体族、亮度。主题/字号/行距/页边距走已有云同步；**字体族、亮度存 localStorage**
  （避免改 D1 迁移）。
- 底栏保留快捷：上一/下一主题、A±；面板提供完整项。

### E. 附加功能

1. **进度条**：底栏上方细进度条，显示全书百分比，可拖动跳章/跳页。
2. **书签**：阅读页加书签按钮，书签存 localStorage（按 bookId 存章+页），
   目录抽屉加"书签"分区可跳转。
3. **亮度/字体**：见 D，本地存储。
4. **章节间翻页**：翻到章末继续翻 → 自动进下一章首页（已在 B 覆盖，去掉跳转生硬感）。

## 存储与后端

- 后端不改。字体族、亮度、书签均前端 localStorage：
  - `yudu.reader.fontFamily`（'serif' | 'sans'）
  - `yudu.reader.brightness`（0.4–1）
  - `yudu.reader.bookmarks.<bookId>`（`{chapterIndex,pageInChapter,label,ts}[]`）

## 不做（YAGNI）

- 仿真 3D 翻书。
- 跨章无缝轨道拼接。
- 字体/亮度/书签的云端同步（本地即可，后续需要再说）。

## 验证

- 移动宽度（≤480）多本书逐页翻，确认无裁字、无遮挡、动画流畅。
- 刷新后进度恢复到同一页。
- 面板改字号/行距/边距/字体/亮度即时生效。
- 书签存取跳转正确。
- `pnpm typecheck` 通过；删除 pagination 后无残留引用。
