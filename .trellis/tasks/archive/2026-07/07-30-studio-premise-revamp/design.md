# 技术设计：优化创作台立项流程

## 1. 改动边界

四层，自下而上：

| 层 | 文件 | 改动性质 |
|---|---|---|
| 类型 | `packages/shared/src/types.ts` | `StudioPremise` 扩 3 个可选字段 |
| 后端 | `apps/api/src/services/studioBook.ts` | `normalizeAssets` 白名单补 3 项 |
| 提示词 | `apps/web/src/lib/studioPrompts.ts` | 新增 2 组 build/parse，改 `formatPremise` |
| 预置数据 | `apps/web/src/lib/studioPresets.ts`（新建） | 纯常量表 |
| UI | `apps/web/src/components/StudioPremisePanel.tsx`（新建） | 立项面板 |
| UI | `apps/web/src/pages/StudioWorkPage.tsx` | 删掉内联立项段，接线新面板 |

不动：`StudioListPage.tsx`、`aiClient.ts`、`api.ts`、路由、DB schema。

## 2. 数据契约

### 2.1 `StudioPremise` 扩展

```ts
export interface StudioPremise {
  /** 用户口述的故事想法，AI 立项的主输入 */
  idea?: string;
  /** 题材大类；多选值以「｜」拼接，如「穿书｜古言」 */
  genre?: string;
  /** 整体情绪基调；多选值以「｜」拼接 */
  tone?: string;
  /** 目标篇幅；单值 */
  targetLength?: string;
  /** 一句话卖点/简介，AI 立项产出 */
  logline?: string;
  /** 额外硬性要求（UI 文案「额外要求」，历史字段名保留） */
  notes?: string;
  /** 细纲生成时让 AI 自行决定章数；缺省视为 true */
  autoChapterCount?: boolean;
}
```

**为什么 genre/tone 用「｜」拼接的 string 而不是 `string[]`**：
避免改动 DB 中已有 `studio_assets` JSON 的字段类型。老数据里 `genre` 是字符串，若改成数组，后端 `normalizeAssets` 需要写迁移分支，前端也要处理两种形态。用「｜」拼接后，老数据天然是「只有一个标签」的合法值，零迁移。「｜」是本仓库既有的分隔约定（见 `parseCharactersFromAi`、`parseChapterOutlinesFromAi`）。

**为什么 `autoChapterCount` 缺省视为 true**：与改造前的组件初值 `useState(true)` 一致，老作品打开后行为不变。

### 2.2 后端白名单

`normalizeAssets`（`studioBook.ts:95-102`）逐字段判类型后才写入，未列出的字段会被静默丢弃。补三行：

```ts
if (typeof p.idea === "string") premise.idea = p.idea;
if (typeof p.logline === "string") premise.logline = p.logline;
if (typeof p.autoChapterCount === "boolean")
  premise.autoChapterCount = p.autoChapterCount;
```

非法类型（如 `autoChapterCount: "yes"`）走已有的「不写入 → 保持 undefined」路径，前端读到 undefined 时按缺省值处理。

`validateAndNormalizeAssets` 的长度上限检查不涉及 premise，无需改动；`idea` / `logline` 不加长度上限（与既有 `notes` 一致，整体 assets 由 D1 行大小自然兜底）。

## 3. 提示词层

### 3.1 输出格式

不用 JSON。理由：本项目走用户自配的中转 API，模型不确定，JSON mode 不可依赖；而仓库已有「纯文本 + ｜分隔」的成功先例（人设、细纲），解析器容错成本低。

要求 AI 严格回：

```
书名：满级反派他妈｜我儿是天煞孤星｜慈母多败儿
类型：穿书｜古言
基调：轻松搞笑｜甜宠
篇幅：中篇（约 30 万字）
卖点：她只想苟活，儿子却要造反。
```

### 3.2 新增函数

```ts
/** AI 一次生成整套立项方案 */
export function buildPremiseMessages(
  breakLimit: boolean,
  idea: string,
): ChatMessage[];

/** 仅重新生成 3 个书名候选 */
export function buildTitlesMessages(
  breakLimit: boolean,
  idea: string,
  premise: StudioPremise,
): ChatMessage[];

export interface ParsedPremise {
  titles: string[];
  genre?: string;
  tone?: string;
  targetLength?: string;
  logline?: string;
}

export function parsePremiseFromAi(text: string): ParsedPremise;
export function parseTitlesFromAi(text: string): string[];
```

