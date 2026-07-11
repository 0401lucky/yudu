import { describe, expect, it } from "vitest";
import { parseEpub } from "./epub";

/** apps/api/fixtures/minimal.epub 的 base64（避免 Workers 类型下依赖 node:fs） */
const MINIMAL_EPUB_B64 =
  "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";

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const MINIMAL_EPUB = fromBase64(MINIMAL_EPUB_B64);

describe("parseEpub", () => {
  it("从 minimal.epub 解出至少 1 章正文", async () => {
    const r = await parseEpub(MINIMAL_EPUB, "minimal.epub");

    expect(r.chapters.length).toBeGreaterThanOrEqual(1);
    expect(r.title).toBe("最小样例书");
    expect(r.author).toBe("测试作者");
    expect(r.chapters[0].title).toMatch(/第一|启程/);
    expect(r.chapters[0].text).toContain("第一章的正文内容");
    expect(r.chapters[0].text).toContain("第二段");
    // HTML / script 不应泄漏
    expect(r.chapters[0].text).not.toContain("<p>");
    expect(r.chapters[0].text).not.toContain("alert");
    expect(r.chapters[0].text).not.toContain("script");
  });

  it("解码基础 HTML 实体", async () => {
    const r = await parseEpub(MINIMAL_EPUB, "minimal.epub");
    // &nbsp; → 空格；&lt; &gt; &amp;
    expect(r.chapters[0].text).toContain("尖括号");
    expect(r.chapters[0].text).toMatch(/<尖括号>/);
    expect(r.chapters[0].text).toContain("&");
    expect(r.chapters[0].text).not.toContain("&nbsp;");
    expect(r.chapters[0].text).not.toContain("&lt;");
  });

  it("提取封面 cover", async () => {
    const r = await parseEpub(MINIMAL_EPUB, "minimal.epub");
    expect(r.cover).toBeDefined();
    expect(r.cover!.contentType).toBe("image/png");
    expect(r.cover!.bytes.byteLength).toBeGreaterThan(0);
    // PNG 魔数
    expect(r.cover!.bytes[0]).toBe(0x89);
    expect(r.cover!.bytes[1]).toBe(0x50);
  });

  it("损坏的 epub 抛出错误", async () => {
    const junk = new TextEncoder().encode("not a zip");
    await expect(parseEpub(junk, "坏.epub")).rejects.toThrow();
  });

  it("有元数据时 title 优先于文件名", async () => {
    const r = await parseEpub(MINIMAL_EPUB, "path/to/备用名.epub");
    expect(r.title).toBe("最小样例书");
    expect(r.title).not.toBe("备用名");
  });
});
