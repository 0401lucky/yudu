# UI 整体视觉升级与动效优化

## Goal

在**不改变现有暖琥珀 + 纸质阅读基调**的前提下，全站视觉精致化：统一设计语言（语义色 / 圆角 / 动效规范），提取公共组件消除重复，补齐缺失的过渡动画与微交互，并保证动效与渲染性能。

## Background

- 底子不差：CSS 变量双主题（night/paper）+ Tailwind 3.4，焦点样式全站极一致；NoteEditorSheet / ReaderSettingsSheet 已有 300ms 滑入滑出示范，ReadingStatsBar 有网格展开动画。
- 现状主要问题（来自全站扫描）：
  1. **语义色缺失**：约 40 处红色/琥珀/玫瑰硬编码（`bg-red-950/20 text-red-400` 等）绕过主题体系，双主题下不协调、改色需多处维护。
  2. **高亮三色 hex 三处重复定义**（HighlightPopover / TocDrawer / NotesPage），`index.css` 的 `::highlight` 也硬编码 rgb。
  3. **重复代码块**：错误横幅 ×3（逐字相同）、底部 Sheet 外壳 ×2、左侧抽屉外壳 ×2、输入框样式串 ×10+、主/描边按钮样式串 ×N、SearchIcon ×3、ChevronIcon ×2、高亮色点映射 ×3。
  4. **圆角不统一**：BookCard `rounded-lg` vs 其它卡片 `rounded-xl`；Studio Character/Chapters 面板输入 `rounded`(4px) vs 全站 `rounded-lg`(8px)。
  5. **动效缺失**：TocDrawer / SearchDrawer / QuoteCardModal / ReaderChrome / TtsControlBar 显隐零过渡；无页面/路由过渡；多处按钮 hover 无 transition（`hover:opacity-90` 瞬变）。
  6. **页面标题色混用**（Library/Notes/Report 用 accent，Settings 用 text）；导航形态不统一（描边按钮 vs 文本链接）。
  7. **性能**：无路由级代码分割（10 个页面全在主包）；书架/笔记/目录列表全量渲染；封面图片无淡入。

## Requirements

按子任务拆分（三个子任务可独立计划、实施、验证）：

1. **设计系统层**（子任务 `07-31-ui-design-tokens`）：新增语义色变量（`--danger` / `--warning` / `--hl-*` / 遮罩），动效 tokens（时长 / 缓动），字体栈变量与圆角规范；night/paper 各自独立调色；同步 `::highlight` 引用变量。
2. **组件层**（子任务 `07-31-ui-components`）：提取公共组件（ErrorBanner / SheetShell / DrawerShell / SegmentedControl / 按钮体系 / Icon 集 / ColorDot）替换重复块；补齐抽屉、弹窗、工具栏、阅读器 chrome 的开合过渡与 hover 微交互。
3. **页面层**（子任务 `07-31-ui-pages`）：重点页面视觉打磨（Landing / Library / Notes / Report / Settings / Studio）；统一页面标题与导航形态；路由级代码分割；页面进入动画。

横切约束（所有子任务必须遵守）：

- 所有动效只用 `transform` / `opacity`，时长 ≤300ms，尊重 `prefers-reduced-motion`（现有全局兜底保留）。
- 不改变任何现有交互行为、数据流、路由结构与可访问性（焦点顺序 / aria）。
- 新增变量与组件必须双主题（night/paper）都验证；375px 移动端不破版。

## Acceptance Criteria

父任务级（跨子任务集成验收，在三个子任务都完成后统一执行）：

- [ ] 全站可 grep 验证：除画布渲染（quoteCardRender.ts）与 `::highlight` 引用外，无绕过主题体系的硬编码红/琥珀/玫瑰色。
- [ ] 高亮三色 / 错误色 / 警示色在双主题下均有独立调色，且全站仅一处定义。
- [ ] 每个新增公共组件至少被 2 处以上调用（否则不配成为组件）。
- [ ] 抽屉、弹窗、工具栏、阅读器 chrome 的显隐均有过渡动画；`prefers-reduced-motion` 开启时全部静默。
- [ ] 页面切换有统一进入动画；路由代码分割后主包体积明显下降（对比 build 产物 chunk 大小）。
- [ ] night/paper 双主题 × 桌面/375px 截图对比：无刺眼色块、无破版、层级清晰。
- [ ] 阅读器（翻页 / TTS / 高亮 / 滚动模式）行为与性能不变：无新增布局抖动，滚动阅读无新增重排。
- [ ] `pnpm --filter @yudu/web typecheck`、`pnpm -r test`、`pnpm build` 全部通过。

## Out of Scope

- 字体加载策略重构（Google Fonts 现状保留，仅统一字体栈引用为变量）。
- 引入组件库 / UI 框架。
- 列表虚拟化改造（个人图书馆量级暂不必要；最多用 `content-visibility` 轻量优化）。
- 新增主题（仅维护 night/paper）。
- 功能新增与既有交互行为变更。
- 移动端阅读器手势重做（滑动手势逻辑不动）。
