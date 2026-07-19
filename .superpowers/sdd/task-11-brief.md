### Task 11: 阅读器页面（翻页、目录、预取章）

**Files:**
- Create: `apps/web/src/hooks/usePagination.ts`
- Create: `apps/web/src/components/ReaderViewport.tsx`
- Create: `apps/web/src/components/ReaderChrome.tsx`
- Create: `apps/web/src/components/TocDrawer.tsx`
- Create: `apps/web/src/pages/ReaderPage.tsx`
- Modify: `apps/web/src/App.tsx` 路由

**Interfaces:**
- `ReaderPage` 加载 `BookDetail` + progress + preferences
- 拉当前章 `ChapterContent`，`paginateText` 得页；显示 `text.slice(start, end)`
- 手势：pointer 事件左右滑阈值 > 50px；点击左 30% / 右 30% 热区；键盘 ArrowLeft/Right
- 中央 40% 切换 chrome 显隐
- 章末下一页 → chapter+1 offset 0；章首上一页 → 上章最后一页
- `prefers-reduced-motion: reduce` 时无位移动画

- [ ] **Step 1: 实现 ReaderViewport 与键盘/点击/滑动**

正文字体 CSS：
```css
.reader-page {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  color: var(--text);
  background: var(--page-bg);
}
```

版心：外层 flex 居中，内层 `width: min(100%, 720px)`，padding 随 `pageMargin`。

- [ ] **Step 2: TocDrawer 跳章**

- [ ] **Step 3: 手动验证样例书完整翻页**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(web): 左右翻页阅读器与目录"
```

---

