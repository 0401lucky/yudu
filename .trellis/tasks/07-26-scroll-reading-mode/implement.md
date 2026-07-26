# 实施计划:连续阅读(上下滚动)模式

验证命令(每步后按需执行):

```bash
pnpm --filter @yudu/web lint && pnpm --filter @yudu/web typecheck
pnpm --filter @yudu/web dev   # 手动验证交互
```

## 步骤

- [x] 1. `useLocalReaderPrefs` 增加 `readingMode: "page" | "scroll"`(默认 page,白名单解析)
      → 验证:typecheck 通过;localStorage 旧数据不带该字段时回退默认值。
- [x] 2. `ReaderSettingsSheet` 增加"阅读模式"分段控件(翻页 / 连续滚动)
      → 验证:切换后偏好持久化,刷新保持。
- [x] 3. 新建 `hooks/useChapterWindow.ts`:三章窗口 + LRU 缓存 + 并发去重
      → 验证:typecheck;窗口平移时相邻章按需加载、缓存命中不重复请求(Network 面板)。
- [x] 4. 新建 `components/ScrollReaderViewport.tsx`:
      - 三章 section 渲染(章题分隔、全书完占位)
      - 当前章判定 + charOffset 上报(节流)
      - prepend 滚动补偿(`overflow-anchor: none` + useLayoutEffect)
      - pendingScroll 消费定位(chapterIndex + charOffset → scrollTop)
      - 点击唤出工具栏(位移阈值同翻页模式)
      → 验证:连续滚完 3 章以上无跳变;向上滚回上一章视觉位置不动。
- [x] 5. `ReaderPage` 接入:
      - 按 readingMode 分支渲染两个视口
      - 进度恢复改为优先 `{ charOffset }` 锚点(pageInChapter 回退)
      - 滚动模式的 schedule 上报、进度条文案("第 x/y 章 · z%")、seek、目录/书签/搜索跳转、书签点亮判定
      - 键盘:滚动模式 ←/→ 切章,↑/↓ 原生滚动
      → 验证:验收标准逐条手测(两种模式互切位置保持、跳转落点、书签点亮)。
- [ ] 6. 回归:翻页模式全流程手测 + PDF 打开一本确认无影响
      → 验证:翻页/书签/搜索/进度恢复与改动前一致。
- [x] 7. 全量检查 `pnpm -r lint && pnpm -r typecheck && pnpm -r test`
      → 验证:全绿。(仓库无 lint 脚本;`pnpm -r typecheck` 与 `pnpm -r test` 全绿)

## 回滚点

- 每步独立可回滚;整体止血方案:`readingMode` 默认值锁 `"page"`,设置项隐藏。

## 审查关口

- 步骤 4/5 完成后走 trellis-check(重点:进度换算口径、prepend 补偿、旧进度兼容)。
