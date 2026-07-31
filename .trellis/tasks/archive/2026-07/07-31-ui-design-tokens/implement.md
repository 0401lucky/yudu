# 实施计划：tokens 与全局样式

## 步骤

1. **编辑 `apps/web/src/index.css`**：
   - `:root` 区新增动效 tokens（`--motion-*` / `--ease-out`）与字体栈变量（`--font-serif/sans/mono`）。
   - night 块（`[data-theme="night"]`）新增 `--danger` / `--danger-weak` / `--warning` / `--warning-weak` / `--hl-*` / `--hl-tts` / `--overlay`。
   - paper 块同样新增，按纸面暖调独立调色（红色降饱和、遮罩换暖调）。
   - body 与 `.reader-page` 字体栈改引用 `var(--font-*)`。
   - `::highlight(yudu-hl-yellow/green/blue)` 与 `::highlight(yudu-tts)` 的 rgb 改引用变量；夜间透明度 variant 保留（用 `color-mix` 或独立变量值实现）。
2. **编辑 `apps/web/src/components/readerTypography.ts`**：serif/sans 字体栈改引用 `var(--font-serif)` / `var(--font-sans)`。
3. **编辑 `apps/web/src/components/BookCard.tsx`**：`rounded-lg` → `rounded-xl`（仅卡片容器，不含内部小元素）。
4. 验证：`pnpm --filter @yudu/web typecheck && pnpm -r test && pnpm build`。
5. 双主题截图抽查（首页/书架/阅读页），确认新变量生效且对比度可读。

## 验证命令

```
pnpm --filter @yudu/web typecheck
pnpm -r test
pnpm build
```

## 验收

- [ ] grep 确认每个新变量在 night/paper 两处定义。
- [ ] `::highlight` 无硬编码 rgb。
- [ ] 字体栈无重复字符串（grep `Noto Serif SC` 只出现在变量定义处）。
- [ ] 双主题截图正常。
