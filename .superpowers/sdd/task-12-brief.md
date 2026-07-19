### Task 12: 进度 API 与前端同步

**Files:**
- Create: `apps/api/src/routes/progress.ts`
- Create: `apps/web/src/hooks/useProgressSync.ts`
- Modify: `apps/api/src/index.ts`, `ReaderPage.tsx`

**Interfaces:**
- `GET /api/progress/:bookId` → ReadingProgress | 默认 chapter 0 offset 0
- `PUT /api/progress/:bookId` body `{ chapterIndex, charOffset, pageInChapter? }`
- `useProgressSync`：本地 state；防抖 1000ms PUT；`visibilitychange` hidden 时 flush

- [ ] **Step 1: API 实现 + curl 验证**

- [ ] **Step 2: 接入 ReaderPage：进入时 GET，翻页更新 offset=pageStarts[page]**

- [ ] **Step 3: 刷新浏览器应回到附近页**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: 阅读进度云同步"
```

---

