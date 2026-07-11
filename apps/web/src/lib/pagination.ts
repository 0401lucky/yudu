export interface PageMetrics {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  paragraphGap: number;
}

/** 中文等全角字符宽约等于 fontSize；ASCII 约 0.55 */
function charWidth(ch: string, fontSize: number): number {
  const code = ch.codePointAt(0) ?? 0;
  // 基本拉丁 / 常见半角
  if (code <= 0x00ff) return fontSize * 0.55;
  return fontSize;
}

/**
 * 按估算排版将正文切成页，返回每页起始 char offset。
 * 空文本返回 [0]。
 */
export function paginateText(text: string, metrics: PageMetrics): number[] {
  const {
    width,
    height,
    fontSize,
    lineHeight,
    paragraphGap,
  } = metrics;

  if (width <= 0 || height <= 0 || fontSize <= 0) {
    return [0];
  }

  if (text.length === 0) {
    return [0];
  }

  const lineH = fontSize * lineHeight;
  const maxLines = Math.max(1, Math.floor(height / lineH));
  const starts: number[] = [0];

  let offset = 0;
  let linesOnPage = 0;
  let x = 0;

  const newPage = (at: number) => {
    if (starts[starts.length - 1] !== at) {
      starts.push(at);
    }
    linesOnPage = 0;
    x = 0;
  };

  const newLine = (at: number) => {
    linesOnPage += 1;
    x = 0;
    if (linesOnPage >= maxLines) {
      newPage(at);
    }
  };

  // 按段落切分，保留分隔信息
  const parts = text.split(/(\n\n+)/);
  let i = 0;
  while (i < parts.length) {
    const part = parts[i]!;
    i += 1;

    if (/^\n\n+$/.test(part)) {
      // 段间距：折合若干行高
      const gapLines = Math.max(1, Math.round(paragraphGap / lineH));
      for (let g = 0; g < gapLines; g++) {
        if (linesOnPage >= maxLines) {
          newPage(offset);
        }
        // 段落间隙不消耗字符，但占行
        if (g === 0 && x > 0) {
          newLine(offset);
        } else if (g > 0 || x === 0) {
          linesOnPage += 1;
          if (linesOnPage >= maxLines) {
            newPage(offset);
          }
        }
      }
      offset += part.length;
      continue;
    }

    // 段内可有单换行
    for (let j = 0; j < part.length; j++) {
      const ch = part[j]!;
      if (ch === "\n") {
        offset += 1;
        newLine(offset);
        continue;
      }

      const w = charWidth(ch, fontSize);
      if (x > 0 && x + w > width) {
        newLine(offset);
      }
      if (linesOnPage >= maxLines) {
        newPage(offset);
      }
      x += w;
      offset += 1;
    }
  }

  return starts;
}

/** 给定 offset 找页码 0-based */
export function pageIndexForOffset(
  pageStarts: number[],
  offset: number,
): number {
  if (pageStarts.length === 0) return 0;
  let lo = 0;
  let hi = pageStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pageStarts[mid]! <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function pageSlice(
  text: string,
  pageStarts: number[],
  pageIndex: number,
): string {
  if (pageStarts.length === 0) return text;
  const start = pageStarts[pageIndex] ?? 0;
  const end =
    pageIndex + 1 < pageStarts.length
      ? pageStarts[pageIndex + 1]!
      : text.length;
  return text.slice(start, end);
}
