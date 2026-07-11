import { describe, expect, it } from "vitest";
import {
  compareBySequence,
  parseFilenameSeries,
  seriesGroupKey,
} from "./filenameSeries";

describe("parseFilenameSeries", () => {
  it("识别 书名-序号", () => {
    const p = parseFilenameSeries("雨停之前-01.md");
    expect(p.isSequenced).toBe(true);
    expect(p.seriesTitle).toBe("雨停之前");
    expect(p.sequence).toBe(1);
  });

  it("识别 书名_02 与 书名 3", () => {
    expect(parseFilenameSeries("雨停之前_02.md").sequence).toBe(2);
    expect(parseFilenameSeries("测试 03.txt").seriesTitle).toBe("测试");
    expect(parseFilenameSeries("测试 03.txt").sequence).toBe(3);
  });

  it("识别 第N章 后缀", () => {
    const p = parseFilenameSeries("长夜-第04章.md");
    expect(p.seriesTitle).toBe("长夜");
    expect(p.sequence).toBe(4);
  });

  it("无序号则为整名", () => {
    const p = parseFilenameSeries("独立短篇.md");
    expect(p.isSequenced).toBe(false);
    expect(p.seriesTitle).toBe("独立短篇");
    expect(p.sequence).toBeNull();
  });
});

describe("seriesGroupKey", () => {
  it("同书不同章同一 key", () => {
    expect(seriesGroupKey("雨停之前-01.md").key).toBe(
      seriesGroupKey("雨停之前-02.md").key,
    );
    expect(seriesGroupKey("雨停之前-01.md").seriesTitle).toBe("雨停之前");
  });

  it("独立文件各自成组", () => {
    expect(seriesGroupKey("a.md").key).not.toBe(seriesGroupKey("b.md").key);
  });
});

describe("compareBySequence", () => {
  it("按数字排序而非字典序", () => {
    const names = ["书-10.md", "书-2.md", "书-1.md"];
    names.sort(compareBySequence);
    expect(names).toEqual(["书-1.md", "书-2.md", "书-10.md"]);
  });
});
