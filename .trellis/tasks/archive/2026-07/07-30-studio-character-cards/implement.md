# 执行计划：人设改为结构化角色卡

自下而上，每步可独立 typecheck。

## 步骤

### 1. 扩展 `StudioCharacter`

- 文件：`packages/shared/src/types.ts`
- 加 8 个可选字段 + 中文注释；`role` 注释改为「故事定位」
- 验证：`pnpm -r typecheck`

### 2. 后端白名单

- 文件：`apps/api/src/services/studioBook.ts`（characters 归一化块，约 :110）
- 补 8 个 `typeof === "string"` 判断
- 验证：`pnpm --filter @yudu/api test`

### 3. 后端测试

- 文件：`apps/api/src/services/studioBook.test.ts`
- 用例 11、12（design.md §8）
- 验证：`pnpm --filter @yudu/api test` 全绿

**⚑ 回滚点 A**：无用户可见变化。

### 4. 抽通用 `scanFields`

- 文件：`apps/web/src/lib/studioPrompts.ts`
- 把立项的 `scanPremiseFields` 内部逻辑抽为 `scanFields(text, keys)`，`scanPremiseFields` 改为调用它
- **不改变立项行为**：跑现有立项测试确认全绿
- 验证：`pnpm --filter @yudu/web test`（立项那 10 项必须仍全绿）

### 5. 人设字段映射表 + 提示词

- 文件：`apps/web/src/lib/studioPrompts.ts`
- 常量表：中文键 ↔ `StudioCharacter` 字段名 ↔ 界面标签（解析与提示词共用）
- 重写 `buildCharactersMessages`：块格式、8 维度、禁空泛标签、角色间张力
- 验证：`pnpm --filter @yudu/web typecheck`

### 6. 解析器

- 文件：`apps/web/src/lib/studioPrompts.ts`
- 原 `parseCharactersFromAi` 逻辑原样另存为 `parseLegacyCharacters`（退化路径）
- 新 `parseCharactersFromAi`：`【角色N】` 切块 → 空行切块兜底 → 逐块 `scanFields` → 0 个则退化
- 验证：`pnpm --filter @yudu/web typecheck`

### 7. 提示词与解析测试

- 文件：`apps/web/src/lib/studioPrompts.test.ts`
- 用例 1–10（design.md §8）
- **测试先行**：先写用例再补解析器的切块与容错分支
- 验证：`pnpm --filter @yudu/web test` 全绿

**⚑ 回滚点 B**：`parseCharactersFromAi` 行为已变但 UI 未动——此时人设生成已能产出结构化数据，只是界面看不到新字段。可停。

### 8. `formatCharacters` 扩展

- 文件：`apps/web/src/lib/studioPrompts.ts`
- 逐维度输出，空字段跳过；旧角色输出「描述：」
- 验证：用例 8、9 通过

### 9. 角色卡面板组件

- 文件：`apps/web/src/components/StudioCharacterPanel.tsx`（新建）
- `<details>`/`<summary>` 折叠；`newlyAddedId` 控制新增卡默认展开
- 8 个字段 textarea + `description` 非空时的「旧描述」块
- 删除单个角色按钮（带 `window.confirm`，与删书一致的交互习惯）
- 视觉 token 对齐 `StudioPremisePanel`
- 验证：`pnpm --filter @yudu/web typecheck`

### 10. 接线 `StudioWorkPage`

- 文件：`apps/web/src/pages/StudioWorkPage.tsx`
- 删掉内联人设段（`step === "characters"` 那块）
- 新增 `removeCharacter(i)`；`addCharacter` 返回新 id 供面板展开
- 接 `<StudioCharacterPanel …/>`
- 清理因此产生的孤儿代码
- 验证：`pnpm --filter @yudu/web typecheck`

### 11. 全量校验

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @yudu/web build
```

### 12. 部署 + 线上验收

用户不在电脑前，需部署到线上验收（同上次流程）：

```bash
pnpm --filter @yudu/web build
cd apps/api && npx wrangler deploy
```

无 D1 迁移，跳过 migrations apply。

对照 prd.md Acceptance Criteria 逐条走，重点：

1. AI 生成人设 → 8 维度都有内容且明显更详细
2. 卡片默认收起，点开看全部字段
3. 「添加角色」新卡默认展开
4. 改字段 → 保存 → 刷新回显
5. **打开旧作品**，原描述在「旧描述」区可见可编辑
6. 删除单个角色可用
7. 去「正文」生成一章，观感上人物是否更立体（间接验证 `formatCharacters`）

### 13. 收尾

spec 更新（若有新契约）→ commit → push → 归档任务。

## 审查关口

- 步骤 4 后：确认立项测试未被 `scanFields` 重构破坏
- 步骤 7 后：解析器容错确认（模型输出不可控，这里最易出问题）
- 步骤 11 后：部署前全绿
- 步骤 12 后：用户线上验收通过才提交

## 回滚

- A（步骤 3 后）、B（步骤 7 后）为安全停靠点
- 全部回滚：`git checkout -- .`（无 DB 迁移，无数据回滚需求）
- 线上回滚：`npx wrangler rollback`（回到上一个 Version）
