/**
 * 书摘卡片纯排版计算：截断 / 换行 / 行高，与 Canvas 解耦。
 * 文本宽度测量由调用方注入（渲染层传 ctx.measureText，单测传字符宽度模型）。
 */

/** 摘录最大字符数（按码点计），超出截断并加省略号 */
export const QUOTE_MAX_CHARS = 300;

/** 文本测量函数：返回字符串在目标字体下的像素宽度 */
export type MeasureFn = (text: string) => number;

/** CJK 表意文字与全角标点：可在任意字符间断行 */
const CJK_RE = /[⺀-鿿　-〿豈-﫿＀-￯]/;

/** 超长文本截断：按码点切片（不劈开代理对），截断处补省略号 */
export function truncateText(text: string, maxChars = QUOTE_MAX_CHARS): string {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, maxChars).join("")}…`;
}

/** 单行截断到给定宽度：放不下时逐字符回退并补省略号 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: MeasureFn,
): string {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && measure(`${chars.join("")}…`) > maxWidth) {
    chars.pop();
  }
  return `${chars.join("")}…`;
}

/**
 * 断行单元：换行符 / 空白（折叠为单空格）/ 单个 CJK 字符 / 连续西文词。
 * CJK 逐字可断，西文词整体挪行（超宽时由 wrapText 字符级硬断）。
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let word = "";
  const flushWord = () => {
    if (word) {
      tokens.push(word);
      word = "";
    }
  };
  for (const ch of text) {
    if (ch === "\n") {
      flushWord();
      tokens.push("\n");
    } else if (ch === "\r") {
      // CRLF 的 \r 丢弃，交给 \n 断行
      flushWord();
    } else if (/\s/.test(ch)) {
      flushWord();
      tokens.push(" ");
    } else if (CJK_RE.test(ch)) {
      flushWord();
      tokens.push(ch);
    } else {
      word += ch;
    }
  }
  flushWord();
  return tokens;
}

/**
 * 按测量宽度换行：CJK 逐字、西文按词；保留原文换行符（空行保留为空串行）。
 * 空文本返回空数组。
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureFn,
): string[] {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    lines.push(current.replace(/\s+$/, ""));
    current = "";
  };

  for (const token of tokenize(text)) {
    if (token === "\n") {
      flush();
      continue;
    }
    if (token === " ") {
      // 行首空格丢弃，行中折叠为单空格
      if (current && !current.endsWith(" ")) current += " ";
      continue;
    }
    if (current && measure(current + token) > maxWidth) flush();
    if (!current && measure(token) > maxWidth) {
      // 单个超宽词（长英文单词 / URL）：字符级硬断
      for (const ch of token) {
        if (current && measure(current + ch) > maxWidth) flush();
        current += ch;
      }
      continue;
    }
    current += token;
  }
  if (current) flush();
  // 去掉纯尾部空行（原文末尾换行符产生），中间空行保留
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface QuoteTextLayout {
  lines: string[];
  /** 行数 × 行高；空文本为 0 */
  totalHeight: number;
}

/** 截断（可选）+ 换行 + 总高计算，一步到位供渲染层使用 */
export function layoutText(
  text: string,
  opts: {
    maxWidth: number;
    lineHeight: number;
    measure: MeasureFn;
    /** 传入则先按码点截断加省略号 */
    maxChars?: number;
  },
): QuoteTextLayout {
  const source =
    opts.maxChars != null ? truncateText(text, opts.maxChars) : text;
  const lines = wrapText(source, opts.maxWidth, opts.measure);
  return { lines, totalHeight: lines.length * opts.lineHeight };
}
