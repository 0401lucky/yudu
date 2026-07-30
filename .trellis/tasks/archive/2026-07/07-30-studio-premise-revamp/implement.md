# 执行计划：优化创作台立项流程

按「数据 → 提示词 → 预置表 → UI → 接线 → 验证」自下而上，每步可独立 typecheck。

## 步骤

### 1. 扩展 `StudioPremise` 类型

- 文件：`packages/shared/src/types.ts:57-62`
- 加 `idea?` / `logline?` / `autoChapterCount?`，每个字段带中文注释，说明 genre/tone 用「｜」拼接
- 验证：`pnpm -r typecheck` 通过（此时无使用方，应无报错）

### 2. 后端白名单放行新字段

- 文件：`apps/api/src/services/studioBook.ts:95-102`
- 在 premise 归一化块补 3 个 typeof 判断
- 验证：`pnpm --filter @yudu/api test`

### 3. 后端测试

- 文件：`apps/api/src/services/studioBook.test.ts`
- 用例 10、11（见 design.md §7）
- 验证：`pnpm --filter @yudu/api test` 全绿

**⚑ 回滚点 A**：此时前后端行为无变化，可安全停下。

### 4. 新建预置词表

- 文件：`apps/web/src/lib/studioPresets.ts`（新建）
- `GENRE_PRESETS`（~16 个：玄幻/都市/古言/现言/仙侠/悬疑/科幻/末世/星际/宫斗/穿书/重生/系统/无限流/校园/年代）
- `TONE_PRESETS`（~12 个：爽文/虐心/轻松搞笑/甜宠/暗黑/热血/治愈/悬疑烧脑/群像/沙雕/正剧/慢热）
- `LENGTH_PRESETS`（3 个：短篇（约 5 万字）/中篇（约 30 万字）/长篇（100 万字以上））
- `IDEA_SAMPLES`（5 个 `{label, text}`，text 必须是完整的一两句话，不是词）
- 验证：`pnpm --filter @yudu/web typecheck`

### 5. 提示词：build 与 parse

- 文件：`apps/web/src/lib/studioPrompts.ts`
- 新增 `ParsedPremise` 接口、`buildPremiseMessages`、`buildTitlesMessages`、`parsePremiseFromAi`、`parseTitlesFromAi`
- 改 `formatPremise`：补 idea / logline / notes 文案改「额外要求」
- 复用 `baseSystem` / `withUserPin`，引用 `studioPresets` 的词表
- 验证：`pnpm --filter @yudu/web typecheck`

### 6. 提示词测试

- 文件：`apps/web/src/lib/studioPrompts.test.ts`
- 用例 1–9（见 design.md §7）
- **先写测试再补解析器细节**：解析器的容错分支（markdown 星号、书名号、退化解析）以测试驱动
- 验证：`pnpm --filter @yudu/web test` 全绿

**⚑ 回滚点 B**：纯新增函数，未接入 UI，线上无影响。

### 7. 新建立项面板组件

- 文件：`apps/web/src/components/StudioPremisePanel.tsx`（新建）
- 局部组件 `TagPicker`（多选）、`TagRadio`（单选）、`FieldHint`（说明行）
- 按 design.md §5.5 布局；纯受控，无网络无 AI 设置读取
- 视觉 token 对齐 `StudioModelPicker.tsx` 与现有卡片
- 验证：`pnpm --filter @yudu/web typecheck`

### 8. 接线 `StudioWorkPage`

- 文件：`apps/web/src/pages/StudioWorkPage.tsx`
- 删除 `genre`/`tone`/`targetLength`/`notes`/`autoChapterCount` 五个 useState，改 `premiseDraft` + `titleCandidates`
- `load()` / `savePremise()` 改为整体读写 premise
- 新增 `genPremise()` / `genTitles()`，走已有 `runStream`
- `genChapterOutlines()` 的 `autoChapterCount` 改读 `premiseDraft.autoChapterCount ?? true`；「分章细纲」按钮文案同源
- 删掉 `:558-628` 内联立项段，替换为 `<StudioPremisePanel …/>`
- 检查并删除因此产生的孤儿代码：局部 `Field` 组件若无其他使用者则移除
- 验证：`pnpm --filter @yudu/web typecheck`

### 9. 全量校验

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @yudu/web build
```

### 10. 人工验收（浏览器）

对照 prd.md 的 Acceptance Criteria 逐条走：

1. 新建作品 → 立项面板有灵感区与示例标签
2. 点一个灵感标签 → 句子填入输入框
3. 点「AI 帮我立项」→ 五项回填、书名 3 候选
4. 点候选书名 → 书名字段切换
5. 点「⟳ 换一批书名」→ 只有书名变
6. 类型/基调多选、自定义词、篇幅单选
7. 保存 → 刷新页面 → 全部回显（重点验 idea / logline / autoChapterCount）
8. 打开一个旧作品 → 正常显示可保存
9. 去「分章细纲」→ 按钮文案与立项里的分章开关一致

## 审查关口

- 步骤 3 后：后端契约确认，再动前端
- 步骤 6 后：解析器容错确认（这是最容易出问题的地方，模型输出不可控）
- 步骤 9 后：交用户浏览器验收，通过后才提交

## 回滚

- A（步骤 3 后）/ B（步骤 6 后）为安全停靠点，均无用户可见变化
- 全部回滚：`git checkout -- .`（本任务不产生 DB migration，无数据回滚需求）

## 验证命令汇总

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @yudu/web build
```
