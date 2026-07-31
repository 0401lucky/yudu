# 实施计划：通用组件打磨与微交互

> 前置：子任务 `07-31-ui-design-tokens` 完成（需要 `--danger`/`--hl-*`/`--overlay` 变量）。

## 步骤（按依赖排序）

### 1. 基础组件（无依赖，先行）

1. 新建 `apps/web/src/lib/icons.tsx`：把 SearchIcon（ReaderChrome/SearchDrawer/StudioModelPicker）、ChevronIcon（ReadingStatsBar/StudioModelPicker）及同文件重复的内联 SVG 收敛为导出组件；保持 18px stroke 风格。
2. 新建 `apps/web/src/components/ColorDot.tsx`：`{ color: "yellow"|"green"|"blue" }` → `background: var(--hl-*)`；替换 HighlightPopover / TocDrawer / NotesPage 三处色点映射。
3. 新建 `apps/web/src/components/ErrorBanner.tsx`：`role="alert"`，消费 `--danger`/`--danger-weak`；替换 LibraryPage / NotesPage / ReportPage 三处错误横幅。
4. 新建 `apps/web/src/components/buttons.tsx`（或 Button.tsx）：`PrimaryButton` / `OutlineButton`，统一 `rounded-lg`、`transition-colors duration-150`；替换 Landing/Login/Register/Notes/Report/Studio 主按钮与 Library 导航描边按钮。`hover:opacity-90` 全部消除。
5. 新建 `apps/web/src/components/SegmentedControl.tsx`：替换 ShelfToolbar 与 ReaderSettingsSheet 两处 segmented。

### 2. 弹层外壳

6. 新建 `apps/web/src/components/SheetShell.tsx`：从 NoteEditorSheet 提取外壳（遮罩 + `rounded-t-2xl` 面板 + 拖拽条 + 300ms 过渡），NoteEditorSheet / ReaderSettingsSheet 改用它；面板内容渲染方式不变。
7. 新建 `apps/web/src/components/DrawerShell.tsx`：参照 Sheet 常驻挂载模式实现左侧抽屉（250ms 滑入滑出 + 遮罩 fade）；替换 SearchDrawer / TocDrawer 外壳。**保持现有键盘行为**（打开聚焦、Esc 关闭、遮罩点击关闭）；内容在打开时才渲染（避免 Toc 列表常驻渲染）。
8. `QuoteCardModal`：补遮罩 fade + 面板 scale 入场（200ms），不改挂载方式（挂载动画即可）。

### 3. 阅读器 chrome（最后做，改动最小化）

9. `ReaderChrome`（顶/底栏）与 `TtsControlBar`：补挂载动画（fade + translateY，200ms）；离场直接 unmount（保持现状）。不改变任何可见性切换逻辑与翻页路径。
10. 验证阅读器回归：翻页、滚动模式、TTS 播读、高亮、目录/搜索开合。

### 4. 验证

```
pnpm --filter @yudu/web typecheck
pnpm -r test
pnpm build
```

- grep 验证：`hover:opacity-90` 为 0 处；每个新组件引用 ≥2 处。
- 双主题 + reduced-motion 截图/走查。
