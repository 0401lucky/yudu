# 技术设计：大纲与细纲结构化

沿用立项、人设两次改造已验证的模式，不引入新机制。

## 1. 改动边界

| 层 | 文件 | 改动 |
|---|---|---|
| 类型 | `packages/shared/src/types.ts` | 新增 `StudioOutlineDetail`；`StudioAssets` 加 `outlineDetail?`；`StudioChapterOutline` 加 3 字段 |
| 后端 | `apps/api/src/services/studioBook.ts` | `normalizeAssets` 补 `outlineDetail` 与细纲 3 字段白名单 |
| 提示词 | `apps/web/src/lib/studioPrompts.ts` | 大纲/细纲的 build 与 parse 重写；`formatOutline` 新增 |
| UI | `apps/web/src/components/StudioOutlinePanel.tsx`（新建） | 总大纲 8 字段 |
| UI | `apps/web/src/components/StudioChaptersPanel.tsx`（新建） | 细纲折叠卡片 |
| UI | `apps/web/src/pages/StudioWorkPage.tsx` | 删两段内联，接线两个面板 |

不动：立项/人设面板、`aiClient`、DB schema、路由。

## 2. 数据契约

```ts
/** 结构化总大纲；旧数据在 StudioAssets.outline 字符串里 */
export interface StudioOutlineDetail {
  /** 全书从头到尾在讲的那件事 */
  throughline?: string;
  /** 世界观：规则、时代、力量体系 */
  setting?: string;
  /** 核心冲突：主角要对抗什么，为什么绕不开 */
  conflict?: string;
  /** 起 · 开局 */
  act1?: string;
  /** 承 · 发展 */
  act2?: string;
  /** 转 · 高潮 */
  act3?: string;
  /** 合 · 结局 */
  act4?: string;
  /** 支线与伏笔 */
  subplots?: string;
}

export interface StudioAssets {
  premise: StudioPremise;
  characters: StudioCharacter[];
  /** 旧版整段大纲；历史数据在此，新生成不再写入 */
  outline: string;
  /** 结构化大纲；为空时回退用 outline */
  outlineDetail?: StudioOutlineDetail;
  chapterOutlines: StudioChapterOutline[];
  updatedAt: number;
}

export interface StudioChapterOutline {
  index: number;
  title: string;
  /** 本章梗概（主字段，语义不变） */
  summary: string;
  /** 本章冲突与看点 */
  conflict?: string;
  /** 章末钩子 */
  hook?: string;
  /** 出场人物 */
  characters?: string;
}
```

**为什么 `outline` 保留而非迁移**：与人设的 `description` 同一判断——旧数据全在这个必填字符串里，改可选或删除都要写迁移分支处理 D1 已有 JSON。保留后零处理，新生成时 `outline` 留空、只写 `outlineDetail`。

**为什么 `outlineDetail` 是可选对象而非展平到 `StudioAssets`**：8 个字段放一个子对象里，`normalizeAssets` 只需一个嵌套块，前端也能整体判空（`hasOutlineDetail()`）来决定走结构化还是旧字符串。

后端白名单按 premise 的同一模式写：`outlineDetail` 逐字段 `typeof === "string"`；细纲的 3 个新字段加在现有 `map` 里。

## 3. 提示词与解析

### 3.1 字段映射表

与 `CHARACTER_FIELDS` 同构，新增两张表，供提示词、解析、UI 三处共用：

```ts
export const OUTLINE_FIELDS = [
  { key: "throughline", aiKey: "主线", label: "一句话主线" },
  { key: "setting",     aiKey: "世界观", label: "世界观设定" },
  { key: "conflict",    aiKey: "冲突", label: "核心冲突" },
  { key: "act1",        aiKey: "起", label: "起 · 开局" },
  { key: "act2",        aiKey: "承", label: "承 · 发展" },
  { key: "act3",        aiKey: "转", label: "转 · 高潮" },
  { key: "act4",        aiKey: "合", label: "合 · 结局" },
  { key: "subplots",    aiKey: "伏笔", label: "支线与伏笔" },
] as const;

export const CHAPTER_FIELDS = [
  { key: "summary",    aiKey: "梗概", label: "本章梗概" },
  { key: "conflict",   aiKey: "冲突", label: "本章冲突" },
  { key: "hook",       aiKey: "钩子", label: "章末钩子" },
  { key: "characters", aiKey: "人物", label: "出场人物" },
] as const;
```

`aiKey` 用最短的词，降低模型漏写率。注意 `冲突` 在两张表里都出现——不冲突，因为大纲与细纲分别解析，`scanFields` 的 key 集合不同。

### 3.2 总大纲

`buildOutlineMessages`：要求逐行输出 8 个 `aiKey：值`，其中「起承转合」四项各写 2～4 句、「主线」一句话。禁止 markdown 标题与前言。

