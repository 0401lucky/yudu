# 质量约定 — @yudu/web

## 必须遵守

1. **API 只经 `lib/api.ts`**，且 `credentials: "include"`
2. **类型与常量对齐 `@yudu/shared`**
3. **鉴权路由**放在 `RequireAuth` 下；401 时登录态清空（`auth.tsx`）
4. **导入响应**按 `BookSummary[]` 处理（`importBooks` 兼容单对象历史形状）
5. **中文产品文案**；错误优先展示服务端 `message`

## 移动端与阅读体验

- 布局响应式（书架网格、阅读工具栏）
- `overscroll-behavior: none` 减少 iOS 整页拖动
- 安全区 padding；阅读区 `100dvh`
- 键盘左右键翻页（`ReaderPage`）；触控区由 Viewport/Chrome 处理

## 依赖纪律

当前 runtime 依赖仅：`react`、`react-dom`、`react-router-dom`、`@yudu/shared`。

新增 UI/状态库前需明确理由；默认用现有 Tailwind + 自研组件。

## 测试

- `vitest run --passWithNoTests`：web 包测试较少
- 改 `lib/api` 契约时同步跑 api 测试与手动验收导入/阅读
- 关键逻辑优先在 shared 或 api 单测覆盖

## 调试日志

导入路径允许 `console.info` / `console.error` 带 `[雨读]` 前缀（`LibraryPage`）。不要在翻页热路径打 log。

## 构建与部署

```bash
pnpm --filter @yudu/web build   # 产出 apps/web/dist
# API wrangler assets.directory = "../web/dist"
```

改 `base` 或路由 mode 会影响 Workers SPA 回退，需与 `wrangler.toml` `not_found_handling` 一致。

## 反模式

- `localStorage` 存密码或 session token（会话在 HttpOnly Cookie）
- 阅读页阻塞在每次翻页 await 进度 API（应走 debounce schedule）
- 删除书籍不二次确认
- 忽略 `book.status !== "ready"` 仍进入阅读器（`BookCard` 已限制）
