# 代码复用思考指南 — 雨读

> 产品定位见 [product-positioning.md](./product-positioning.md)（通用阅读器）。

> 小仓库里重复的主要不是「通用 utils」，而是 **常量、校验、API 封装、文件名规则** 被写第二遍。

---

## 1. 改之前先搜

```bash
rg "MAX_UPLOAD_BYTES|SUPPORTED_FORMATS|SESSION_COOKIE|yudu_session" .
rg "parseFilenameSeries|seriesGroupKey" .
rg "ApiError|INVALID_BODY|UNAUTHORIZED" .
rg "function api<|/api/books|/api/progress" apps/web
```

同一字面量出现两次 → 考虑是否应在 `@yudu/shared` 或现有模块。

---

## 2. 放哪里？决策树

```
需要 web 与 api 同时依赖？
  是 → packages/shared（类型 / 常量 / 纯函数）
  否 → 仅一端
        是 HTTP 入口？ → apps/api/src/routes
        是业务/存储？ → apps/api/src/services
        是解析格式？ → apps/api/src/parsers
        是 React UI？ → apps/web/src/components 或 pages
        是浏览器 API 封装？ → apps/web/src/lib 或 hooks
```

### 已有「单一入口」——优先扩展而非平行新建

| 能力 | 扩展点 |
|------|--------|
| HTTP 客户端 | `apps/web/src/lib/api.ts` |
| 会话 | `apps/web/src/lib/auth.tsx` + `api/middleware/auth.ts` + `services/session.ts` |
| 主题/偏好 | `ThemeProvider` + `routes/preferences.ts` |
| 导入 | `importBook.ts` + `routes/books.ts` + `importBooks` |
| R2 路径 | `services/storage.ts` `r2Key` |
| 文件名系列 | `packages/shared/src/filenameSeries.ts` |

---

## 3. 本仓库复用示例

**好：**

- `SESSION_DAYS` 同时驱动 Cookie maxAge 与 DB `expires_at`
- `BookSummary` 类型 api 构造、web 渲染共用
- `parseFilenameSeries` 单测在 shared，导入服务直接调用

**坏：**

- web 再写一套「30 * 1024 * 1024」
- 页面内 `fetch("/api/books")` 绕过 `listBooks`
- 新页面复制一整段 progress debounce 而不用 `useProgressSync`
- parser 里复制 `titleFromFilename` 与 series 解析各一套且行为不一致

---

## 4. 何时不要抽

- **只用一次**的 JSX 结构 → 留在 page
- **仅 Worker** 的 PBKDF2 / mock D1 → 留在 api
- **仅 DOM** 的分页测量 → 留在 `ReaderViewport` / `ReaderPage`
- 为「完美抽象」建 `packages/utils` 却只有一个函数 → 过度

经验：复制到 **第三次** 或 **第二端也需要** 再抽到 shared/hook。

---

## 5. 修改常量的义务

改 `constants.ts` 或默认偏好（theme night、fontSize 18）时：

1. 搜 api 注册插入偏好、preferences `defaults()`、web `defaultPrefs` / `DEFAULTS`
2. 确认迁移默认值与代码默认值一致（`0001_init.sql` vs 运行时 defaults）
3. 跑 shared + api + web typecheck/test

---

## 6. 检查表

- [ ] 搜过是否已有函数/类型/常量
- [ ] 新符号放在正确包与文件
- [ ] 未引入第二套 API 客户端或第二套错误类型
- [ ] 抽共享后两边测试仍绿
