import { describe, expect, it } from "vitest";
import { splitTtsChunks, TTS_CHUNK_MAX_CHARS } from "./ttsChunks";

describe("splitTtsChunks", () => {
  it("短段落原样返回单块", () => {
    expect(splitTtsChunks("春眠不觉晓，处处闻啼鸟。")).toEqual([
      "春眠不觉晓，处处闻啼鸟。",
    ]);
  });

  it("空串与纯空白返回空数组", () => {
    expect(splitTtsChunks("")).toEqual([]);
    expect(splitTtsChunks("   \n　\t")).toEqual([]);
  });

  it("长文本按句末标点切分，每块 ≤160 且拼接还原", () => {
    const sentence = "春眠不觉晓处处闻啼鸟夜来风雨声花落知多少。"; // 21 字
    const text = sentence.repeat(20); // 420 字
    const chunks = splitTtsChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TTS_CHUNK_MAX_CHARS);
      expect(c.endsWith("。")).toBe(true); // 切点均落在句末
    }
    expect(chunks.join("")).toBe(text);
  });

  it("无句末标点时回退逗号类切点", () => {
    const text = "一二三四五六七八九十，".repeat(30); // 330 字
    const chunks = splitTtsChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TTS_CHUNK_MAX_CHARS);
      expect(c.endsWith("，")).toBe(true);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("英文混排无标点时按空格切分，不拆单词", () => {
    const text = "hello ".repeat(60).trimEnd(); // 359 字符
    const chunks = splitTtsChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TTS_CHUNK_MAX_CHARS);
      // 每块去空白后应只由完整单词组成
      for (const word of c.trim().split(/\s+/)) {
        expect(word).toBe("hello");
      }
    }
    expect(chunks.join("")).toBe(text);
  });

  it("完全无标点无空白时按 160 硬切", () => {
    const text = "字".repeat(400);
    const chunks = splitTtsChunks(text);
    expect(chunks.map((c) => c.length)).toEqual([160, 160, 80]);
    expect(chunks.join("")).toBe(text);
  });

  it("句末引号等闭合符吸附到前块", () => {
    const text = `${"字".repeat(157)}。”${"后".repeat(100)}`;
    const chunks = splitTtsChunks(text);
    expect(chunks[0].endsWith("。”")).toBe(true);
    expect(chunks[1].startsWith("后")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });
});
