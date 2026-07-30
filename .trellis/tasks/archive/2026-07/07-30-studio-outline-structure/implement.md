# 执行计划：大纲与细纲结构化

自下而上，每步可独立 typecheck。

## 步骤

### 1. 类型扩展

- `packages/shared/src/types.ts`
- 新增 `StudioOutlineDetail`（8 字段，中文注释）
- `StudioAssets` 加 `outlineDetail?`；`outline` 注释改为「旧版整段大纲」
- `StudioChapterOutline` 加 `conflict?` / `hook?` / `characters?`
- 验证：`pnpm -r typecheck`

### 2. 后端白名单

- `apps/api/src/services/studioBook.ts` → `normalizeAssets`
- `outlineDetail`：嵌套块，8 个 `typeof === "string"`；全空时不写入该键
- `chapterOutlines` 的 `map` 里补 3 个字段
- 验证：`pnpm --filter @yudu/api test`

### 3. 后端测试

- `apps/api/src/services/studioBook.test.ts`
- 用例 13、14（design.md §6）
- 验证：`pnpm --filter @yudu/api test` 全绿

**⚑ 回滚点 A**：无用户可见变化。

### 4. 字段映射表 + 大纲提示词与解析

- `apps/web/src/lib/studioPrompts.ts`
- `OUTLINE_FIELDS` / `CHAPTER_FIELDS` 两张表
- 重写 `buildOutlineMessages`（逐行 8 字段）
- 新增 `parseOutlineDetailFromAi`（命中 0 个返回 null）
- 新增 `formatOutline(assets)`
- 验证：`pnpm --filter @yudu/web typecheck`

### 5. 细纲提示词与解析

- 原 `parseChapterOutlinesFromAi` 逻辑另存为 `parseLegacyChapterOutlines`
- 新 `parseChapterOutlinesFromAi`：`【第N章】` 切块 → 空行兜底 → `scanFields` → 0 章则退化
- 重写 `buildChapterOutlinesMessages`（块格式）
- 验证：`pnpm --filter @yudu/web typecheck`

### 6. 下游打通

- `buildChapterOutlinesMessages` / `buildChapterBodyMessages` 里的 `assets.outline || "（无）"` 换成 `formatOutline(assets)`
- `buildChapterBodyMessages` 补入本章 `conflict` / `hook` / `characters`，并要求「本章落在章末钩子上」
- 验证：`pnpm --filter @yudu/web typecheck`

### 7. 前端测试

- `apps/web/src/lib/studioPrompts.test.ts`
- 用例 1–12（design.md §6）
- **测试先行**：先写用例，再补解析器容错分支
- 跑全量确认立项 12 项 + 人设 10 项未被破坏
- 验证：`pnpm --filter @yudu/web test` 全绿

**⚑ 回滚点 B**：解析与提示词已变、UI 未动。

### 8. 总大纲面板

- `apps/web/src/components/StudioOutlinePanel.tsx`（新建）
- 8 字段（`throughline` 用 input，其余 textarea），旧大纲虚线框仅在非空时出现
- 视觉 token 对齐 `StudioPremisePanel` / `StudioCharacterPanel`
- 验证：`pnpm --filter @yudu/web typecheck`

### 9. 细纲面板

- `apps/web/src/components/StudioChaptersPanel.tsx`（新建）
- `<details>` 折叠，收起显示「第 N 章 · 标题」，删除按钮拦截折叠切换
- `newlyAddedIndex` 控制新增章展开
- 验证：`pnpm --filter @yudu/web typecheck`

### 10. 接线 `StudioWorkPage`

- 删掉 `step === "outline"` 与 `step === "chapters"` 两段内联
- `genOutline` 改为解析 `outlineDetail`，null 时回落写 `outline` 字符串
- 新增 `removeChapterOutline(i)`；`addChapterOutline` 记录新增 index
- 清理孤儿代码
- 验证：`pnpm --filter @yudu/web typecheck`

### 11. 全量校验

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @yudu/web build
```

### 12. 部署 + 线上验收

用户通过远程控制操作，无法本地测试，需部署到线上验收：

```bash
pnpm --filter @yudu/web build
cd apps/api && npx wrangler deploy
```

无 D1 迁移，跳过 migrations apply。部署后 curl 线上产物确认新文案存在。

对照 prd.md Acceptance Criteria 逐条走，重点：

1. 「AI 生成总大纲」→ 8 字段各自被填
2. 「AI 生成细纲」→ 每章有梗概/冲突/钩子/人物
3. 细纲卡片默认收起，「加一章」新卡默认展开，可删单章
4. 改字段 → 保存 → 刷新回显
5. **打开旧作品**：旧大纲在「旧大纲」区，旧 summary 在「本章梗概」
6. 生成一章正文，观感上是否更贴钩子（间接验证下游打通）

### 13. 收尾

spec 更新（若有新契约）→ 归档任务 → commit → push。

## 审查关口

- 步骤 3 后：后端契约确认
- 步骤 7 后：解析容错确认，且立项/人设既有测试未被破坏
- 步骤 11 后：部署前全绿
- 步骤 12 后：用户线上验收通过才提交

## 回滚

- A（步骤 3 后）、B（步骤 7 后）为安全停靠点
- 全部回滚：`git checkout -- .`（无 DB 迁移）
- 线上回滚：`npx wrangler rollback`
