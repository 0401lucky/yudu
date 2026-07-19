### Task 13: 偏好设置、主题切换、设置页

**Files:**
- Create: `apps/api/src/routes/preferences.ts`
- Create: `apps/web/src/components/ThemeProvider.tsx`
- Modify: `SettingsPage.tsx`, `ReaderChrome.tsx`, `App.tsx`

**Interfaces:**
- `GET/PUT /api/preferences`
- fontSize 范围 14–28；lineHeight 1.4–2.2
- ThemeProvider：`document.documentElement.setAttribute('data-theme', theme)`
- 阅读器内改字号立即重分页并保持 charOffset

- [ ] **Step 1: API + 前端设置页（主题、字号、行距、边距、登出）**

- [ ] **Step 2: 阅读器工具栏快捷改字号/主题**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: 用户阅读偏好与双主题"
```

---

