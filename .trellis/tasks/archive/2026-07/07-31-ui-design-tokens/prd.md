# 设计系统升级：tokens 与全局样式

> 父任务：`07-31-ui-polish`。设计规范详见父任务 `design.md`，本任务只落地 tokens 与全局样式，不涉及组件提取（子任务 02）与页面打磨（子任务 03）。

## Goal

补齐缺失的语义色 / 动效 / 字体 tokens，双主题独立调色；收敛全站重复色值与字体栈；统一圆角散点。为子任务 02/03 提供变量基础。

## Requirements

1. 在 `index.css` 新增语义色变量（night/paper 各自调色）：
   - `--danger` / `--danger-weak`（错误语义，替代约 40 处 `red-*` 硬编码）
   - `--warning` / `--warning-weak`（警示语义，替代 amber 系硬编码）
   - `--hl-yellow` / `--hl-green` / `--hl-blue`（高亮三色，替代 HighlightPopover/TocDrawer/NotesPage 三处 hex）
   - `--hl-tts`（TTS 朗读色）
   - `--overlay`（遮罩统一值）
2. 新增动效 tokens（`:root` 双主题共用）：`--motion-fast/base/slow`（150/200/300ms）与 `--ease-out`（cubic-bezier(0.16,1,0.3,1)）。
3. 新增字体栈变量 `--font-serif` / `--font-sans` / `--font-mono`，`index.css` 与 `readerTypography.ts` 均改引用变量（消除重复定义）。
4. `index.css` 的 `::highlight(yudu-hl-*)` 与 `::highlight(yudu-tts)` 改为引用新变量（`::highlight` 内可用 `var()`，浏览器支持 Custom Highlight 即支持变量）。
5. 圆角散点统一：BookCard `rounded-lg` → `rounded-xl`（对齐其它卡片）。
6. 主题切换正确性：night/paper 新增色均满足对比度（错误/警示文字在各自底色上可读）。

## Acceptance Criteria

- [ ] `index.css` 中每个新增变量在 night 与 paper 均有定义，且值不同（确为独立调色，可用 grep 验证双值）。
- [ ] `::highlight` 区块不再出现硬编码 rgb，全部引用 `--hl-*` 变量。
- [ ] `--font-serif/sans/mono` 三变量定义后，`index.css` 与 `readerTypography.ts` 的字体栈均引用变量，无重复栈字符串。
- [ ] BookCard 圆角已对齐 `rounded-xl`。
- [ ] `pnpm --filter @yudu/web typecheck`、`pnpm -r test`、`pnpm build` 通过。
- [ ] night/paper 双主题下，新语义色在各自底色上对比度可读（Playwright 截图人工确认）。

## Out of Scope

- 替换各页面/组件中的硬编码色（子任务 02/03 按各自范围替换；本任务只定义变量）。
- 公共组件提取。
- 动效实现（本任务只定义时长/缓动 tokens）。
