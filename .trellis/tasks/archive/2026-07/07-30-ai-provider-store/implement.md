# 执行计划：多提供商基础设施与设置页二级面板

自下而上。与前三个任务不同，本任务**存储层改动影响所有调用方**，因此第 3 步之后会有一段编译不过的中间状态——按顺序做完 3→7 才能重新 typecheck 通过。

## 步骤

### 1. D1 迁移

- 新建 `apps/api/migrations/0009_studio_provider.sql`：`ALTER TABLE books ADD COLUMN studio_provider_id TEXT;`
- 应用到本地：`cd apps/api && pnpm exec wrangler d1 migrations apply novel-reading-platform-db --local`
- 验证：`pnpm --filter @yudu/api test` 仍全绿（现有测试用 mock D1，不受影响）

### 2. 后端读写新列

- `packages/shared/src/types.ts`：`StudioBookDetail` 加 `providerId?: string`
- `apps/api/src/services/studioBook.ts`：查询列清单、行映射、`patchStudioBook` 三处
- `apps/web/src/lib/api.ts`：`patchStudioBook` 的入参类型加 `providerId`
- 验证：`pnpm --filter @yudu/api typecheck`

### 3. 后端测试

- `apps/api/src/services/studioBook.test.ts` 用例 9、10（design.md §7）
- 验证：`pnpm --filter @yudu/api test` 全绿

**⚑ 回滚点 A**：后端已支持新列，前端未动，线上行为不变。可安全停下。

### 4. 重构 `aiSettings.ts`

- `AiProtocol` / `AiProvider` / `AiSettings` 新类型
- `loadAiSettings` 含迁移（旧格式 → 「默认」提供商，并入旧 models cache，回写后清理旧键）
- `saveAiSettings` / `addProvider` / `updateProvider` / `removeProvider` / `setDefaultProvider`
- `resolveProvider(settings, bookProviderId?, bookModel?)`
- `isAiSettingsReady` 改为基于 `resolveProvider`
- 删除 `loadAiModelsCache` / `saveAiModelsCache` / `clearAiModelsCache` / `getCachedModelsForSettings`（模型缓存内嵌进 provider 后这些不再有意义）
- 验证：先不 typecheck（调用方还没改），直接进第 5 步

### 5. `aiSettings` 测试

- `apps/web/src/lib/aiSettings.test.ts` 用例 1–8（design.md §7）
- **测试先行**：迁移逻辑是本任务最容易出错的地方，先写用例再补实现分支
- 验证：`pnpm --filter @yudu/web test` 中 aiSettings 一项全绿（其它文件此时可能编译失败，用 `-t` 过滤或先跑单文件）

**⚑ 回滚点 B**：存储层与迁移已验证，UI 未接线。

### 6. `aiClient` 签名改为接收 provider

- `listAiModels(provider, signal?)`、`streamChatCompletion({provider, model, ...})`
- 内部 OpenAI 协议实现不变
- 验证：`pnpm --filter @yudu/web typecheck`（此时 UI 调用方仍会报错，属预期）

### 7. 设置页二级面板

- 新建 `apps/web/src/components/AiProviderSettings.tsx`（列表 / 详情两视图，`view` state 切换）
- `SettingsPage.tsx` 删掉内联 AI 段（约 170 行），接线新组件
- 清理因此产生的孤儿代码（`initialModelsState`、`modelFilter`、`manualModel` 等）
- 验证：`pnpm --filter @yudu/web typecheck`

### 8. `StudioModelPicker` 跨提供商

- props 改为 `value?: {providerId, model}` / `onSelect?(providerId, model)`
- 摊平所有提供商的模型，显示「提供商名 / 模型 id」，搜索匹配两者
- **删除 `stale` 相关全部逻辑**（多提供商后不存在该概念）
- 验证：`pnpm --filter @yudu/web typecheck`

### 9. 创作台接线

- `StudioListPage.tsx`：默认提供商/模型选择器接线
- `StudioWorkPage.tsx`：`requireAi()` 改用 `resolveProvider`；`runStream` 传 provider；`selectBookModel` 改为同时 patch `providerId` + `model`
- 验证：`pnpm -r typecheck` **全绿**（到这一步才应该全部通过）

### 10. 全量校验

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @yudu/web build
```

### 11. 应用生产迁移 + 部署

**本任务有 D1 迁移，不能跳过这一步**：

```bash
pnpm --filter @yudu/web build
cd apps/api && npx wrangler d1 migrations apply novel-reading-platform-db --remote
cd apps/api && npx wrangler deploy
```

顺序不能颠倒——先加列再部署新代码，否则新代码查询不存在的列会 500。

### 12. 线上验收

用户通过远程控制操作，需线上验收。对照 prd.md，重点：

1. **打开设置页，确认原有配置已变成一个名为「默认」的提供商**，地址/密钥/模型列表都在（迁移正确性，最关键一条）
2. 添加第二个提供商，各自「获取模型列表」，模型数互不覆盖
3. 编辑 / 删除 / 设为默认都可用，删除有二次确认
4. 创作台模型选择器显示「提供商名 / 模型 id」，搜索能匹配提供商名
5. 书 A 选提供商 1 的模型、书 B 选提供商 2 的模型，来回切换各自记住
6. 打开一个老作品直接生成，应走全局默认且成功
7. 生成一章正文确认端到端可用

### 13. 收尾

spec 更新（多提供商与书级绑定的约定）→ 归档子任务 → commit → push。父任务保持未归档，等阶段 2 完成后一并归档。

## 审查关口

- 步骤 3 后：后端契约确认，线上无影响
- 步骤 5 后：**迁移逻辑确认**——这是全任务风险最高点，老用户配置丢失是不可接受的
- 步骤 10 后：部署前全绿
- 步骤 11：迁移必须先于 deploy
- 步骤 12 后：用户线上验收通过才提交

## 回滚

- A（步骤 3 后）、B（步骤 5 后）为安全停靠点
- 代码回滚：`git checkout -- .`
- 线上回滚：`npx wrangler rollback`
- **D1 加列不需要回滚**：新列可空，旧代码不查询它，多一个空列无害。不要写 `DROP COLUMN` 迁移。
- localStorage 迁移不可逆：迁移会清理旧 `yudu_ai_models_cache` 键。若线上验收发现迁移有误，需先修复迁移逻辑再让用户刷新——因此步骤 5 的测试必须充分。
