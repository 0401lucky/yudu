# 技术设计：人设改为结构化角色卡

## 1. 改动边界

| 层 | 文件 | 改动 |
|---|---|---|
| 类型 | `packages/shared/src/types.ts` | `StudioCharacter` 加 8 个可选字段 |
| 后端 | `apps/api/src/services/studioBook.ts` | `normalizeAssets` 白名单补 8 项 |
| 提示词 | `apps/web/src/lib/studioPrompts.ts` | 改 `buildCharactersMessages` / `parseCharactersFromAi` / `formatCharacters` |
| UI | `apps/web/src/components/StudioCharacterPanel.tsx`（新建） | 折叠角色卡 |
| UI | `apps/web/src/pages/StudioWorkPage.tsx` | 删内联人设段，接线新面板 |

不动：立项面板、DB schema、路由、`aiClient`。

## 2. 数据契约

```ts
export interface StudioCharacter {
  id: string;
  name: string;
  /** 故事定位：主角 / 反派 / 导师…（语义收敛，界面标签同步） */
  role: string;
  /** 旧版单段描述。历史数据在此，新生成不再写入 */
  description: string;
  /** 年龄、社会身份、职业出身 */
  ageIdentity?: string;
  /** 外貌与第一印象 */
  appearance?: string;
  /** 性格底色与矛盾面 */
  personality?: string;
  /** 出场前的关键经历 */
  background?: string;
  /** 想要什么、为什么、愿意付出什么 */
  motivation?: string;
  /** 弱点、怕什么、会在哪里失控 */
  flaw?: string;
  /** 语气、口头禅、话多话少 */
  speech?: string;
  /** 与其他角色的关系与张力 */
  relations?: string;
}
```

**为什么保留 `description` 而不迁移**：旧数据全在这个字段里，且它是必填（非可选）。改成可选或删掉都要写迁移分支处理 D1 里已有的 JSON。保留后旧数据零处理，新生成的角色 `description` 为空串。UI 上只在它非空时显示「旧描述」区，不会给新角色添乱。

**为什么 `role` 语义收敛而不改名**：改名要动 `normalizeAssets`、旧数据、UI 三处；而旧值（如「反派他妈」「主角」）本来就混着写，语义收敛后无论旧值是哪种都还能读通。只改界面标签与 placeholder，零迁移风险。

后端白名单补 8 行 `if (typeof c.X === "string") ...`，与现有 `name` / `role` / `description` 同一模式。

## 3. AI 输出格式

一个角色一块，块首 `【角色N】`，块内一行一个字段：

```
【角色1】
姓名：林晚
定位：主角
年龄身份：32 岁，侯府主母；穿书前是三甲医院急诊科护士
外貌：…
性格：…
背景：…
动机：…
软肋：…
口吻：…
关系：…

【角色2】
…
```

字段名选短词（`年龄身份` / `软肋` / `口吻`）而非界面标签全称，降低模型漏写与写错的概率。

`buildCharactersMessages` 的 user 内容要点：
- 3～6 个角色，角色之间性格与目标要有差异和张力
- 每个维度都要具体可感，禁止「善良勇敢」这类空泛标签；用能拍出来的细节
- 破限时沿用现有分支文案（性张力、成年人前提）
- 严格按上述块格式，禁止 markdown 标题与前言
- 复用现有 `baseSystem(breakLimit)` / `withUserPin(breakLimit, …)`

## 4. 解析器

立项那次已有一个「逐行扫 `字段名：值`」的实现（`scanPremiseFields`）。这次抽成通用的：

```ts
/** 扫描一段文本里的「字段名：值」行；同名取第一次 */
function scanFields(text: string, keys: readonly string[]): Map<string, string>
```

`scanPremiseFields` 改为调用它，保持既有行为与测试不变。

```
parseCharactersFromAi(text):
  1. 按 /【\s*角色\s*\d*\s*】/ 切块；若切出 <2 段，改按连续空行 /\n\s*\n/ 切块
  2. 每块 scanFields(块, [姓名,定位,年龄身份,外貌,性格,背景,动机,软肋,口吻,关系])
  3. 块内有「姓名」或至少 2 个其它字段 → 收为一个角色；否则丢弃该块
  4. 角色数为 0 → 退化：走旧的按行「｜」切分（原逻辑原样保留为 parseLegacyCharacters）
```

