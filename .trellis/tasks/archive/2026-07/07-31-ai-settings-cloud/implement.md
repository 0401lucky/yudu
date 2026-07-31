# 执行计划 — AI 配置跟随账号云端同步

## 顺序清单

### 阶段 A：后端（可独立验证，不影响现有功能）

- [x] **A1** `packages/shared/src/types.ts` 新增 `AiProviderMeta`、`AiSettingsDto`；`index.ts` 导出。
      → 走 `spec/shared/library/type-contracts.md` 的「变更清单」：改 types → `pnpm --filter @yudu/shared test` → 修 api 映射 → 修 web `lib/api.ts` → 全仓 `pnpm typecheck`
- [x] **A2** `apps/api/src/env.ts` 增加 `AI_KEY_SECRET: string`。
- [x] **A3** 新建 `apps/api/src/services/aiKeyCrypto.ts`：`encryptApiKey(plain, secret)` / `decryptApiKey(stored, secret)` / `maskKey(plain)`，格式 `v1.<iv_b64url>.<cipher_b64url>`。
- [x] **A4** 新建 `apps/api/src/services/aiKeyCrypto.test.ts`：往返、随机 IV、空串 / 超长 / 非 ASCII、坏前缀报错、掩码规则。
      → 验证：`pnpm --filter @yudu/api test` → **AC2** 绿
- [x] **A5** 新建 `apps/api/migrations/0010_ai_providers.sql`（两张表 + 索引，见 design.md）。
      → 验证：`cd apps/api && pnpm exec wrangler d1 migrations apply novel-reading-platform-db --local`
      （注：`spec/api/backend/database-guidelines.md` 里写的本地库名 `yudu` 已过时，本地与远程同为 `novel-reading-platform-db`）
- [x] **A6** 新建 `apps/api/src/routes/aiSettings.ts`：6 个端点，全部 `WHERE user_id = ?`；`AI_KEY_SECRET` 缺失 fail fast。
      → 遵循 `spec/api/backend/error-handling.md`：解析失败 400 `INVALID_BODY`、校验失败 400、越权 404 `NOT_FOUND`、message 用简体中文
      → 行类型用本地 `type AiProviderRow` 描述 snake_case，再映射 camelCase DTO
- [x] **A7** `apps/api/src/index.ts` 挂载 `/api/ai`。
- [x] **A8** 新建 `apps/api/src/routes/aiSettings.test.ts`，照 `bookmarks.test.ts:27-45` 的 Mock D1 模式。
      → 覆盖 **AC1 / AC3 / AC4 / AC5 / AC6**
      → 验证：`pnpm --filter @yudu/api test`

**A 阶段结束前端未动，随时可停。**

### 阶段 B：前端存储层

- [x] **B1** `apps/web/src/lib/api.ts` 新增 6 个封装函数（`getAiSettings` / `createAiProvider` / `patchAiProvider` / `deleteAiProvider` / `getAiProviderKey` / `putAiDefaults`）。
- [x] **B2** `apps/web/src/lib/aiSettings.ts` 重写存储层：
      - 类型拆 `AiProviderMeta` / `AiProvider`
      - `getCachedAiSettings()` 同步读 `yudu_ai_settings_cache`
      - `fetchAiSettings()` 异步拉取 + 写缓存 + 内含迁移逻辑（照抄 `useBookmarks.ts:120-174`：`migratedRef` 防重入、全量成功才清 key、损坏数据直接清理）
      - `getProviderKey(id)` 模块级 Map 会话缓存
      - `hasCredentials` 改判 `keyMask`；`resolveProvider` 分支结构**不动**
      - 保留 `yudu-ai-settings-changed` 事件
- [x] **B3** 改造 `apps/web/src/lib/aiSettings.test.ts`：纯函数用例保留，存储用例改为 mock fetch；新增迁移分支用例。
      → 覆盖 **AC7 / AC9 / AC10**
      → 验证：`pnpm --filter @yudu/web test`

### 阶段 C：组件接入

