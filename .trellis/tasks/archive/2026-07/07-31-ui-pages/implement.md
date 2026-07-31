# 实施计划：重点页面视觉升级

> 前置：子任务 `01`（变量）与 `02`（组件）完成。

## 步骤

### 1. 页面进入动画与代码分割（先行，影响所有页面）

1. `index.css` 新增页面进入动画 `@keyframes yudu-page-in`（fade + translateY(6px)，150ms）+ `.yudu-page-in` class（复用现有 reduced-motion 兜底）。
2. 公共页面容器（Library/Notes/Report/Settings/Studio 各页 main 或 App 的 Outlet 包装）挂 `.yudu-page-in`；用路由 `location.key` 或组件挂载触发重放（简单方案：每个页面 main 直接加 class，挂载即播放一次）。
3. `App.tsx`：10 个页面改 `React.lazy(() => import(...))` + `<Suspense fallback={…}>`；fallback 复用现有「加载中…」样式。验证 `/read/:bookId` 直接刷新可用。

### 2. 页面独有打磨

4. `LandingPage.tsx`：背景渐变 hex → `color-mix(in srgb, var(--accent) 13%, transparent)` 与 `color-mix(in srgb, var(--text) 20%, transparent)` 等引用变量；CTA 按钮换公共 PrimaryButton（若子任务 02 已做则跳过）。
5. `SettingsPage.tsx`：h1 `text-[var(--text)]` → `text-[var(--accent)]`；退出按钮 hover 补文字变色（与 Library 导航按钮同款 hover 语义）。
6. `NotesPage.tsx`：列表行 hover 补背景反馈（`hover:bg-[var(--bg)]` + transition-colors）。
7. `StudioListPage.tsx` / `StudioWorkPage.tsx`：rose/amber 硬编码 → `--danger`/`--warning` 语义变量；Studio Character/Chapters/Outline 面板输入 `rounded` → `rounded-lg`。
8. `ReportPage.tsx`：指标卡保持布局，如需可补小图标（用 `lib/icons.tsx` 已有图标，不新增依赖）。
9. `LibraryPage.tsx`：管理模式底部条补出现动画（translateY + fade，200ms，挂载动画即可）。

### 3. 图片与列表

10. `BookCard.tsx`：封面 `onLoad` 淡入（opacity 150ms，状态位 + transition）；保持 `loading="lazy"`。
11. 书架网格与 TocDrawer 列表容器加 `[content-visibility:auto]`（Tailwind 任意值，浏览器自动降级）。

### 4. 验证

```
pnpm --filter @yudu/web typecheck
pnpm -r test
pnpm build
```

- 对比 build 产物 chunk 数量与首包大小（记录到任务 notes）。
- 双主题 × 桌面/375px 截图；reduced-motion 走查；`/read/:bookId` 刷新回归。
