# 实现计划：Markdown 渲染 + 重新解析

## 前置

- [x] `prd.md` 产品决策收敛（D1–D5）
- [x] `design.md` 技术边界与契约
- [x] 主人审阅规划并同意 `task.py start` 后再编码
- [x] 编码前加载 `trellis-before-dev`，读相关 spec 正文

## 有序清单

### A. API：保留 MD 源文

1. [x] 改 `apps/api/src/parsers/md.ts`
2. [x] 更新 `apps/api/src/parsers/md.test.ts`
3. [x] 导入写章节 `char_count` 用 plain 长度

**验证：** 已通过。

### B. API：重新解析

4. [x] `reparseBook` in `importBook.ts`
5. [x] `POST /:id/reparse`
6. [x] `reparseBook.test.ts`

**验证：** 已通过。

### C. Web：MD 渲染

7. [x] `lib/mdRender.tsx` + 测试
8. [x] `ReaderViewport` contentMode
9. [x] `ReaderPage` format===md
10. [x] `index.css` MD 样式

**验证：** 已通过。

### D. Web：书架重新解析

11. [x] `lib/api.ts` reparseBook
12. [x] BookCard 按钮
13. [x] LibraryPage 调用与错误提示

**验证：** typecheck / build 通过。

### E. 收尾质量门

14. [x] api/web 测试 + typecheck + web build
15. [x] trellis-check（主会话内联）
16. [ ] 可选：spec 沉淀（md 章节存源文 / reparse API）— 待主人是否要求
17. **不**自动 commit / push / 发版

## 建议验证命令

```bash
pnpm --filter @yudu/api test
pnpm --filter @yudu/api typecheck
pnpm --filter @yudu/web test
pnpm --filter @yudu/web typecheck
pnpm --filter @yudu/web build
pnpm --filter @yudu/shared test
```

## 手动验收（有 dev 环境时）

1. 导入含粗体/列表/链接的 `.md` → 阅读页样式与外开链接。
2. 旧书（纯文本章节）点「重新解析」→ 样式出现；进度仍在原章附近。
3. 断源或坏文件模拟失败 → 旧文仍在 + 错误提示。
4. 导入 txt → 无重解析按钮、阅读正常。

## 风险与回滚点

| 风险 | 缓解 |
|------|------|
| 多栏 + 列表/标题测量偏差 | 实现后真机/窄屏看一眼；measure 依赖完整 |
| 多源文件重解析漏章 | list `source/` 前缀，对齐导入排序 |
| 行内 `*` 与中文强调误匹配 | 解析器用保守规则；单测边界 |
| 重解析中途失败 | 先解析后写；失败不删旧章 |

回滚：还原 `md.ts` 为 toPlainText + 去掉 reparse 路由与前端入口即可；已重解析的书 text 含标记，旧前端会显示裸标记。

## `task.py start` 前检查

- [x] prd / design / implement 齐全
- [ ] 主人确认范围与设计
- [ ] 同意后执行：`python ./.trellis/scripts/task.py start 07-19-render-markdown`
- [ ] 再 `trellis-before-dev` 后开始 A
