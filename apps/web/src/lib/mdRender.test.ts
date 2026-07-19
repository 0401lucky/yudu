import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, mdPlainLengthApprox, renderMarkdown } from "./mdRender";

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

  it("表格行计入单元格文字", () => {
    const n = mdPlainLengthApprox("| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan("| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |".length);
  });
});

describe("renderMarkdown", () => {
  it("空内容返回 null", () => {
    expect(renderMarkdown("")).toBeNull();
    expect(renderMarkdown("   ")).toBeNull();
  });

  it("返回带 reader-md 容器的节点", () => {
    const node = renderMarkdown("**加粗** 与表格\n\n| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(node).not.toBeNull();
    // React 元素
    expect(typeof node === "object" && node !== null && "props" in node).toBe(
      true,
    );
  });
});
