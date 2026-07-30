import { describe, expect, it } from "vitest";
import {
  buildChapterBodyMessages,
  buildChapterOutlinesMessages,
  buildCharactersMessages,
  buildOutlineMessages,
  buildPremiseMessages,
  getBreakLimitSystemPromptForPreview,
  formatOutline,
  parseChapterOutlinesFromAi,
  parseCharactersFromAi,
  parseOutlineDetailFromAi,
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

describe("人设解析", () => {
  const BLOCK = [
    "【角色1】",
    "姓名：林晚",
    "定位：主角",
    "年龄身份：32 岁，侯府主母；穿书前是急诊科护士",
    "外貌：眼尾一道旧痕，笑起来很淡",
    "性格：外冷内热，遇事先想退路",
    "背景：穿书当天正在值夜班",
    "动机：只想活到儿子成年",
    "软肋：见血就手抖，怕儿子看她的眼神",
    "口吻：话少，爱用短句，从不把话说满",
    "关系：与沈篁是母子，互相提防",
    "",
    "【角色2】",
    "姓名：沈篁",
    "定位：反派",
    "年龄身份：17 岁，侯府独子",
    "外貌：瘦，站着时总靠墙",
    "性格：早熟，把善意当筹码",
    "背景：五岁被送去别院养到十二岁",
    "动机：要让所有算计过他的人后悔",
    "软肋：不敢承认自己想要一个母亲",
    "口吻：慢，一句话拆两半说",
    "关系：视林晚为最大变数",
  ].join("\n");

  it("块格式解析出全部维度", () => {
    const cs = parseCharactersFromAi(BLOCK);
    expect(cs).toHaveLength(2);
    const a = cs[0]!;
    expect(a.name).toBe("林晚");
    expect(a.role).toBe("主角");
    expect(a.ageIdentity).toBe("32 岁，侯府主母；穿书前是急诊科护士");
    expect(a.appearance).toBe("眼尾一道旧痕，笑起来很淡");
    expect(a.personality).toBe("外冷内热，遇事先想退路");
    expect(a.background).toBe("穿书当天正在值夜班");
    expect(a.motivation).toBe("只想活到儿子成年");
    expect(a.flaw).toBe("见血就手抖，怕儿子看她的眼神");
    expect(a.speech).toBe("话少，爱用短句，从不把话说满");
    expect(a.relations).toBe("与沈篁是母子，互相提防");
    expect(a.description).toBe("");
    expect(cs[1]!.name).toBe("沈篁");
  });

  it("没有【角色N】标记时按空行分块", () => {
    const text = [
      "姓名：甲",
      "定位：主角",
      "动机：报仇",
      "",
      "姓名：乙",
      "定位：反派",
      "动机：夺权",
    ].join("\n");
    const cs = parseCharactersFromAi(text);
    expect(cs).toHaveLength(2);
    expect(cs[0]!.motivation).toBe("报仇");
    expect(cs[1]!.name).toBe("乙");
  });

  it("只有一个角色也能解析", () => {
    const cs = parseCharactersFromAi("【角色1】\n姓名：独苗\n定位：主角\n动机：活着");
    expect(cs).toHaveLength(1);
    expect(cs[0]!.name).toBe("独苗");
  });

  it("旧格式退化解析进 description", () => {
    const cs = parseCharactersFromAi(
      "1. 林晚｜侯府主母｜穿书成反派他妈，只想保命\n2. 沈篁｜反派儿子｜早熟阴郁",
    );
    expect(cs).toHaveLength(2);
    expect(cs[0]!.name).toBe("林晚");
    expect(cs[0]!.role).toBe("侯府主母");
    expect(cs[0]!.description).toBe("穿书成反派他妈，只想保命");
    expect(cs[0]!.motivation).toBeUndefined();
  });

  it("漏写某维度时其余正常", () => {
    const cs = parseCharactersFromAi(
      "【角色1】\n姓名：甲\n定位：主角\n外貌：高\n软肋：怕水",
    );
    expect(cs).toHaveLength(1);
    expect(cs[0]!.appearance).toBe("高");
    expect(cs[0]!.motivation).toBeUndefined();
  });

  it("整段散文返回空数组", () => {
    expect(parseCharactersFromAi("这是个好设定，我建议主角先失去一切再站起来。")).toEqual([]);
  });

  it("块内维度不足且无姓名时丢弃该块", () => {
    const cs = parseCharactersFromAi("【角色1】\n外貌：高\n\n【角色2】\n姓名：甲\n动机：赢");
    expect(cs).toHaveLength(1);
    expect(cs[0]!.name).toBe("甲");
  });

  it("formatCharacters 把动机 / 软肋 / 口吻传给正文", () => {
    const assets = emptyStudioAssets();
    assets.characters = parseCharactersFromAi(BLOCK);
    const msgs = buildChapterBodyMessages(
      false,
      "测试",
      assets,
      { index: 0, title: "第一章", summary: "相遇" },
      0,
    );
    const user = msgs[1]!.content;
    expect(user).toContain("只想活到儿子成年");
    expect(user).toContain("见血就手抖");
    expect(user).toContain("话少，爱用短句");
    expect(user).toContain("动机与目标");
  });

  it("formatCharacters 对只有 description 的旧角色输出「描述：」", () => {
    const assets = emptyStudioAssets();
    assets.characters = [
      { id: "1", name: "林晚", role: "主角", description: "穿书成反派他妈" },
    ];
    const msgs = buildOutlineMessages(false, "测试", assets);
    expect(msgs[1]!.content).toContain("描述：穿书成反派他妈");
  });

  it("buildCharactersMessages 含 8 个维度名与禁空泛标签要求", () => {
    const user = buildCharactersMessages(false, "测试", emptyStudioAssets())[1]!
      .content;
    for (const k of ["年龄身份", "外貌", "性格", "背景", "动机", "软肋", "口吻", "关系"]) {
      expect(user).toContain(k);
    }
    expect(user).toMatch(/空泛/);
    expect(user).toMatch(/【角色1】/);
  });
});

describe("大纲解析", () => {
  const OUTLINE = [
    "主线：一个只想苟活的母亲，最后亲手推翻了她拼命想融入的秩序",
    "世界观：架空王朝，无灵力，权力靠联姻与兵符流转",
    "冲突：母子目标相反，且谁退一步都活不成",
    "起：穿书当夜，她在儿子的鸩酒前坐了一整晚",
    "承：两次试探，一次结盟，她发现原书剧情正在偏移",
    "转：宫变夜，她被迫在儿子和满城人之间选一个",
    "合：各自得偿所愿，也各自失去一样东西",
    "伏笔：旧护身符埋在第 3 章，第 40 章收",
  ].join("\n");

  it("8 字段全中", () => {
    const d = parseOutlineDetailFromAi(OUTLINE)!;
    expect(d.throughline).toContain("只想苟活的母亲");
    expect(d.setting).toContain("架空王朝");
    expect(d.conflict).toContain("谁退一步都活不成");
    expect(d.act1).toContain("鸩酒");
    expect(d.act2).toContain("剧情正在偏移");
    expect(d.act3).toContain("宫变夜");
    expect(d.act4).toContain("各自失去");
    expect(d.subplots).toContain("第 40 章收");
  });

  it("容忍 markdown 星号与列表短横", () => {
    const d = parseOutlineDetailFromAi("**主线**：甲\n- 冲突: 乙\n* 合：丙")!;
    expect(d.throughline).toBe("甲");
    expect(d.conflict).toBe("乙");
    expect(d.act4).toBe("丙");
  });

  it("只命中部分字段时其余 undefined", () => {
    const d = parseOutlineDetailFromAi("主线：甲\n转：乙")!;
    expect(d.throughline).toBe("甲");
    expect(d.act3).toBe("乙");
    expect(d.setting).toBeUndefined();
    expect(d.subplots).toBeUndefined();
  });

  it("整段散文返回 null", () => {
    expect(
      parseOutlineDetailFromAi("这个故事讲的是一个母亲和她儿子的故事，非常动人。"),
    ).toBeNull();
  });

  it("formatOutline 有结构化时用结构化，无时回退 outline", () => {
    const a = emptyStudioAssets();
    a.outline = "旧的整段大纲";
    expect(formatOutline(a)).toBe("旧的整段大纲");

    a.outlineDetail = parseOutlineDetailFromAi(OUTLINE)!;
    const s = formatOutline(a);
    expect(s).toContain("一句话主线：");
    expect(s).toContain("转 · 高潮：");
    expect(s).not.toContain("旧的整段大纲");
  });

  it("outlineDetail 全空白时仍回退 outline", () => {
    const a = emptyStudioAssets();
    a.outline = "旧大纲";
    a.outlineDetail = { throughline: "   " };
    expect(formatOutline(a)).toBe("旧大纲");
  });

  it("buildOutlineMessages 含 8 个字段名", () => {
    const user = buildOutlineMessages(false, "测试", emptyStudioAssets())[1]!
      .content;
    for (const k of ["主线", "世界观", "冲突", "起", "承", "转", "合", "伏笔"]) {
      expect(user).toContain(`${k}：`);
    }
  });
});

describe("细纲解析", () => {
  const CHAPTERS = [
    "【第1章】",
    "标题：雨夜来客",
    "梗概：林晚在陌生的床上醒来，发现自己成了侯府主母",
    "冲突：贴身嬷嬷察觉她连早膳的规矩都不会",
    "钩子：门外传来第二次敲门，来的人喊她「母亲」",
    "人物：林晚、周嬷嬷、沈篁",
    "",
    "【第2章】",
    "标题：鸩酒",
    "梗概：沈篁端来一碗汤",
    "冲突：她知道原书里这碗汤有毒，但拒绝就等于露馅",
    "钩子：她喝下去了，沈篁的手在抖",
    "人物：林晚、沈篁",
  ].join("\n");

  it("块格式解析出全部字段", () => {
    const cs = parseChapterOutlinesFromAi(CHAPTERS);
    expect(cs).toHaveLength(2);
    expect(cs[0]!.title).toBe("雨夜来客");
    expect(cs[0]!.summary).toContain("侯府主母");
    expect(cs[0]!.conflict).toContain("早膳的规矩");
    expect(cs[0]!.hook).toContain("喊她「母亲」");
    expect(cs[0]!.characters).toBe("林晚、周嬷嬷、沈篁");
    expect(cs[1]!.title).toBe("鸩酒");
    expect(cs[1]!.index).toBe(1);
  });

  it("没有【第N章】标记时按空行分块", () => {
    const cs = parseChapterOutlinesFromAi(
      ["标题：甲", "梗概：甲事", "钩子：甲钩", "", "标题：乙", "梗概：乙事", "钩子：乙钩"].join("\n"),
    );
    expect(cs).toHaveLength(2);
    expect(cs[1]!.title).toBe("乙");
    expect(cs[1]!.hook).toBe("乙钩");
  });

  it("只有一章也能解析", () => {
    const cs = parseChapterOutlinesFromAi("【第1章】\n标题：独章\n梗概：发生了点事");
    expect(cs).toHaveLength(1);
    expect(cs[0]!.title).toBe("独章");
  });

  it("旧格式退化解析进 summary", () => {
    const cs = parseChapterOutlinesFromAi(
      "1. 雨夜来客｜林晚醒来发现自己穿了，章末有人敲门\n2. 鸩酒｜她喝下了那碗汤",
    );
    expect(cs).toHaveLength(2);
    expect(cs[0]!.title).toBe("雨夜来客");
    expect(cs[0]!.summary).toContain("有人敲门");
    expect(cs[0]!.hook).toBeUndefined();
  });

  it("块内无标题且字段不足时丢弃该块", () => {
    const cs = parseChapterOutlinesFromAi("【第1章】\n钩子：只有钩子\n\n【第2章】\n标题：甲\n梗概：乙");
    expect(cs).toHaveLength(1);
    expect(cs[0]!.title).toBe("甲");
  });

  it("buildChapterBodyMessages 含本章冲突与钩子并要求收在钩子上", () => {
    const assets = emptyStudioAssets();
    const cs = parseChapterOutlinesFromAi(CHAPTERS);
    const user = buildChapterBodyMessages(false, "测试", assets, cs[0]!, 0)[1]!
      .content;
    expect(user).toContain("早膳的规矩");
    expect(user).toContain("喊她「母亲」");
    expect(user).toContain("林晚、周嬷嬷、沈篁");
    expect(user).toMatch(/收在.*章末钩子/);
  });

  it("细纲生成提示词里的总大纲走 formatOutline", () => {
    const assets = emptyStudioAssets();
    assets.outlineDetail = { act3: "宫变夜" };
    const user = buildChapterOutlinesMessages(false, "测试", assets)[1]!.content;
    expect(user).toContain("转 · 高潮：宫变夜");
  });
});
