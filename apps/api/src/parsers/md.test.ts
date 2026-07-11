import { describe, expect, it } from "vitest";
import { parseMd } from "./md";

/** fixtures/sample.md */
const SAMPLE_MD = `---
title: 样例书
author: 测试作者
---

# 样例书

开篇说明，**加粗**与*斜体*。

## 第一章 启程

这是第一章的内容。

还有第二段。

## 第二章 转折

这是第二章，含行内 \`code\` 与普通文字。
`;

describe("parseMd", () => {
  it("去掉 front matter，优先用 ## 分章（至少 2 个）", () => {
    const r = parseMd(new TextEncoder().encode(SAMPLE_MD), "sample.md");
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].title).toMatch(/第一|启程/);
    expect(r.chapters[1].title).toMatch(/第二|转折/);
    expect(r.chapters[0].text).toContain("第一章的内容");
    expect(r.chapters[0].text).toContain("第二段");
    // 不应把 # 样例书 当成章节（因为 ## 有至少 2 个）
    expect(r.chapters.every((c) => !c.title.includes("样例书"))).toBe(true);
  });

  it("剥离简单 markdown 标记为纯文本", () => {
    const sample = "## 章\n\n这是**加粗**与*斜体*文字。\n";
    const r = parseMd(new TextEncoder().encode(sample), "a.md");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].text).toContain("加粗");
    expect(r.chapters[0].text).toContain("斜体");
    expect(r.chapters[0].text).not.toContain("**");
    expect(r.chapters[0].text).not.toContain("*斜体*");
  });

  it("仅有 1 个 ## 时改用 # 分章", () => {
    const sample =
      "# 第一部\n\n序章文字\n\n# 第二部\n\n正文\n\n## 仅一节\n\n小节内容\n";
    const r = parseMd(new TextEncoder().encode(sample), "book.md");
    // 只有 1 个 ##，应回退到 #（2 个）
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].title).toMatch(/第一部/);
    expect(r.chapters[1].title).toMatch(/第二部/);
  });

  it("无标题时整篇一章，title=文件名", () => {
    const sample = "没有标题的正文。\n\n第二段。";
    const r = parseMd(new TextEncoder().encode(sample), "随笔.md");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].title).toBe("随笔");
    expect(r.chapters[0].text).toContain("没有标题的正文");
    expect(r.title).toBe("随笔");
    expect(r.author).toBeNull();
  });

  it("去掉 YAML front matter 且不出现在正文", () => {
    const sample = "---\ntitle: T\nauthor: A\n---\n\n正文开头\n";
    const r = parseMd(new TextEncoder().encode(sample), "t.md");
    expect(r.chapters[0].text).toContain("正文开头");
    expect(r.chapters[0].text).not.toContain("author:");
    expect(r.chapters[0].text).not.toMatch(/^---/m);
  });
});
