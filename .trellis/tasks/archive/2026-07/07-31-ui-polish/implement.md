# 实施计划：UI 视觉升级

执行顺序与依赖：**01 design-tokens → 02 components → 03 pages**（后两个子任务依赖第一个的变量与规范；01 不依赖任何子任务）。各子任务内部流程见各自 `implement.md`。

## 执行顺序

1. [ ] 子任务 `07-31-ui-design-tokens`：新增语义色/动效/字体 tokens，双主题调色，`::highlight` 收敛，圆角散点统一。
2. [ ] 子任务 `07-31-ui-components`：提取 7 个公共组件并替换重复块；补齐抽屉/弹窗/Chrome/TTS 开合过渡；hover 微交互统一。
3. [ ] 子任务 `07-31-ui-pages`：各页面视觉打磨、标题/导航统一、路由代码分割、页面进入动画、封面淡入。

## 集成验收（父任务，子任务全部完成后）

1. 验证命令：`pnpm --filter @yudu/web typecheck`、`pnpm -r test`、`pnpm build`。
2. 全站 grep 硬编码色检查：`grep -rnE '(red|amber|rose)-[0-9]' apps/web/src`（允许 quoteCardRender.ts 与 `::highlight` 例外）。
3. Playwright 截图：night/paper × 桌面/375px × 关键页面（Landing/Library/Reader/Report/Notes/Settings/StudioList）。
4. 动效抽查：抽屉/弹窗开合、页面进入、Chrome 显隐；开启 reduced-motion 复查无动画。
5. 性能对比：`pnpm build` 后对比主 chunk 体积（路由分割前 vs 后）。
6. 阅读器回归：翻页、滚动模式、TTS、高亮、书签功能手动走查。

## 回滚点

- 每个子任务独立提交；出现问题时回滚单个子任务，不影响其它子任务。
- tokens 改动（01）影响面最大，先提交后再动组件层。

## 审查门

- 子任务 01 完成后：`typecheck + build` 通过 + 双主题首页截图。
- 子任务 02 完成后：`typecheck + build` 通过 + 抽屉/弹窗动效与焦点回归。
- 子任务 03 完成后：进入父任务集成验收。
