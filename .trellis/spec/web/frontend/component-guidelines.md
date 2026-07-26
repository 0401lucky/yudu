# 组件约定 — @yudu/web

> 产品：**通用阅读器**。文案避免「仅小说」；「书 / 书架」表示作品库即可。  
> 见 [产品定位](../../guides/product-positioning.md)。

## 总体风格

- 函数组件 + TypeScript props 接口
- 视觉：深色「夜」/ 浅色「纸」双主题，强调色琥珀（`--accent`）
- 颜色优先用 CSS 变量：`text-[var(--text)]`、`border-[var(--border)]`，避免写死仅 night 可用的色值（状态色如红可例外）
- 中文 UI 文案；加载态用「加载中…」等简短提示

参考：`BookCard.tsx`、`ReaderChrome.tsx`、`index.css`。

## 主题 Token

定义于 `src/index.css`，由 `ThemeProvider` 设置 `document.documentElement` 的 `data-theme`：

| 变量 | 用途 |
|------|------|
| `--bg` / `--bg-elevated` | 页面与卡片底 |
| `--text` / `--text-muted` | 主/次文字 |
| `--accent` | 强调、焦点环 |
| `--border` | 边框 |
| `--page-bg` | 阅读版心背景 |

主题 id 仅 `night` | `paper`（`ThemeId` in shared）。

## 组件职责示例

| 组件 | 职责 |
|------|------|
| `BookCard` | 展示 `BookSummary`；点击进阅读；删除需 confirm |
| `ImportDropzone` | 拖拽/选择文件，回调 `File[]`，不直接调 API |
| `ReaderViewport` | 版心测量与左右分页展示章节文本（翻页模式） |
| `ScrollReaderViewport` | 垂直滚动 + 三章无缝拼接（连续阅读模式） |
| `ReaderChrome` | 顶栏/底栏显示与隐藏 |
| `TocDrawer` | 目录 + 书签列表 |
| `ReaderSettingsSheet` | 字号/行距/边距/主题等设置 UI |
| `ThemeProvider` | 云端偏好加载与 `setPrefs` |

页面编排状态：`LibraryPage`、`ReaderPage` 持有数据拉取与组合逻辑。

## Props 与可访问性

- 交互卡片提供 `role="button"`、键盘 Enter/Space（见 `BookCard`）
- 图标按钮写 `aria-label`（删除、书签等）
- 焦点：`focus-visible:ring` 或全局 `:focus-visible` 使用 `--accent`
- 尊重 `prefers-reduced-motion`（`index.css` 已全局削弱动画）

## 阅读器相关

- 分页在客户端：`ReaderViewport` 测量 + `ReaderPage` 的 `pendingPageRef` 处理跨章落页
- 两种阅读模式并存：`ReaderPage` 按 `localPrefs.readingMode` 分支渲染 `ReaderViewport`（翻页）/ `ScrollReaderViewport`（滚动），位置互通走 charOffset 锚点（见状态管理指南）
- **排版常量共享**：字距/版心/字体栈常量在 `components/readerTypography.ts`（`VERTICAL_PAD`/`HORIZONTAL_PAD`/`MEASURE_EM`/`FONT_STACK`），新视口必须从这里导入，禁止各自内联一份导致两模式观感漂移
- 滚动容器需设 `overflow-anchor: none`，滚动补偿由组件自研锚点逻辑掌控（iOS 不支持该属性,靠补偿兜底）
- 安全区：`.safe-top` / `.safe-bottom` + `env(safe-area-inset-*)`
- 阅读页避免横向溢出：`.reader-chrome { max-width: 100vw }`

## 反模式

- 在展示组件内直接 `fetch`（应经 props/回调或 hooks）
- 用 Tailwind 任意 hex 复制一套主题色而不走 CSS 变量
- 为简单卡片引入 class 组件或外部 UI 库（项目未用 shadcn/MUI）
