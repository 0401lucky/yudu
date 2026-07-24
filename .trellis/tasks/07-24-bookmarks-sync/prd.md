# 书签云同步

## Goal

书签从 localStorage 迁移到 D1 云端，按用户 + 书隔离同步，换设备不丢。

## Background

- 现状：`apps/web/src/hooks/useBookmarks.ts` 纯 localStorage（key `yudu.reader.bookmarks.<bookId>`），锚点为 `{chapterIndex, pageInChapter}`。
- 缺陷 1：换设备/清缓存书签全丢。
- 缺陷 2：`pageInChapter` 依赖设备视口与字号，跨设备同一页号指向不同内容。
- 参照模式：进度云同步（`reading_progress` 表 + `routes/progress.ts` + `useProgressSync.ts`）已验证 UPSERT + 所有权校验 + 前端静默降级模式。

## Requirements

1. 书签存 D1，锚点改为 `{chapterIndex, charOffset}`（charOffset 按页比例近似，与进度同步同款算法，md 用 `mdPlainLengthApprox`）。
2. API：列出 / 添加 / 删除，均需登录且校验书籍归属。
3. 前端 `useBookmarks` 云端化：打开书时拉取；增删走 API，乐观更新，失败回滚并提示（书签是显式操作，不同于进度的静默）。
4. 本地旧书签一次性迁移：打开书后发现 localStorage 有旧数据 → 换算 charOffset 上传合并 → 成功后清除本地 key；失败保留本地待下次重试。
5. 交互不变：翻页处 toggle、TocDrawer 内列表/跳转/删除。
6. 单书书签上限 200，超出报错提示。

## Acceptance Criteria

- [ ] 浏览器 A 添加书签后，浏览器 B（同账号）打开同一本书能看到并跳转到书签位置（允许 ±1 页近似偏差）。
- [ ] 存有旧版 localStorage 书签的书打开后，书签自动出现在云端列表，且本地 key 被清除，重复打开不产生重复书签。
- [ ] 未登录访问书签 API 返回 401；访问他人书籍的书签返回 404。
- [ ] 增删书签在 API 失败时 UI 回滚并出现提示，阅读不中断。
- [ ] 单书第 201 个书签被拒绝且有提示。
- [ ] `pnpm --filter @yudu/api test`、`pnpm typecheck`、`pnpm build` 通过；书签路由有 vitest 覆盖。

## Out of Scope

- PDF 书签（PDF MVP 不含书签）。
- 书签笔记/批注、书签导出。