`parseOutlineDetailFromAi(text) → StudioOutlineDetail | null`：
- `scanFields(text, OUTLINE_FIELDS.map(aiKey))`
- 命中 0 个字段 → 返回 `null`，调用方把整段塞进 `outline` 字符串（即退化为现有行为）
- 命中 ≥1 个 → 返回对象，未命中的字段留 undefined

退化路径保证模型不听话时不至于丢内容——用户自配中转，模型能力不一。

### 3.3 分章细纲

块格式，一章一块：

```
【第1章】
标题：雨夜来客
梗概：…
冲突：…
钩子：…
人物：林晚、沈篁
```

`parseChapterOutlinesFromAi` 改为：
1. 按 `/【\s*第?\s*\d+\s*章?\s*】/` 切块；切出 <2 段则按空行切块
2. 每块 `scanFields(块, ["标题", ...CHAPTER_FIELDS.aiKey])`
3. 有「标题」或至少 2 个其它字段 → 收为一章
4. 0 章 → 退化到现有的 `标题｜摘要` 行解析（原逻辑另存为 `parseLegacyChapterOutlines`）

`index` 仍由收集顺序决定（后端也会重排，见 `validateAndNormalizeAssets`）。

### 3.4 下游

新增 `formatOutline(assets): string`：
- 有 `outlineDetail` 且非全空 → 逐字段 `label：值`（跳过空字段）
- 否则 → `assets.outline || "（无）"`

`buildChapterOutlinesMessages` 与 `buildChapterBodyMessages` 里现有的 `assets.outline || "（无）"` 全部替换为 `formatOutline(assets)`。

`buildChapterBodyMessages` 额外把本章的 `conflict` / `hook` / `characters` 写进 user 内容，并明确要求「本章必须落在章末钩子上」。这是细纲结构化对正文质量最直接的收益。

## 4. UI

### 4.1 `StudioOutlinePanel`

8 个字段依次排列（数量固定，不折叠）。`throughline` 用 `input`（一句话），其余 `textarea`：`setting` / `subplots` 4 行，四幕各 4 行，`conflict` 3 行。

`assets.outline` 非空时，底部追加虚线框「旧大纲（改造前生成，可自行拆到上面各栏）」，可编辑可清空。

生成中不做逐字段流式回填（半截文本解析会闪烁），与立项一致：只在 `onFull` 一次性落地，按钮显示「生成中…」并可停止。

### 4.2 `StudioChaptersPanel`

与 `StudioCharacterPanel` 同构：`<details>` / `<summary>`，收起显示 `第 N 章 · 标题`，右侧删除按钮（`e.preventDefault()` + `stopPropagation()` 拦掉折叠切换）。展开区：标题 `input` + 4 个字段 `textarea`。

`newlyAddedIndex` 控制新增章默认展开——细纲用 index 而非 id（`StudioChapterOutline` 无 id 字段，且后端会重排 index）。

顶部按钮区沿用现有：AI 生成细纲（自动/10 章文案随立项开关）、加一章、保存、生成中的停止。

## 5. 兼容性

| 场景 | 行为 |
|---|---|
| 旧作品大纲 | `outlineDetail` 为空 → 8 字段空，「旧大纲」区显示原文；`formatOutline` 回退用 `outline`，下游行为等同现在 |
| 旧作品细纲 | 3 个新字段空，原 `summary` 仍在「本章梗概」 |
| AI 大纲回散文 | `parseOutlineDetailFromAi` 返回 null → 整段进 `outline`，即现有行为 |
| AI 细纲回 `标题｜摘要` | 退化解析生效，内容进 `summary` |
| AI 回乱码 | 报错，已有内容不变 |
| 只生成 1 章 | `【第1章】` 切分 <2 段 → 空行切块兜底 |

## 6. 测试

`apps/web/src/lib/studioPrompts.test.ts`：

1. 大纲 8 字段全中
2. 大纲带 markdown 星号 / 列表短横 → 正常解析
3. 大纲只命中 2 个字段 → 其余 undefined
4. 大纲整段散文 → 返回 null
5. 细纲块格式 2 章 → 每章 4 字段全中
6. 细纲无【第N章】标记、仅空行分隔 → 仍解析
7. 细纲单章 → 解析出 1 章
8. 细纲旧格式 `标题｜摘要` → 退化，内容进 `summary`
9. 细纲块内字段不足且无标题 → 丢弃该块
10. `formatOutline` 有结构化时用结构化、无时回退 `outline`
11. `buildChapterBodyMessages` 含本章钩子与冲突
12. `buildOutlineMessages` 含 8 个 aiKey

`apps/api/src/services/studioBook.test.ts`：

13. `normalizeAssets` 保留 `outlineDetail` 8 字段
14. `normalizeAssets` 保留细纲 3 字段；非字符串时丢弃

## 7. 不做

- 卷 / 篇的层级（分卷管理是另一个量级的功能）
- 细纲拖拽排序
- AI 把旧 `outline` 拆成 8 字段
- 立项 / 人设 / 正文的 UI 调整
- 多提供商相关任何改动（下一个任务）
