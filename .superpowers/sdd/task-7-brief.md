### Task 7: EPUB 解析器（TDD）

**Files:**
- Create: `apps/api/src/parsers/epub.ts`, `epub.test.ts`
- Create: `apps/api/fixtures/minimal.epub`（手写最小 ZIP：mimetype、container.xml、content.opf、一章 xhtml）
- Modify: `apps/api/package.json` 增加 `fflate` 或 `jszip`（选 **fflate** 更轻）

**Interfaces:**
- `parseEpub(bytes: Uint8Array, filename: string): Promise<ParseResult>`
- 可选返回 `coverBytes?: Uint8Array` 与 mime（扩展 ParseResult 或并行返回类型 `ParseResult & { cover?: { bytes: Uint8Array; contentType: string } }`）

- [ ] **Step 1: 生成 minimal.epub fixture 并写测试期望 chapters≥1**

- [ ] **Step 2: 实现：解压 → container → opf spine → 提文本**

HTML 去标签策略：`replace(/<script[\s\S]*?<\/script>/gi,"")` 等，再 `replace(/<[^>]+>/g,"")`，`&nbsp;` 等基础实体解码。

- [ ] **Step 3: 测试 PASS + Commit**

```bash
git commit -am "feat(api): epub 解析器"
```

---