`buildPremiseMessages` 的 user 内容要点：
- 给出用户的故事想法原文；想法为空时要求 AI 自主发挥一个有意思的选题
- 列出可选的类型 / 基调 / 篇幅词表（复用 `studioPresets` 的表，作为**建议范围**而非硬约束，允许 AI 给表外词）
- 书名要求：中文网文风格，3 个风格各异（直白爽感 / 悬念 / 反差），不带书名号，不解释
- 严格声明只输出上述 5 行，禁止前言与 markdown
- 复用已有的 `baseSystem(breakLimit)` 与 `withUserPin(breakLimit, …)`

### 3.3 解析器

```
逐行扫描，对每行尝试匹配 /^\**\s*(书名|类型|基调|篇幅|目标篇幅|卖点|一句话)\**\s*[：:]\s*(.+)$/
命中后取值：
  - 书名  → split(/[｜|、]/) → 去书名号《》→ trim → 去空 → 取前 3
  - 类型/基调 → split(/[｜|、,，]/) → trim → 去空 → 用「｜」重新 join
  - 篇幅  → 整段 trim
  - 卖点  → 整段 trim
未命中任何行 → 返回 { titles: [] }，由调用方报「未能解析立项方案」
```

- 兼容 `**书名**：` / `- 书名:` 前缀（先剥 `^[-*\s]+`）
- 同一 key 出现多次取第一次
- `parseTitlesFromAi` = 复用同一扫描器取 `titles`；若整段无「书名：」前缀，则退化为「按行/按｜切分，每行当一个书名」，容忍模型直接甩三行名字

### 3.4 `formatPremise` 扩展

当前只输出 genre/tone/targetLength/notes。改为：

```
故事想法：{idea}
一句话：{logline}
类型：{genre}
基调：{tone}
目标篇幅：{targetLength}
额外要求：{notes}
```

全为空时仍返回「（无额外立项说明）」。这样人设、总大纲、细纲、正文四步都会吃到用户的原始想法与卖点——这是本次的实质增益，四个下游 build 函数本身不用改。

## 4. 预置词表 `studioPresets.ts`

纯常量模块，无逻辑：

```ts
/** 题材大类；多选 */
export const GENRE_PRESETS: string[]
/** 情绪基调；多选 */
export const TONE_PRESETS: string[]
/** 目标篇幅；单选。值同时是给 AI 的篇幅描述 */
export const LENGTH_PRESETS: string[]
/** 灵感示例：label 上标签，text 填入输入框的完整句子 */
export const IDEA_SAMPLES: { label: string; text: string }[]
```

放 `lib/` 而非组件内：便于 `buildPremiseMessages` 引用同一份词表，保证「界面上能点的」和「告诉 AI 的」一致。

## 5. UI 层

### 5.1 组件拆分

`StudioWorkPage.tsx` 当前 957 行，立项段（`:558-628`）改造后会膨胀到 ~250 行。抽出：

```tsx
// components/StudioPremisePanel.tsx
interface Props {
  title: string;
  breakLimit: boolean;
  premise: StudioPremise;          // 受控草稿，父页持有
  titleCandidates: string[];       // AI 产出的书名候选
  saving: boolean;
  generating: boolean;
  onTitleChange(v: string): void;
  onBreakLimitChange(v: boolean): boolean;  // 返回 false 表示被 18+ 确认拦下
  onPremiseChange(patch: Partial<StudioPremise>): void;
  onAiPremise(): void;   // 「AI 帮我立项」
  onAiTitles(): void;    // 「换一批书名」
  onStop(): void;
  onSave(): void;
}
```

面板**不发网络请求、不读 AI 设置**，只渲染与回调。生成/保存/流式全部留在 `StudioWorkPage`，复用已有的 `runStream`。

### 5.2 父页状态调整

立项草稿目前散成 5 个 `useState`（`title` / `genre` / `tone` / `targetLength` / `notes`）+ 游离的 `autoChapterCount`。合并为：

```ts
const [title, setTitle] = useState("");
const [breakLimit, setBreakLimit] = useState(false);
const [premiseDraft, setPremiseDraft] = useState<StudioPremise>({});
const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
```

`load()` 里从 `d.assets.premise` 整体赋值；`savePremise()` 里 trim 后写回。`autoChapterCount` 的读取点（`genChapterOutlines`）改为 `premiseDraft.autoChapterCount ?? true`，「分章细纲」步骤按钮的文案同源。

`titleCandidates` 不持久化——它是一次生成的临时结果，刷新丢失可接受。

### 5.3 AI 立项的回填策略

