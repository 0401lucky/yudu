# 重点页面视觉升级

> 父任务：`07-31-ui-polish`。依赖子任务 `07-31-ui-design-tokens`（变量）与 `07-31-ui-components`（公共组件）。设计规范见父任务 `design.md`。

## Goal

各重点页面视觉打磨：统一页面标题与导航形态、替换页面独有的硬编码色、补页面进入动画与路由代码分割、封面图片淡入。页面布局结构不做大改。

## Requirements

### 1. 页面级打磨

| 页面 | 改动 |
|---|---|
| LandingPage | 背景渐变两个硬编码 hex → 引用变量（`--accent`/`--bg` 的 color-mix）；CTA 按钮 transition；模拟卡细节微调（阴影/圆角对齐规范） |
| LibraryPage | 错误横幅已由子任务 02 替换；管理模式底部条补出现动画（translateY，200ms）；骨架屏动效保持 |
| Login/Register | 表单卡视觉对齐规范（阴影/圆角）；若两页按钮已组件化则验证一致性 |
| NotesPage | 高亮色点已由子任务 02 替换；页头标题色对齐其它页面；列表行 hover 背景反馈 |
| ReportPage | 指标卡加图标或细节层次（可选、不破布局）；标题色对齐 |
| SettingsPage | h1 标题色 `--text` → `--accent`（对齐 Library/Notes/Report）；退出按钮 hover 补文字变色 |
| StudioListPage / StudioWorkPage | 18+ 徽标 rose、未配置提示 amber 硬编码 → `--danger`/`--warning` 语义变量；面板输入圆角 `rounded` → `rounded-lg` 统一 |

### 2. 页面标题与导航统一

- 各页 h1 统一 `text-[var(--accent)]` 风格（SettingsPage 修复；其余已一致）。
- 导航形态：保持各页现状（描边按钮/文本链接是既有设计差异，不做强制统一），但同类元素样式一致。

### 3. 路由级代码分割

- App.tsx 中 10 个页面全部改 `React.lazy` + `<Suspense>`，fallback 用现有「加载中…」样式（`animate-pulse` 骨架或文本，与现状一致）。
- ReaderPage 现有 PDF `React.lazy` 保持不变；保证 `/read/:bookId` 进入体验不回退。

### 4. 页面进入动画与图片

- 路由切换时页面容器加统一进入动画（fade + translateY(6px)，150ms；仅入场）。
- BookCard 封面图片补 onLoad 淡入（opacity 150ms）。
- 书架网格/目录列表加 `content-visibility: auto`（仅视觉优化，不改布局）。

## Acceptance Criteria

- [ ] Landing 渐变、Studio 徽标/提示不再有硬编码 hex 或 rose/amber 色（grep 验证）。
- [ ] 各页 h1 标题色一致（`--accent`）。
- [ ] 主包路由分割生效：`pnpm build` 产物按页面拆分 chunk，首包体积下降（对比前后 chunk 大小记录在任务 notes）。
- [ ] 页面切换有统一进入动画；reduced-motion 下无动画。
- [ ] 封面图片淡入生效且不影响既有懒加载。
- [ ] `/read/:bookId` 直接进入（刷新）体验正常（Suspense fallback 不闪白）。
- [ ] `pnpm --filter @yudu/web typecheck`、`pnpm -r test`、`pnpm build` 通过。
- [ ] 375px 移动端关键页面（Landing/Library/Report）不破版；night/paper 双主题截图正常。

## Out of Scope

- 页面布局重构（如书架网格改栏数、报告页重排）。
- 阅读器内部页面（ReaderPage 布局保持现状，仅 chrome 动画属子任务 02）。
- 新页面/新功能。
