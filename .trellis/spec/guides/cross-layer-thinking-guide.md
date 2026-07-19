# 跨层思考指南 — 雨读

> 本项目的 bug 多发在 **shared 契约 ↔ api 映射 ↔ web 消费** 边界，以及 **D1 snake_case ↔ JSON camelCase**。  
> 产品定位见 [product-positioning.md](./product-positioning.md)（**通用阅读器**，非仅小说）。

---

## 1. 先画数据流

典型链路：

### 导入

```
File[] (web ImportDropzone)
  → multipart file/files (lib/api.importBooks)
  → routes/books collectUploadFiles
  → importBooksBatch + parsers
  → D1 books/chapters + R2
  → BookSummary[] → 书架 UI
```

### 阅读进度

```
ReaderPage 页码变化
  → useProgressSync 防抖
  → PUT /api/progress (chapterIndex, charOffset, pageInChapter)
  → D1 reading_progress + touch books.updated_at
  → 再次打开：GET progress + GET book → pendingPage 落页
  → 书架 progressPercent 由列表查询估算
```

### 偏好

```
ReaderSettings / Settings
  → ThemeProvider.setPrefs
  → PUT /api/preferences
  → D1 user_preferences
  → data-theme + 字号行距影响 ReaderViewport 测量
```

每条箭头问：格式是什么？谁校验？失败 code 是什么？

---

## 2. 本仓库边界表

| 边界 | 风险 | 契约位置 |
|------|------|----------|
| web ↔ api | 字段名、状态码、204 无 body | `@yudu/shared` + `lib/api.ts` |
| api route ↔ service | 校验错误是否变成 JSON | `ImportValidationError`、手写 `c.json` |
| service ↔ D1 | snake_case 行列 ↔ camelCase DTO | 各 route 的 `rowTo*` / `toUserPublic` |
| service ↔ R2 | key 布局、章节 JSON 形状 | `storage.r2Key`、`ChapterPayload` |
| api ↔ Cookie | 名、Secure、路径 | `SESSION_COOKIE`、`setSessionCookie` |

---

## 3. 常见跨层错误（针对雨读）

### 3.1 只改一端类型

**坏**：只在 web 给 `BookSummary` 加字段。  
**好**：先改 `packages/shared/src/types.ts`，再改 api 映射与 web 使用。

### 3.2 D1 列名直接当 JSON

**坏**：`return c.json(row)` 把 `display_name` 丢给前端。  
**好**：`toUserPublic` / `rowToSummary` / `rowToPrefs` 显式映射。

### 3.3 所有权漏检

**坏**：`WHERE id = ?` 不带 `user_id`。  
**好**：书籍相关查询始终 `id = ? AND user_id = ?`（见 progress/books）。

### 3.4 错误形状漂移

**坏**：`{ message: "..." }` 无 `error.code`。  
**好**：`ApiErrorBody`；web 用 `ApiError.code` 分支（如 401 清会话）。

### 3.5 导入字段名不一致

**坏**：只认 `file` 或只认 `files`。  
**好**：双边兼容：`files` + 单文件时额外 `file`（web `importBooks` + api `collectUploadFilesFromFormData`）。

### 3.6 系列合并只改一端

**坏**：只改前端展示分组，api 仍一本文件一本书。  
**好**：规则在 `filenameSeries`；合并在 `importBook`；UI 只展示结果。

---

## 4. 契约变更检查表

- [ ] `packages/shared` 已更新且测试通过
- [ ] api 路由/服务映射与校验范围已对齐
- [ ] web `lib/api.ts` 与页面已对齐
- [ ] 迁移（若有）本地 apply
- [ ] `pnpm typecheck` 与相关 `pnpm test`
- [ ] 手动：注册登录、导入、翻页刷新、主题切换

---

## 5. 分层职责（勿泄漏）

| 层 | 应知道 | 不应知道 |
|----|--------|----------|
| web 组件 | DTO、用户操作 | SQL、R2 key |
| web api.ts | 路径、方法、错误体 | PBKDF2、D1 |
| api routes | HTTP、鉴权、状态码 | DOM 分页 |
| api parsers | 字节 → 章节文本 | 用户 id |
| shared | 稳定契约 | 任一侧实现细节 |
