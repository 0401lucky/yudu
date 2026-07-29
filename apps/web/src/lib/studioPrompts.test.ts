import { describe, expect, it } from "vitest";
import {
  buildChapterBodyMessages,
  getBreakLimitSystemPromptForPreview,
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
