import type { StudioAssets, StudioChapterOutline, StudioCharacter } from "@yudu/shared";
import type { ChatMessage } from "./aiClient";

const MINOR_BAN =
  "硬性禁止：不得描写或暗示任何未成年人（含看起来未成年）的性内容、色情或性化；角色必须为明确成年人。";

function baseSystem(breakLimit: boolean): string {
  if (breakLimit) {
    return [
      "你是资深成人向网络小说作者与故事架构师，擅长长篇连载、人物张力与情色情节的融合。",
      "用户已开启破限模式：允许露骨、成人向（18+）虚构描写，文笔可以直白。",
      MINOR_BAN,
      "输出使用简体中文。不要输出与任务无关的免责声明或说教。",
    ].join("\n");
  }
  return [
    "你是资深网络小说作者与故事架构师，擅长长篇结构、人设与章情节拍。",
    "保持健康向或按用户基调写作，不要主动写露骨色情内容。",
    MINOR_BAN,
    "输出使用简体中文。不要输出与任务无关的免责声明。",
  ].join("\n");
}

function formatCharacters(chars: StudioCharacter[]): string {
  if (!chars.length) return "（暂无人设，请合理创造并保持前后一致）";
  return chars
    .map(
      (c, i) =>
        `${i + 1}. ${c.name || "未命名"}（${c.role || "角色"}）：${c.description || "无描述"}`,
    )
    .join("\n");
}

function formatPremise(assets: StudioAssets): string {
  const p = assets.premise ?? {};
  return [
    p.genre ? `类型：${p.genre}` : null,
    p.tone ? `基调：${p.tone}` : null,
    p.targetLength ? `目标篇幅：${p.targetLength}` : null,
    p.notes ? `备注：${p.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n") || "（无额外立项说明）";
}

export function buildCharactersMessages(
  breakLimit: boolean,
  title: string,
  assets: StudioAssets,
): ChatMessage[] {
  return [
    { role: "system", content: baseSystem(breakLimit) },
    {
      role: "user",
      content: [
        `作品《${title}》需要 3～6 个人物卡片。`,
        formatPremise(assets),
        "请用纯文本输出，每人一段，格式严格为：",
        "姓名｜身份/角色｜性格与外貌与关系（一段话）",
        "不要编号以外的标题或 markdown。",
      ].join("\n"),
    },
  ];
}

export function parseCharactersFromAi(text: string): StudioCharacter[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: StudioCharacter[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^\d+[\.、．)\]]\s*/, "");
    const parts = cleaned.split(/｜|\|/).map((s) => s.trim());
    if (parts.length >= 3) {
      out.push({
        id: crypto.randomUUID(),
        name: parts[0] || "未命名",
        role: parts[1] || "角色",
        description: parts.slice(2).join("｜"),
      });
    } else if (parts.length === 2) {
      out.push({
        id: crypto.randomUUID(),
        name: parts[0] || "未命名",
        role: "角色",
        description: parts[1] || "",
      });
    }
  }
  return out;
}

export function buildOutlineMessages(
  breakLimit: boolean,
  title: string,
  assets: StudioAssets,
): ChatMessage[] {
  return [
    { role: "system", content: baseSystem(breakLimit) },
    {
      role: "user",
      content: [
        `为《${title}》写一份总大纲（起承转合、主线冲突、结局方向）。`,
        formatPremise(assets),
        "人设：",
        formatCharacters(assets.characters),
        "直接输出大纲正文，不要前言。",
      ].join("\n"),
    },
  ];
}

export function buildChapterOutlinesMessages(
  breakLimit: boolean,
  title: string,
  assets: StudioAssets,
  chapterCount = 10,
): ChatMessage[] {
  return [
    { role: "system", content: baseSystem(breakLimit) },
    {
      role: "user",
      content: [
        `为《${title}》写 ${chapterCount} 章分章细纲。`,
        formatPremise(assets),
        "人设：",
        formatCharacters(assets.characters),
        "总大纲：",
        assets.outline || "（无）",
        "每行一章，格式：章标题｜本章节拍与冲突与章末钩子",
        "不要其它说明。",
      ].join("\n"),
    },
  ];
}

export function parseChapterOutlinesFromAi(text: string): StudioChapterOutline[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: StudioChapterOutline[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^(第?\d+章?[\:：.\s]*)/, "").trim();
    const parts = cleaned.split(/｜|\|/).map((s) => s.trim());
    if (parts.length >= 2) {
      out.push({
        index: out.length,
        title: parts[0] || `第 ${out.length + 1} 章`,
        summary: parts.slice(1).join("｜"),
      });
    } else if (cleaned) {
      out.push({
        index: out.length,
        title: `第 ${out.length + 1} 章`,
        summary: cleaned,
      });
    }
  }
  return out;
}

export function buildChapterBodyMessages(
  breakLimit: boolean,
  title: string,
  assets: StudioAssets,
  chapter: StudioChapterOutline,
  chapterIndex: number,
): ChatMessage[] {
  return [
    { role: "system", content: baseSystem(breakLimit) },
    {
      role: "user",
      content: [
        `撰写《${title}》第 ${chapterIndex + 1} 章正文。`,
        `章标题：${chapter.title}`,
        `本章细纲：${chapter.summary || "（无细纲，自由发挥但贴合全书）"}`,
        formatPremise(assets),
        "人设：",
        formatCharacters(assets.characters),
        "总大纲（供一致性参考）：",
        assets.outline || "（无）",
        "要求：直接输出小说正文纯文本；可含对话；不要「本章完」以外的作者旁白；篇幅约 1500～3500 字。",
      ].join("\n"),
    },
  ];
}