```
onAiPremise:
  runStream(buildPremiseMessages(breakLimit, premiseDraft.idea ?? ""), onFull)
  onFull(text):
    const p = parsePremiseFromAi(text)
    若 p 五项全空 → setError("未能解析立项方案，请重试或手动填写")，不改任何字段
    否则逐项「有值才覆盖」：
      p.titles[0] 存在 → setTitle(p.titles[0])；setTitleCandidates(p.titles)
      p.genre / p.tone / p.targetLength / p.logline 各自非空才写入 premiseDraft
    不自动保存——用户看过再点「保存立项」
```

流式过程中不做局部回填（半截文本解析出的字段会闪烁），只在 `onFull` 一次性落地；生成期间按钮显示「立项中…」并可「停止」。

`onAiTitles` 同理，只 `setTitle` + `setTitleCandidates`。

### 5.4 标签控件

面板内定义两个局部小组件（不外提，只此处用）：

- `TagPicker`：多选。`value: string`（「｜」拼接）→ 内部 split 成 Set 比对高亮；点击 toggle 后 join 回传。末尾一个「＋自定义」按钮，点开一个 input，回车/失焦后把词并入 value（去重）。AI 给出的表外词会作为「已选中但不在预置表里」的额外 chip 渲染在预置项之后，不会丢失。
- `TagRadio`：单选。点击选中即替换，再点一次取消。

两者视觉沿用现有 token：未选 `border-[var(--border)] text-[var(--text-muted)]`，选中 `bg-[var(--accent)] text-[var(--bg)]`，与顶部步骤条一致。

### 5.5 布局

```
卡片一 · 灵感区
  标题「你想看一个什么样的故事？」+ 副标题「随便说，AI 会帮你补全下面所有字段」
  textarea rows=4，placeholder 为完整示例句
  「没头绪？试试：」+ IDEA_SAMPLES chips（点击填入 textarea）
  主按钮「AI 帮我立项」/ 生成中「立项中…」+「停止」

卡片二 · 立项字段
  书名 input +（有候选时）候选 chips +「⟳ 换一批书名」
  破限模式 checkbox（原样保留）
  类型  TagPicker + 说明「题材大类，决定世界观与读者预期」
  基调  TagPicker + 说明「整体情绪，决定读起来是什么感觉」
  篇幅  TagRadio  + 说明「影响分章数量与每章密度」
  一句话卖点 input
  额外要求 textarea + placeholder「例：主角必须叫林晚；别写重生梗；用第一人称」
  ☑ 让 AI 自行决定分章数
  [保存立项]
```

## 6. 兼容性

| 场景 | 行为 |
|---|---|
| 改造前创建的作品 | `idea`/`logline`/`autoChapterCount` 为 undefined；输入框空、开关默认勾选；genre「都市」渲染为一个选中 chip（若不在预置表则作为额外 chip） |
| AI 返回表外的类型词 | 作为额外 chip 渲染并保留，不丢弃 |
| 未配置 API | 字段可填可存；点 AI 按钮触发现有 `requireAi()` 错误提示 |
| AI 输出完全不符格式 | 报「未能解析立项方案」，所有字段保持原值 |
| 旧版前端读到新字段 | 不适用（前后端同版本部署） |

## 7. 测试

`apps/web/src/lib/studioPrompts.test.ts` 追加 `describe("立项解析")`：

1. 标准五行格式 → 五项全中，titles 长度 3
2. `**书名**：` / `- 类型:` 带 markdown 与短横 → 正常解析
3. 只有「书名」一行 → titles 有值，其余 undefined
4. 书名只给 1 个 → titles 长度 1，不报错
5. 书名带《》→ 书名号被剥掉
6. 整段散文无任何 key → `titles` 为空数组，其余 undefined
7. `parseTitlesFromAi` 对「三行裸书名」的退化解析
8. `buildPremiseMessages` 破限时 system 走破限分支、user 含用户想法原文
9. `formatPremise` 经由 `buildOutlineMessages` 验证 idea/logline 出现在 user 内容里

`apps/api/src/services/studioBook.test.ts` 追加：

10. `validateAndNormalizeAssets` 保留 `idea` / `logline` / `autoChapterCount`
11. `autoChapterCount: "yes"`（非布尔）被丢弃为 undefined

命令：`pnpm -r typecheck && pnpm -r test`

## 8. 不做

- 新建作品向导弹窗
- `genre`/`tone` 改数组类型
- 人设 / 大纲 / 细纲 / 正文 四步的 UI 调整
- 破限提示词内容调整
- `idea` / `logline` 的长度上限校验
