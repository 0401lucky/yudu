# PDF 支持 MVP — 执行计划

## 顺序清单

1. **shared**：`SUPPORTED_FORMATS` 加 `"pdf"`，`BookFormat` 类型收敛，注释更新
   → 验证：全仓 typecheck（暴露所有 switch/白名单遗漏点）
2. **api / importBook**：`detectFormat` 识别 `.pdf`；pdf 独立成组不合并；导入分支（存源件、status=ready、chapter_count=0、不写 chapters）；`findReadyBookByTitle` 对 pdf 跳过；`reparseBook` 拒绝 pdf
   → 验证：`pnpm --filter @yudu/api typecheck`
3. **api 测试**：pdf 导入建书（无章节、status=ready）/ 同名不合并 / reparse 400 / txt·md·epub 回归
   → 验证：`pnpm --filter @yudu/api test`
4. **api / source 路由**：GET `/api/books/:id/source`（归属 + 仅 pdf + 流式）+ 测试（401/404/非 pdf 404/成功流）
5. **web / 依赖**：`pnpm --filter @yudu/web add pdfjs-dist`；worker `?url` 配置
6. **web / PdfReaderView**：加载 + 单页 canvas 渲染（dpr 适配 + renderTask 竞态取消 + ResizeObserver）
   → 验证：本地 dev 打开 PDF 书正常显示
7. **web / 交互与进度**：三分区点击 / 滑动 / 键盘翻页；`useProgressSync` 接入与恢复；ReaderChrome 页码与 seek 接线；目录/书签/设置入口对 pdf 隐藏
8. **web / 导入与书架**：ImportDropzone ACCEPT 与文案；BookCard 徽标与空进度占位
   → 验证：`pnpm --filter @yudu/web typecheck && pnpm --filter @yudu/web test`
9. **手动验收**：10MB 中文 PDF 全流程（导入→阅读→刷新恢复→跨浏览器恢复→seek）；损坏 PDF 错误态；375px 移动端；`pnpm --filter @yudu/web build` 后检查 pdfjs 独立 chunk
10. **全量**：`pnpm typecheck && pnpm test && pnpm build`

## 风险与回滚点

- importBook.ts 是导入核心（978 行），pdf 分支务必**短路早返回**，不碰既有 txt/md/epub 路径；步骤 3 的回归测试是门禁。
- ReaderPage 分流条件写错会让普通书进 PDF 视图 → typecheck + 手动回归 txt/md/epub 各开一本。
- 回滚：shared 白名单一行 + api 分支 + web 新组件，按 commit revert；建议 api 与 web 分两个 commit。

## 启动前检查

- [ ] `implement.jsonl` / `check.jsonl` 已填真实条目
- [ ] 前置：无硬依赖，但建议最后做（体量最大，且不影响前三个子任务）
- [ ] 实施前用 context7 查 pdfjs-dist 当前版本 API（getDocument/GlobalWorkerOptions 用法可能随版本变化）
