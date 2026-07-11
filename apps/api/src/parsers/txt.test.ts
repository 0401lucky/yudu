import { describe, expect, it } from "vitest";
import { parseTxt } from "./txt";

/** fixtures/sample.txt */
const SAMPLE_TXT = "第一章 开端\n\n正文甲\n\n第二章 继续\n\n正文乙\n";

/**
 * fixtures/sample-gbk.txt（Python gbk 编码的同上内容）
 * hex: b5dad2bbd5c220bfaab6cb0a0ad5fdcec4bcd70a0ab5dab6fed5c220bcccd0f80a0ad5fdcec4d2d2
 */
const SAMPLE_GBK = Uint8Array.from(
  "b5dad2bbd5c220bfaab6cb0a0ad5fdcec4bcd70a0ab5dab6fed5c220bcccd0f80a0ad5fdcec4d2d2".match(
    /../g,
  )!.map((h) => parseInt(h, 16)),
);

describe("parseTxt", () => {
  it("按「第×章」分章", () => {
    const r = parseTxt(new TextEncoder().encode(SAMPLE_TXT), "书.txt");
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].title).toMatch(/第一/);
    expect(r.chapters[0].text).toContain("正文甲");
    expect(r.chapters[1].title).toMatch(/第二/);
    expect(r.chapters[1].text).toContain("正文乙");
    expect(r.title).toBe("书");
    expect(r.author).toBeNull();
  });

  it("无章节标题时整本作为一章，标题用文件名", () => {
    const sample = "这是没有章节标记的整本小说。\n\n第二段内容。";
    const r = parseTxt(new TextEncoder().encode(sample), "无名之作.txt");
    expect(r.chapters).toHaveLength(1);
    expect(r.chapters[0].title).toBe("无名之作");
    expect(r.chapters[0].text).toContain("没有章节标记");
    expect(r.chapters[0].text).toContain("第二段内容");
    expect(r.title).toBe("无名之作");
  });

  it("支持 Chapter N 分章", () => {
    const sample = "Chapter 1 Start\n\nHello\n\nChapter 2 Next\n\nWorld";
    const r = parseTxt(new TextEncoder().encode(sample), "en.txt");
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].title).toMatch(/Chapter 1/i);
    expect(r.chapters[1].text).toContain("World");
  });

  it("解码 GBK 中文网文", () => {
    const r = parseTxt(SAMPLE_GBK, "gbk书.txt");
    expect(r.chapters).toHaveLength(2);
    expect(r.chapters[0].title).toMatch(/第一/);
    expect(r.chapters[0].text).toContain("正文甲");
  });

  it("非法编码抛出错误", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd]);
    expect(() => parseTxt(bytes, "坏.txt")).toThrow();
  });
});
