import { describe, expect, it } from "vitest";
import {
  pageIndexForOffset,
  paginateText,
  type PageMetrics,
} from "./pagination";

const metrics: PageMetrics = {
  width: 320,
  height: 480,
  fontSize: 18,
  lineHeight: 1.75,
  fontFamily: "serif",
  paragraphGap: 12,
};

describe("paginateText", () => {
  it("空文本一页", () => {
    expect(paginateText("", metrics)).toEqual([0]);
  });

  it("长文本多页且 offset 映射稳定", () => {
    const text = "测".repeat(5000);
    const starts = paginateText(text, metrics);
    expect(starts.length).toBeGreaterThan(3);
    expect(starts[0]).toBe(0);
    expect(pageIndexForOffset(starts, starts[2]!)).toBe(2);
    // 页起点单调递增
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
    }
  });

  it("短文本单页", () => {
    const starts = paginateText("你好世界", metrics);
    expect(starts).toEqual([0]);
  });
});
