import { describe, expect, it } from "vitest";
import {
  isSafeHttpUrl,
  parseInline,
  parseMdBlocks,
  mdPlainLengthApprox,
} from "./mdRender";

describe("parseMdBlocks", () => {
  it("解析段落、标题与列表", () => {
    const blocks = parseMdBlocks(
      "开篇\n\n### 小节\n\n- 甲\n- 乙\n\n1. 一\n2. 二\n",
    );
    expect(blocks).toEqual([
      { type: "p", text: "开篇" },
      { type: "h", level: 3, text: "小节" },
      { type: "ul", items: ["甲", "乙"] },
      { type: "ol", items: ["一", "二"] },
    ]);
  });
});

describe("parseInline", () => {
  it("解析粗体斜体代码与链接", () => {
    const tokens = parseInline(
      "这是**加粗**与*斜体*和`code`与[链](https://example.com)。",
    );
    expect(tokens).toContainEqual({ type: "strong", value: "加粗" });
    expect(tokens).toContainEqual({ type: "em", value: "斜体" });
    expect(tokens).toContainEqual({ type: "code", value: "code" });
    expect(tokens).toContainEqual({
      type: "link",
      text: "链",
      href: "https://example.com",
    });
  });
});

describe("isSafeHttpUrl", () => {
  it("仅允许 http(s)", () => {
    expect(isSafeHttpUrl("https://a.com")).toBe(true);
    expect(isSafeHttpUrl("http://a.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });
});

describe("mdPlainLengthApprox", () => {
  it("去掉标记后长度变短", () => {
    expect(mdPlainLengthApprox("**ab**")).toBe(2);
  });
});
