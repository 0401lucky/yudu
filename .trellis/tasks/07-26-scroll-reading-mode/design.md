# 技术设计:连续阅读(上下滚动)模式

## 总览

新增 `ScrollReaderViewport` 组件与 `useChapterWindow` 数据 hook,与现有 `ReaderViewport`(翻页)并列,由 `ReaderPage` 按 `localPrefs.readingMode` 选择渲染。位置语义统一收敛到 `chapterIndex + charOffset`,两种模式共享同一份云端进度。

```
ReaderPage
├── readingMode === "page"   → ReaderViewport(现有,不改)
└── readingMode === "scroll" → ScrollReaderViewport(新)
        └── useChapterWindow:维护 [prev, current, next] 三章文本
```

## 关键决策

### 1. 位置语义:charOffset 为主锚点

- 现状:进度恢复用 `pageInChapter`,`charOffset` 只是页比例近似值(供书架百分比)。
- 变更:`ReaderPage` 恢复进度时改为优先用 `{ charOffset }` 锚点(`PendingPage` 已支持该变体),`pageInChapter` 仅作为 charOffset 缺失时的回退。
- 理由:滚动模式没有"页"概念;charOffset 是两种模式唯一公共坐标。翻页模式下 charOffset↔页 的换算逻辑已存在(书签/搜索跳转同款),精度(±半页)可接受。
- 上报:滚动模式 `schedule(chapterIndex, charOffset, approxPage)`,其中 `approxPage = floor(offsetRatio × (textLen / 600))` 仅为旧客户端兼容的近似页,600 为既有 `ASSUMED_PAGE_CHARS` 常量口径。

### 2. 章节窗口:DOM 只挂 3 章

`useChapterWindow(bookId, chapterIndex)`:

- 内部缓存 `Map<index, ChapterContent>`(LRU,上限 10 章),`getChapter` 去重并发。
- 返回 `[prev?, current, next?]` 三章(首/末章缺邻章则为 2 章)。
- 滚动越界推进"当前章"时窗口平移,新邻章异步加载;未加载完成前显示占位高度提示("加载中…"),避免滚动条跳动过大。

### 3. 无缝拼接与滚动补偿

- 容器为一个 `overflow-y: auto` 的滚动区,内部按顺序渲染窗口内各章 `<section data-chapter-index>`(章首含标题分隔)。
- **当前章判定**:以"视口顶部 + 1/3 屏高"处所在的 section 为当前章(IntersectionObserver + scroll 事件节流兜底)。
- **顶部 prepend 补偿**:上一章被插入 DOM 后,同步把 `scrollTop += prevSectionHeight`,保证视觉位置不动(在 `useLayoutEffect` 中完成,避免闪跳)。
- **charOffset 换算**:当前章 section 内,`offsetRatio = (viewportTop − sectionTop) / sectionHeight`,`charOffset = round(offsetRatio × textLen)`;反向定位同理(`scrollTop = sectionTop + ratio × sectionHeight`)。与翻页模式一致采用"字符占比 ≈ 高度占比"的近似,md 模式用 `mdPlainLengthApprox`。

### 4. 状态归属:ReaderPage 拆分模式相关逻辑

- `pageIndex/pageCount` 仅翻页模式使用;滚动模式维护 `scrollPos = { chapterIndex, offsetRatio }`。
- 对外统一暴露的派生值:全书进度、页码/百分比文案、当前书签命中、schedule 上报——按模式分支计算,分支点集中在 `ReaderPage`,避免两个视口互相感知。
- 跳转 API 统一为 `jumpTo(chapterIndex, { charOffset })`:翻页模式走现有 `pendingPageRef` 机制;滚动模式写入 `pendingScrollRef`,由 `ScrollReaderViewport` 在目标章挂载完成后消费并定位。

### 5. 偏好存储

`useLocalReaderPrefs` 增加 `readingMode: "page" | "scroll"`,默认 `"page"`,解析时白名单校验(沿用现有防御式读取风格)。

## 交互细节

- 点击:滚动模式下整个视口点击(非拖动、位移 < 10px)只做"唤出/隐藏工具栏",不再分左右翻页区。
- 键盘:`ArrowLeft/ArrowRight` 改为上一章/下一章(滚动模式);`ArrowUp/Down/PageUp/Down/Space` 不拦截,交给原生滚动。翻页模式键位不变。
- 进度条 seek:换算成 `(chapterIndex, ratio)` 后走统一 `jumpTo`。
- 章尾到书末:最后一章底部显示"—— 全书完 ——"占位,不再拼接。

## 兼容与回滚

- 不改任何后端接口与 D1 结构;进度记录字段语义不变(charOffset 一直在写)。
- 翻页模式代码路径零改动(除 ReaderPage 的分支抽取);出问题可把 `readingMode` 默认值锁回 `"page"` 快速止血。
- 旧进度记录(仅 pageInChapter 可靠)在翻页模式下仍按页恢复,滚动模式按 charOffset 恢复,均有回退路径。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 字符占比 ≈ 高度占比的近似在含图片/标题的 md 章节误差偏大 | 与现有书签/搜索跳转同口径,可接受;后续可用二分定位精化 |
| prepend 补偿在 iOS Safari 上可能触发滚动锚定干扰 | 容器设 `overflow-anchor: none`,补偿逻辑自己掌控 |
| 三章 DOM 在超长章节(>10 万字)下渲染慢 | 与翻页模式渲染同量级(翻页也是整章渲染),不新增瓶颈 |