- [x] **C1** `AiProviderSettings.tsx`：异步加载 + 增删改走 API；新增「本机还有 N 个未同步配置 [导入到账号][丢弃]」提示条。
- [x] **C2** `StudioModelPicker.tsx`：首屏用缓存，`refresh()` 拉模型列表前先 `getProviderKey`。
- [x] **C3** `StudioWorkPage.tsx:150` `requireAi()` 改 async，组装明文 provider 后再调 `aiClient`。
- [x] **C4** `StudioListPage.tsx`：`isAiSettingsReady` 改为基于异步 state。
      → 验证：`pnpm --filter @yudu/web build` + 手动进 `/studio` 确认无闪烁（**AC8**）

### 阶段 D：文案、规范与收尾

- [x] **D1** 更新 6 处 UI 文案（PRD「文案对照」表）。
      → 验证：`grep -rn "不会上传到雨读服务器\|保存到本机\|从本机移除" apps/ packages/` 无结果（**AC11**）
- [x] **D2** 更新 4 处 spec（PRD R11）：
      - `spec/api/backend/database-guidelines.md:13` 推翻「密钥与地址永远不入库」+ 补两张新表
      - `spec/web/frontend/quality-guidelines.md:39-43` 重写「AI 提供商配置」节（**保留**仍成立的 `resolveProvider` 回退语义、模型缓存内嵌、协议分发三条）
      - `spec/web/frontend/index.md:46` 去掉「本机」
      - `spec/web/frontend/state-management.md:47-50` AI 配置移到服务端侧
      → 验证：`grep -rn "永远不入库\|只存本浏览器" .trellis/spec/` 无结果（**AC14**）
- [x] **D3** 全量校验：`pnpm typecheck && pnpm test && pnpm build`（**AC13**）
- [x] **D4** 手动端到端：两个浏览器 profile 登录同账号，验证配置可见 + 生成成功 + 书级绑定跟随（**AC12**）

### 阶段 E：部署（需用户执行/确认）

- [x] **E1** `pnpm --filter @yudu/api exec wrangler secret put AI_KEY_SECRET`（值取足够长随机串）
- [x] **E2** `pnpm --filter @yudu/api exec wrangler d1 migrations apply novel-reading-platform-db --remote`
- [x] **E3** `pnpm build && pnpm --filter @yudu/api deploy`

**顺序不可颠倒**：secret 未设就部署 → AI 配置接口全 5xx。

已于 2026-07-31 部署完成：Worker 版本 `1f44a996-3590-49ab-a11e-1d976b6db0e9`。
生产验证：加密写入 `v1.GubS2KmX5XIVykrq.…`、解密回读一致、列表无明文、
生产库明文泄露数 0；验证用的临时账号与数据已删除，三张表归零。

## 验证命令速查

```bash
pnpm --filter @yudu/api test        # 后端单测
pnpm --filter @yudu/web test        # 前端单测
pnpm typecheck                      # 全仓类型
pnpm test                           # 全仓测试
pnpm build                          # 全仓构建
```

## 高风险文件

| 文件 | 风险 |
|---|---|
| `apps/web/src/lib/aiSettings.ts` | 同步→异步重写，5 个消费方全受影响；`resolveProvider` 回退分支若改动会静默改变书级绑定行为 |
| `apps/web/src/pages/StudioWorkPage.tsx` | 883 行，`requireAi()` 改 async 会波及所有生成入口的调用链 |
| 迁移逻辑（B2 内） | 唯一不可逆步骤（删本地明文）；两个 localStorage 键混用会导致重复上传死循环 |
| `0010_ai_providers.sql` | 远程 migration 不可回退，但只新增表，风险可控 |

## 回滚点

- **A 阶段末**：后端已就绪、前端未动，回滚 = 不挂载路由，零影响。
- **C 阶段末**：前端已切云端但未部署，回滚 = `git revert` 代码，本地明文若已被迁移清除需从云端重新取回。
- **E 阶段后**：回滚代码即可；新表留存无害，无需 down migration。