退化路径保证模型回旧格式时不至于全盘失败——这是真实风险，用户自配的中转模型能力不一。

字段名的中文键 → 结构字段映射集中在一张常量表里，解析与提示词共用，避免两处漂移。

## 5. `formatCharacters` 扩展

当前输出 `N. 姓名（role）：description`，单行。改为每个角色一小段，逐维度列出非空项：

```
1. 林晚｜主角
   年龄身份：…
   外貌：…
   动机：…
   软肋：…
   （空字段跳过）
```

旧数据只有 `description` 时，输出 `描述：{description}`，与现在等价。空人设时的兜底文案不变。

这直接提升总大纲、细纲、正文三步的输入质量。

## 6. UI

### 6.1 组件

`StudioCharacterPanel.tsx`，与 `StudioPremisePanel` 对称：纯受控，不发请求。

```tsx
interface Props {
  characters: StudioCharacter[];
  saving: boolean;
  generating: boolean;
  onChange(i: number, patch: Partial<StudioCharacter>): void;
  onAdd(): void;
  onRemove(i: number): void;
  onGenerate(): void;
  onSave(): void;
  onStop(): void;
}
```

顺带补一个当前缺失的能力：**删除单个角色**。现在只能加不能删，AI 生成 6 个想删 2 个只能清空描述。这属于「改这块时顺手补齐的明显缺口」，代价一个按钮。

### 6.2 折叠实现

用原生 `<details>` / `<summary>`：零状态管理、原生键盘无障碍、代码最少。

- `<summary>`：`姓名 · 故事定位`（姓名为空显示「未命名角色」），右侧删除按钮
- 默认收起。新增角色时需要默认展开 → `open` 受控于「该角色是否是刚新增的」，用一个 `newlyAddedId` state 判断，避免给全部卡片上状态

### 6.3 字段布局

展开区每字段一行：标签（`text-xs text-[var(--text-muted)]`）+ `textarea`。行数按内容量给：`ageIdentity` / `speech` 2 行，其余 3 行，`background` / `relations` 4 行。

`description` 非空时，在最后追加一块标注「旧描述（改造前生成）」的 textarea，可编辑可清空。

## 7. 兼容性

| 场景 | 行为 |
|---|---|
| 旧作品人设 | 8 个新字段空；`description` 有值 → 展开区显示「旧描述」块 |
| AI 回旧格式 | 退化解析生效，内容进 `description`，行为等同改造前 |
| AI 回乱码/散文 | 报「未能解析人设」，已有人设不变 |
| AI 漏写某维度 | 该字段为空，不影响其它字段 |
| 只有 1 个角色块 | `【角色1】` 切分 <2 段 → 走空行切分兜底 |

## 8. 测试

`apps/web/src/lib/studioPrompts.test.ts`：

1. 新块格式 2 个角色 → 角色数 2，8 维度全中
2. `【角色1】` 缺失、仅空行分隔 → 仍能解析
3. 单个角色（只有一块）→ 解析出 1 个
4. 旧格式 `姓名｜身份｜描述` → 退化解析，内容进 `description`
5. 某角色漏写「动机」→ 该字段 undefined，其余正常
6. 整段散文 → 返回空数组
7. 块内只有一个「外貌」字段无姓名 → 该块被丢弃
8. `formatCharacters` 经 `buildChapterBodyMessages` 验证动机 / 软肋 / 口吻出现在 user 内容里
9. `formatCharacters` 对只有 `description` 的旧角色输出「描述：」
10. `buildCharactersMessages` 含 8 个字段名与「禁止空泛标签」的要求

`apps/api/src/services/studioBook.test.ts`：

11. `normalizeAssets` 保留 8 个新字段
12. 新字段为非字符串时丢弃，`name` / `role` / `description` 仍归一化

命令：`pnpm -r typecheck && pnpm -r test && pnpm --filter @yudu/web build`

## 9. 不做

- AI 把旧 `description` 拆分成各字段
- 成长弧线、标志物件字段
- 角色排序 / 拖拽
- 立项、大纲、细纲、正文的 UI 调整
