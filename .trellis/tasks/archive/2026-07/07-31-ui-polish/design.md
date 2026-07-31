# 设计：UI 视觉升级

## 设计原则

1. **精致化而非重构**：保留暖琥珀 accent、night/paper 双主题、现有 `text-[var(--text)]` 任意值写法。不引入 Tailwind token 重映射（改动面大、无实际收益）。
2. **变量驱动**：一切语义色收敛到 CSS 变量；组件只消费变量，不写字面色值。
3. **动效克制**：所有动画 150–300ms，只用 `transform`/`opacity`；全局 `prefers-reduced-motion` 兜底已存在（`index.css:331-339`），不新增逻辑。
4. **增量替换**：公共组件提取只针对出现 ≥2 处的重复块；不追求覆盖所有按钮/输入框（超过外科手术范围的保持现状）。

## Token 设计

全部新增在 `apps/web/src/index.css`，night 与 paper 各自独立调色。

| Token | 用途 | night 值（草案） | paper 值（草案） |
|---|---|---|---|
| `--danger` | 错误文字/边框 | `#f87171` 系（红 400） | 深砖红 `#a4453c` 系（纸面需降饱和降亮度） |
| `--danger-weak` | 错误底色 | `color-mix(in srgb, var(--danger) 12%, transparent)` | 同式 |
| `--warning` | 警示文字（amber 系） | `#fbbf24` 系 | 深琥珀 `#9a6700` 系 |
| `--warning-weak` | 警示底色 | 12% mix | 同式 |
| `--hl-yellow/green/blue` | 高亮三色（替代 3 处 hex 与 `::highlight`） | 现有 0.45 alpha 系 → 夜间 0.30–0.32 | 现有一组（可复用 daytime 值） |
| `--hl-tts` | TTS 朗读底色 | `#c4a574` 系（现状） | 同式 |
| `--overlay` | 遮罩统一（Drawer/Sheet/Modal/toast） | `rgba(0,0,0,0.5)` | `rgba(60,50,35,0.4)`（纸面暖调遮罩） |
| `--font-serif / --font-sans / --font-mono` | 字体栈收敛（index.css 与 readerTypography.ts 共用） | 同左 | 同左 |

动效 tokens（放 `:root`，双主题共用）：

- `--motion-fast: 150ms`、`--motion-base: 200ms`、`--motion-slow: 300ms`
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`（即现有 `.yudu-pop-in` 曲线）

圆角规范（不改 class 名，仅统一散点）：卡片统一 `rounded-xl`；控件统一 `rounded-lg`；胶囊 `rounded-full`。BookCard 与 Studio 面板输入属于要修的例外。

## 动效规范

| 场景 | 动画 | 时长/缓动 |
|---|---|---|
| 左侧抽屉开合（Toc/Search） | 面板 `translateX(-100%)→0` + 遮罩 fade；关闭反向 | 250ms / `--ease-out`；遮罩 200ms |
| 弹窗（QuoteCardModal） | 遮罩 fade + 面板 `scale(0.96)→1` + fade | 200ms / `--ease-out` |
| Chrome/TTS 工具栏显隐 | fade + `translateY(±4px)` | 200ms / `--ease-out` |
| 页面进入（路由切换） | fade + `translateY(6px)` | 150ms / `--ease-out`（仅入场，离场不做） |
| hover 微交互 | 颜色/边框/阴影 transition | 150ms |
| Sheet（已有） | 保持现状（300ms 滑入滑出） | 不变 |

实现注意：

- **抽屉开合动画**：参照 NoteEditorSheet 常驻挂载 + transition 模式（`if (!open) return null` → 改为常驻挂载 + `aria-hidden`/`pointer-events-none` + 过渡后 unmount 或直接常驻）。**必须**保留现有键盘/焦点行为：Drawer 打开时焦点入抽屉、Esc 关闭。
- **Chrome/TTS**：ReaderChrome 与 TtsControlBar 条件渲染，最稳妥做法是挂载动画（进入时 animate，离场直接 unmount）——避免常驻挂载影响阅读器核心路径（ReaderPage 是全站最重页面，改动最小化）。
- 抽屉/弹窗若选择常驻挂载，内容渲染要懒（打开时才渲染内容），避免 Toc 章节列表常驻渲染。

## 组件提取清单

| 组件 | 替换点 | 接口（草案） |
|---|---|---|
| `ErrorBanner` | LibraryPage:482 / NotesPage:161 / ReportPage:140（3 处逐字重复） | `<ErrorBanner message={} />`，role="alert"，消费 `--danger` tokens |
| `SheetShell` | NoteEditorSheet / ReaderSettingsSheet 外壳 | 遮罩 + `rounded-t-2xl` 面板 + 拖拽条 + 300ms 滑入滑出，children 为面板内容 |
| `DrawerShell` | SearchDrawer / TocDrawer 外壳 | 左侧全高面板 + 遮罩 + 250ms 滑入滑出；**新增开合动画是本任务重点** |
| `SegmentedControl` | ShelfToolbar / ReaderSettingsSheet | `options: {value,label}[]` + `value/onChange` |
| `PrimaryButton` / `OutlineButton` | Landing/Login/Register/Notes/Report/Studio 主按钮；Library 导航 ×3 等描边按钮 | 统一圆角/字号/hover transition（`transition-colors duration-150`） |
| `Icon` 集 | SearchIcon ×3、ChevronIcon ×2 及各处内联 SVG | 从 `lib/icons.tsx` 导出，18px stroke 风格不变 |
| `ColorDot` | HighlightPopover / TocDrawer / NotesPage 色点映射 | `color: "yellow"\|"green"\|"blue"` → 消费 `--hl-*` 变量 |

## 性能设计

- **路由级代码分割**：App.tsx 中 10 个页面改 `React.lazy` + `<Suspense>`（fallback 复用现有「加载中…」样式）。ReaderPage 现有 PDF `React.lazy` 保持不变。
- **动效性能**：仅 transform/opacity；禁止布局属性动画；抽屉/弹窗动画不触发内容重排（面板独立层）。
- **封面图片**：`loading="lazy"` 已有，补 onLoad 淡入（opacity 150ms，`reduced-motion` 下无动画）。
- **长列表**：书架网格与目录列表加 `content-visibility: auto`（CSS 一行，仅视觉跳过离屏渲染，不改变布局）。
- **不动**：ScrollReaderViewport 的 memo 防线、ReaderViewport 翻页实现、TTS 轮询 —— 均属稳定代码。

## 兼容性与验证

- 双主题逐页验证：night/paper × 桌面 1440px / 移动 375px，Playwright 截图对比。
- `prefers-reduced-motion` 开启时全站无动画（现有全局兜底已覆盖新增动画）。
- 常驻挂载改动（Drawer）回归验证 Tab 焦点顺序、Esc 关闭、遮罩点击关闭。
- 无新增依赖；纯 CSS + React 改动。
