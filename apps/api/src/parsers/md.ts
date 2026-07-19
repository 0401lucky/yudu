import type { ParseResult, ParsedChapter } from "./types";

export function parseMd(bytes: Uint8Array, filename: string): ParseResult {
  const raw = new TextDecoder("utf-8").decode(bytes);
  const withoutFm = stripFrontMatter(normalizeNewlines(raw));
  const bookTitle = titleFromFilename(filename);
  const chapters = splitMdChapters(withoutFm, bookTitle);

  return {
    title: bookTitle,
    author: null,
    chapters,
  };
}

/** 将 Markdown 子集源文近似为纯文本（进度 char_count / 书架百分比） */
export function mdToPlainText(md: string): string {
  return toPlainText(md);
}

export function mdPlainLength(md: string): number {
  return mdToPlainText(md).length;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) || base;
}

/** 去掉开头 YAML front matter：--- ... --- */
function stripFrontMatter(text: string): string {
  if (!text.startsWith("---")) {
    // 允许 BOM / 前导空白
    const trimmedStart = text.replace(/^\uFEFF?/, "");
    if (!trimmedStart.startsWith("---")) return text;
    return stripFrontMatter(trimmedStart);
  }
  const rest = text.slice(3);
  // 首行 --- 后到下一单独 --- 行
  const match = rest.match(/^\r?\n?([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return text;
  return rest.slice(match[0].length);
}

function splitMdChapters(text: string, fallbackTitle: string): ParsedChapter[] {
  const lines = text.split("\n");

  const h2 = lines.filter((l) => /^##\s+\S/.test(l.trim()));
  const h1 = lines.filter((l) => /^#\s+\S/.test(l.trim()) && !/^##/.test(l.trim()));

  // 优先 ##（至少 2 个），否则用 #，都没有则整篇一章
  let level: 1 | 2 | null = null;
  if (h2.length >= 2) {
    level = 2;
  } else if (h1.length >= 1) {
    level = 1;
  } else if (h2.length === 1) {
    // 仅 1 个 ## 且没有 #：仍按该 ## 作为唯一分章点意义不大，
    // 规则：优先 ## 若至少 2 个，否则 #；# 也没有时整篇一章。
    // 若只有 1 个 ##、0 个 # → 整篇一章。
    level = null;
  }

  if (level === null) {
    return [
      {
        title: fallbackTitle,
        text: normalizeChapterBody(text),
      },
    ];
  }

  // 匹配 # 时排除 ##
  const isHeading = (line: string): string | null => {
    const t = line.trim();
    if (level === 2) {
      const m = t.match(/^##\s+(.+)$/);
      return m ? stripInlineMd(m[1].trim()) : null;
    }
    // level 1：恰好一级 #
    if (/^##/.test(t)) return null;
    const m = t.match(/^#\s+(.+)$/);
    return m ? stripInlineMd(m[1].trim()) : null;
  };

  const chapters: ParsedChapter[] = [];
  let currentTitle: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) {
      bodyLines = [];
      return;
    }
    chapters.push({
      title: currentTitle,
      text: normalizeChapterBody(bodyLines.join("\n")),
    });
    bodyLines = [];
  };

  for (const line of lines) {
    const title = isHeading(line);
    if (title !== null) {
      flush();
      currentTitle = title;
      continue;
    }
    // 非当前分章层级的标题行：当作正文保留（含 ### 等）
    bodyLines.push(line);
  }
  flush();

  if (chapters.length === 0) {
    return [{ title: fallbackTitle, text: normalizeChapterBody(text) }];
  }

  return chapters;
}

/** 章节正文：保留 Markdown 子集标记，仅规范化换行与空行 */
function normalizeChapterBody(md: string): string {
  return normalizeNewlines(md)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** 剥离简单 markdown 标记为纯文本，段落用 \n\n */
function toPlainText(md: string): string {
  const lines = normalizeNewlines(md).split("\n");
  const out: string[] = [];

  for (let line of lines) {
    // 去掉 ATX 标题标记
    line = line.replace(/^#{1,6}\s+/, "");
    // 去掉列表前缀
    line = line.replace(/^(\s*)([-*+]|\d+\.)\s+/, "$1");
    line = stripInlineMd(line);
    out.push(line.trimEnd());
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripInlineMd(s: string): string {
  // 粗体 **...**
  let t = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  // 斜体 *...*（避免吃掉剩余 *）
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
  // 行内代码 `...`
  t = t.replace(/`([^`]+)`/g, "$1");
  // 链接 [text](url)
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return t;
}
