### Task 6: TXT / MD 解析器（TDD）

**Files:**
- Create: `apps/api/src/parsers/types.ts`
- Create: `apps/api/src/parsers/txt.ts`, `txt.test.ts`
- Create: `apps/api/src/parsers/md.ts`, `md.test.ts`
- Create: `apps/api/fixtures/sample.txt`, `sample.md`

**Interfaces:**
```ts
// parsers/types.ts
export interface ParsedChapter {
  title: string;
  text: string; // 纯文本，段落用 \n\n
}
export interface ParseResult {
  title: string;
  author: string | null;
  chapters: ParsedChapter[];
}
export function parseTxt(bytes: Uint8Array, filename: string): ParseResult;
export function parseMd(bytes: Uint8Array, filename: string): ParseResult;
```

- [ ] **Step 1: 写 txt 测试（先失败）**

Fixture 含两章：`第一章 开端\n\n正文甲\n\n第二章 继续\n\n正文乙`  
及 GBK 编码样例（可用预置二进制或跳过若生成困难——至少 UTF-8 两章 + 无标题整本一章）。

```ts
it("按「第×章」分章", () => {
  const r = parseTxt(new TextEncoder().encode(sample), "书.txt");
  expect(r.chapters).toHaveLength(2);
  expect(r.chapters[0].title).toMatch(/第一/);
});
```

- [ ] **Step 2: 实现 parseTxt**

编码：TextDecoder utf-8 fatal → 失败则用 `TextDecoder('gbk')`（nodejs_compat）或第三方；再失败 throw。

- [ ] **Step 3: 写 md 测试并实现**

- 去掉 `---` front matter  
- 以 `## ` 或 `# ` 分章：规则固定为 **优先用 `## ` 若存在至少 2 个，否则用 `# `**；若都没有，整篇一章，title=文件名  
- 剥离简单 markdown 标记为纯文本（`**` `*` `#` 行内）

- [ ] **Step 4: 测试通过后 Commit**

```bash
pnpm --filter @yudu/api test
git commit -am "feat(api): txt 与 md 解析器"
```

---

