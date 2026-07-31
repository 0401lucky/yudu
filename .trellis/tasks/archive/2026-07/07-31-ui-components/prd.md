# 通用组件视觉打磨与微交互

> 父任务：`07-31-ui-polish`。依赖子任务 `07-31-ui-design-tokens` 的变量（`--danger` 等）；设计规范见父任务 `design.md`。

## Goal

提取公共组件替换全站重复代码块；补齐抽屉、弹窗、工具栏、阅读器 chrome 的开合过渡动画；统一按钮/输入的 hover 微交互。所有改动不改变交互行为与可访问性。

## Requirements

### 1. 公共组件提取（每个必须 ≥2 处复用）

| 组件 | 替换点 | 要求 |
|---|---|---|
| `ErrorBanner` | LibraryPage:482 / NotesPage:161 / ReportPage:140（3 处逐字重复） | role="alert"，消费 `--danger` tokens |
| `SheetShell` | NoteEditorSheet / ReaderSettingsSheet 外壳 | 遮罩 + `rounded-t-2xl` 面板 + 拖拽条 + 300ms 滑入滑出（行为与现状一致） |
| `DrawerShell` | SearchDrawer / TocDrawer 外壳 | 左侧全高面板 + 遮罩 + **250ms 滑入滑出**（本次新增动效）；保留键盘行为 |
| `SegmentedControl` | ShelfToolbar / ReaderSettingsSheet | options + value/onChange |
| `PrimaryButton` / `OutlineButton` | 各页主/描边按钮样式串 | 统一圆角/字号；hover 带 `transition-colors duration-150`（消除 `hover:opacity-90` 瞬变） |
| `Icon` 集 | SearchIcon ×3、ChevronIcon ×2 及其它重复内联 SVG | 收敛到 `lib/icons.tsx`，18px stroke 风格不变 |
| `ColorDot` | HighlightPopover / TocDrawer / NotesPage 色点映射 | 消费 `--hl-*` 变量（替代 3 处 hex） |

### 2. 开合过渡动画

- `TocDrawer` / `SearchDrawer`：面板滑入 + 遮罩淡入（250ms）；关闭反向。实现方式参照 NoteEditorSheet 常驻挂载模式，或挂载动画（保持离场行为）——以不破坏阅读器稳定为优先。
- `QuoteCardModal`：遮罩 fade + 面板 scale(0.96)→1（200ms）。
- `ReaderChrome` 顶/底栏、`TtsControlBar`：出现/消失 fade + 轻微位移（200ms）。ReaderChrome 是阅读器核心路径，优先用挂载动画（进入动画 + 直接 unmount），避免常驻挂载影响翻页性能。
- 全部动画只用 transform/opacity；`prefers-reduced-motion` 下静默（现有全局兜底）。

### 3. hover 微交互

- 主/描边按钮统一 `transition-colors duration-150`；`hover:opacity-90` 全部替换为语义化 hover（边框/背景/文字变色）。
- 列表行（ShelfToolbar 分组 tab、NotesPage 高亮行等）补齐背景反馈过渡。

## Acceptance Criteria

- [ ] 7 个公共组件落地，每个至少被 2 处调用（grep 验证）。
- [ ] 错误横幅三处均使用 `ErrorBanner`，不再有逐字重复的红色横幅代码。
- [ ] TocDrawer / SearchDrawer / QuoteCardModal / ReaderChrome / TtsControlBar 显隐均有过渡动画；reduced-motion 下无动画。
- [ ] 全站无 `hover:opacity-90` 瞬变（grep 验证）。
- [ ] Drawer/Sheet 键盘行为回归：打开时焦点可入、Esc 关闭、Tab 不逃逸。
- [ ] 阅读器（翻页/滚动/TTS/高亮）行为不变，无新增卡顿或布局抖动。
- [ ] `pnpm --filter @yudu/web typecheck`、`pnpm -r test`、`pnpm build` 通过。
- [ ] 双主题下新组件视觉正常（截图抽查）。

## Out of Scope

- 页面级布局/内容调整（子任务 03）。
- 路由代码分割与页面进入动画（子任务 03）。
- 硬编码色替换中属于页面独有元素的部分（子任务 03）。
