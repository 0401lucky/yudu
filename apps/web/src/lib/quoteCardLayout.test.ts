import { describe, expect, it } from "vitest";
import {
  layoutText,
  QUOTE_MAX_CHARS,
  truncateText,
  truncateToWidth,
  wrapText,
} from "./quoteCardLayout";

/** 单测宽度模型：CJK 记 2 单位，其余字符记 1 单位 */
const measure = (text: string): number => {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
  }
  return w;
};

describe("truncateText", () => {
  it("不超限原样返回", () => {
    expect(truncateText("春眠不觉晓")).toBe("春眠不觉晓");
    expect(truncateText("a".repeat(QUOTE_MAX_CHARS))).toBe(
      "a".repeat(QUOTE_MAX_CHARS),
    );
  });

  it("超过 300 字符截断并加省略号", () => {
    const out = truncateText("清".repeat(301));
    expect(out).toBe(`${"清".repeat(300)}…`);
  });

  it("按码点截断，不劈开代理对", () => {
    const out = truncateText("📚📚📚", 2);
    expect(out).toBe("📚📚…");
  });
});

describe("wrapText", () => {
  it("CJK 文本逐字换行且拼接还原", () => {
    const text = "春眠不觉晓处处闻啼鸟夜来风雨声花落知多少"; // 20 字 × 2 单位
    const lines = wrapText(text, 20, measure); // 每行最多 10 字
    expect(lines).toEqual([
      "春眠不觉晓处处闻啼鸟",
      "夜来风雨声花落知多少",
    ]);
    expect(lines.join("")).toBe(text);
  });

  it("英文按词换行，不拆单词", () => {
    const lines = wrapText("hello world foo", 11, measure);
    expect(lines).toEqual(["hello world", "foo"]);
  });

  it("单个超宽英文词字符级硬断", () => {
    const lines = wrapText("abcdefghij", 4, measure);
    expect(lines).toEqual(["abcd", "efgh", "ij"]);
  });

  it("保留原文换行与段间空行，丢弃尾部空行", () => {
    const lines = wrapText("第一段\n\n第二段\n", 100, measure);
    expect(lines).toEqual(["第一段", "", "第二段"]);
  });

  it("中西混排：CJK 可断而西文词整体挪行", () => {
    // 每行 12 单位：「读Alice」=2+5=7，追加「 in」超限后 in 挪行
    const lines = wrapText("读Alice in Wonderland有感", 12, measure);
    for (const line of lines) {
      expect(measure(line)).toBeLessThanOrEqual(12);
    }
    // 单词未被拆开（Wonderland 完整出现在某一行内）
    expect(lines.some((line) => line.includes("Wonderland"))).toBe(true);
  });

  it("空文本与纯空白返回空数组", () => {
    expect(wrapText("", 10, measure)).toEqual([]);
    expect(wrapText("   \n  ", 10, measure)).toEqual([]);
  });
});

describe("truncateToWidth", () => {
  it("放得下原样返回", () => {
    expect(truncateToWidth("书名", 10, measure)).toBe("书名");
  });

  it("放不下逐字回退并补省略号", () => {
    const out = truncateToWidth("很长很长的一个书名", 8, measure);
    expect(measure(out)).toBeLessThanOrEqual(8);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("layoutText", () => {
  it("总高 = 行数 × 行高", () => {
    const { lines, totalHeight } = layoutText("春眠不觉晓处处闻啼鸟夜来风雨声", {
      maxWidth: 20,
      lineHeight: 54,
      measure,
    });
    expect(lines.length).toBe(2);
    expect(totalHeight).toBe(108);
  });

  it("maxChars 生效：先截断再换行", () => {
    const { lines } = layoutText("清".repeat(400), {
      maxWidth: 1000,
      lineHeight: 54,
      measure,
      maxChars: QUOTE_MAX_CHARS,
    });
    expect(lines.join("")).toBe(`${"清".repeat(300)}…`);
  });

  it("空文本零高", () => {
    const { lines, totalHeight } = layoutText("", {
      maxWidth: 20,
      lineHeight: 54,
      measure,
    });
    expect(lines).toEqual([]);
    expect(totalHeight).toBe(0);
  });
});
