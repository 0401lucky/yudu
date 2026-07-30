import { describe, expect, it } from "vitest";
import {
  buildChapterBodyMessages,
  buildOutlineMessages,
  buildPremiseMessages,
  getBreakLimitSystemPromptForPreview,
  parsePremiseFromAi,
  parseTitlesFromAi,
} from "./studioPrompts";
import { emptyStudioAssets } from "@yudu/shared";

describe("破限提示词", () => {
  it("system 含成年许可与文风约束", () => {
    const s = getBreakLimitSystemPromptForPreview();
    expect(s).toMatch(/破限|18\+|成年/);
    expect(s).toMatch(/文风/);
    expect(s).toMatch(/粗口|暴躁/);
    expect(s).toMatch(/未成年/);
    expect(s).toMatch(/Gemini|创意写作/);
  });

  it("正文 user 在破限下带文风钉", () => {
    const msgs = buildChapterBodyMessages(
      true,
      "测试",
      emptyStudioAssets(),
      { index: 0, title: "第一章", summary: "相遇" },
      0,
    );
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.content).toMatch(/细腻|粗口|暴躁/);
    expect(msgs[1]!.content).toMatch(/破限/);
  });
});

describe("立项解析", () => {
  const STANDARD = [
    "书名：满级反派他妈｜我儿是天煞孤星｜慈母多败儿",
    "类型：穿书｜古言",
    "基调：轻松搞笑｜甜宠",
    "篇幅：中篇（约 30 万字）",
    "卖点：她只想苟活，儿子却要造反。",
  ].join("\n");

  it("标准格式五项全中", () => {
    const p = parsePremiseFromAi(STANDARD);
    expect(p.titles).toEqual(["满级反派他妈", "我儿是天煞孤星", "慈母多败儿"]);
    expect(p.genre).toBe("穿书｜古言");
    expect(p.tone).toBe("轻松搞笑｜甜宠");
    expect(p.targetLength).toBe("中篇（约 30 万字）");
    expect(p.logline).toBe("她只想苟活，儿子却要造反。");
  });

  it("容忍 markdown 星号与列表短横", () => {
    const p = parsePremiseFromAi(
      ["**书名**：甲｜乙｜丙", "- 类型: 都市", "* 篇幅：短篇（约 5 万字）"].join(
        "\n",
      ),
    );
    expect(p.titles).toEqual(["甲", "乙", "丙"]);
    expect(p.genre).toBe("都市");
    expect(p.targetLength).toBe("短篇（约 5 万字）");
  });

  it("字段缺失时其余为 undefined", () => {
    const p = parsePremiseFromAi("书名：只有名字");
    expect(p.titles).toEqual(["只有名字"]);
    expect(p.genre).toBeUndefined();
    expect(p.tone).toBeUndefined();
    expect(p.targetLength).toBeUndefined();
    expect(p.logline).toBeUndefined();
  });

  it("书名带书名号时剥掉", () => {
    const p = parsePremiseFromAi("书名：《满级反派他妈》｜《慈母多败儿》");
    expect(p.titles).toEqual(["满级反派他妈", "慈母多败儿"]);
  });

  it("书名超过 3 个只取前 3", () => {
    const p = parsePremiseFromAi("书名：一｜二｜三｜四｜五");
    expect(p.titles).toEqual(["一", "二", "三"]);
  });

  it("目标篇幅 / 一句话 作为别名被识别", () => {
    const p = parsePremiseFromAi(
      ["目标篇幅：长篇（100 万字以上）", "一句话：他回来了。"].join("\n"),
    );
    expect(p.targetLength).toBe("长篇（100 万字以上）");
    expect(p.logline).toBe("他回来了。");
  });

  it("整段散文无任何字段时返回空结果", () => {
    const p = parsePremiseFromAi("好的，这是一个很棒的想法，我建议你从主角的童年写起。");
    expect(p.titles).toEqual([]);
    expect(p.genre).toBeUndefined();
    expect(p.logline).toBeUndefined();
  });

  it("parseTitlesFromAi 对裸书名列表退化解析", () => {
    expect(parseTitlesFromAi("1. 满级反派他妈\n2. 慈母多败儿\n3. 我儿是天煞孤星")).toEqual([
      "满级反派他妈",
      "慈母多败儿",
      "我儿是天煞孤星",
    ]);
  });

  it("buildPremiseMessages 带上用户想法与破限 system", () => {
    const msgs = buildPremiseMessages(true, "女主穿越成反派他妈");
    expect(msgs[0]!.content).toMatch(/破限/);
    expect(msgs[1]!.content).toContain("女主穿越成反派他妈");
    expect(msgs[1]!.content).toMatch(/书名：/);
  });

  it("formatPremise 把想法与卖点传给下游", () => {
    const assets = emptyStudioAssets();
    assets.premise = { idea: "穿书保命", logline: "她只想苟活" };
    const msgs = buildOutlineMessages(false, "测试", assets);
    expect(msgs[1]!.content).toContain("穿书保命");
    expect(msgs[1]!.content).toContain("她只想苟活");
  });
});
