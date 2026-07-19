### Task 9: 书架页 UI（列表、导入、删除）

**Files:**
- Create: `apps/web/src/components/BookCard.tsx`
- Create: `apps/web/src/components/ImportDropzone.tsx`
- Modify: `apps/web/src/pages/LibraryPage.tsx`
- Modify: `apps/web/src/lib/api.ts` 增加 books 方法

**Interfaces:**
- 响应式网格：`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
- 拖拽/点击导入；processing 轮询列表至 ready/failed（2s 间隔，最多 60 次）
- 卡片点击 → `/read/:bookId`（ready 才可）
- 删除：确认后 DELETE

- [ ] **Step 1: 实现组件与页面**

视觉：封面 2:3；悬停 translateY(-2px)+阴影；空状态文案「导入第一本书，在雨夜里打开它」。

- [ ] **Step 2: 手动验证导入与展示**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): 书架与导入交互"
```

---

