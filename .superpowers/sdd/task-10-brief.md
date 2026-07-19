### Task 10: 前端分页算法（TDD）

**Files:**
- Create: `apps/web/src/lib/pagination.ts`
- Create: `apps/web/src/lib/pagination.test.ts`
- Modify: `apps/web/package.json` 确保 vitest + jsdom/happy-dom

**Interfaces:**
```ts
export interface PageMetrics {
  width: number;      // 内容区 css px
  height: number;
  fontSize: number;
  lineHeight: number; // 倍数
  fontFamily: string;
  paragraphGap: number;
}

/** 返回每页起始 char offset（最后隐式到 text.length） */
export function paginateText(text: string, metrics: PageMetrics): number[];

/** 给定 offset 找页码 0-based */
export function pageIndexForOffset(pageStarts: number[], offset: number): number;
```

- [ ] **Step 1: 写测试**

因 Node 无真实布局，**分页实现采用「估算模型」而非 DOM 测量**（规格允许客户端分页；为可测与 Workers 无关，用 canvas 或纯逻辑）：

**锁定实现策略（可测、稳定）：**
- 使用固定字符宽度近似：中文宽 ≈ `fontSize`，ASCII ≈ `fontSize * 0.55`
- 行高 `fontSize * lineHeight`
- 按段落 `\n\n` 分割，段内按字符累加宽换行
- 填满 `height` 则新页  
此策略在 UI 用同一函数，保证测试与运行一致。若后续要 DOM 精测，可替换实现但保留接口。

测试：
```ts
it("空文本一页", () => {
  expect(paginateText("", metrics)).toEqual([0]);
});
it("长文本多页且 offset 映射稳定", () => {
  const text = "测".repeat(5000);
  const starts = paginateText(text, { width: 320, height: 480, fontSize: 18, lineHeight: 1.75, fontFamily: "serif", paragraphGap: 12 });
  expect(starts.length).toBeGreaterThan(3);
  expect(pageIndexForOffset(starts, starts[2])).toBe(2);
});
```

- [ ] **Step 2: 实现并 PASS**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(web): 可测试的左右翻页分页算法"
```

---

