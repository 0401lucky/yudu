import { describe, expect, it } from "vitest";
import {
  parseStudioAssets,
  validateAndNormalizeAssets,
} from "./studioBook";

describe("studioBook assets", () => {
  it("parseStudioAssets 空值返回空模板", () => {
    const a = parseStudioAssets(null);
    expect(a.characters).toEqual([]);
    expect(a.outline).toBe("");
    expect(a.chapterOutlines).toEqual([]);
  });

  it("validateAndNormalizeAssets 重排细纲 index", () => {
    const a = validateAndNormalizeAssets({
      premise: { genre: "都市" },
      characters: [
        { id: "1", name: "甲", role: "主角", description: "成年" },
      ],
      outline: "大纲",
      chapterOutlines: [
        { index: 9, title: "开端", summary: "相遇" },
        { index: 3, title: "发展", summary: "冲突" },
      ],
      updatedAt: 1,
    });
    expect(a.chapterOutlines[0]!.index).toBe(0);
    expect(a.chapterOutlines[1]!.index).toBe(1);
    expect(a.premise.genre).toBe("都市");
    expect(a.updatedAt).toBeGreaterThan(1);
  });

  it("细纲过多抛错", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      index: i,
      title: `第${i}章`,
      summary: "x",
    }));
    expect(() =>
      validateAndNormalizeAssets({
        premise: {},
        characters: [],
        outline: "",
        chapterOutlines: many,
        updatedAt: 0,
      }),
    ).toThrow(/细纲/);
  });
});
