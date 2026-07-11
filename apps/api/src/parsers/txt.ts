import type { ParseResult, ParsedChapter } from "./types";

/** 中文章节：第×章… */
const RE_CN_CHAPTER = /^第[零一二三四五六七八九十百千0-9]+章[^\n]*/;
/** 英文章节 */
const RE_EN_CHAPTER = /^Chapter\s+\d+[^\n]*/i;
/** Markdown 风格标题行 */
const RE_MD_HEADING = /^#{1,6}\s+\S[^\n]*/;

const CHAPTER_PATTERNS = [RE_CN_CHAPTER, RE_EN_CHAPTER, RE_MD_HEADING] as const;

export function parseTxt(bytes: Uint8Array, filename: string): ParseResult {
  const raw = decodeBytes(bytes);
  const text = normalizeNewlines(raw);
  const bookTitle = titleFromFilename(filename);

  const chapters = splitTxtChapters(text, bookTitle);
  return {
    title: bookTitle,
    author: null,
    chapters,
  };
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    // 中文网文常见 GBK；Workers 在 nodejs_compat 下可提供 gbk
    try {
      return new TextDecoder("gbk", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("无法识别文本编码（已尝试 UTF-8 / GBK）");
    }
  }
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function titleFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) || base;
}

function splitTxtChapters(text: string, fallbackTitle: string): ParsedChapter[] {
  const lines = text.split("\n");

  let pattern: RegExp | null = null;
  for (const p of CHAPTER_PATTERNS) {
    const hits = lines.filter((line) => p.test(line.trim()));
    if (hits.length >= 1) {
      pattern = p;
      break;
    }
  }

  if (!pattern) {
    return [
      {
        title: fallbackTitle,
        text: normalizeBody(text),
      },
    ];
  }

  const chapters: ParsedChapter[] = [];
  let currentTitle: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (currentTitle === null) {
      const preamble = normalizeBody(bodyLines.join("\n"));
      if (preamble) {
        chapters.push({ title: "前言", text: preamble });
      }
      bodyLines = [];
      return;
    }
    chapters.push({
      title: currentTitle,
      text: normalizeBody(bodyLines.join("\n")),
    });
    bodyLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (pattern.test(trimmed)) {
      flush();
      currentTitle = stripMdHeadingMarkers(trimmed);
      continue;
    }
    bodyLines.push(line);
  }
  flush();

  if (chapters.length === 0) {
    return [{ title: fallbackTitle, text: normalizeBody(text) }];
  }

  return chapters;
}

function stripMdHeadingMarkers(title: string): string {
  return title.replace(/^#{1,6}\s+/, "").trim();
}

/** 段落用 \n\n；去掉首尾空白；折叠多余空行 */
function normalizeBody(text: string): string {
  const normalized = normalizeNewlines(text)
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized;
}
