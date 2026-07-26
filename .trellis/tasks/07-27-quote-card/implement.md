# 执行计划：书摘分享卡片

1. **lib/quoteCardLayout.ts**：纯函数——CJK 感知的逐字换行、截断、行高计算（输入文本+宽度+字号 → 行数组与总高）+ 单测。
2. **lib/quoteCardRender.ts**：Canvas 绘制（模板色板 night/paper、摘录、笔记、书名·作者、日期、落款）→ 返回 canvas；`toBlob` 导出。
3. **components/QuoteCardModal.tsx**：预览弹窗（img src=objectURL）、模板切换、下载、`navigator.share` 分享（feature detect）。
4. **接入**：NotesPage 条目「分享」；HighlightPopover edit 模式「分享」（需把书名/作者传入阅读器高亮上下文，查 ReaderPage 已有 BookDetail 数据即可）。
5. **验证**：单测 + typecheck + 手测下载 PNG（中文换行、2x 清晰度）。
