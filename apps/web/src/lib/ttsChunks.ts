/**
 * TTS 朗读块切分：段落文本 → 若干 ≤ maxLen 的朗读块。
 *
 * Chrome 对过长 utterance 会静默中断，需按块逐段朗读。
 * 切分优先级：句末标点 > 逗号类标点 > 空白 > 硬切；
 * 切点后的引号/括号闭合符吸附到前块，避免下一块以孤立闭合符开头。
 * 非纯空白输入下各块拼接还原原文。
 */

export const TTS_CHUNK_MAX_CHARS = 160;

/** 句末标点：优先在这里断句 */
const STRONG_BREAKS = new Set([..."。！？!?；;…"]);
/** 逗号类标点：无句末标点时的次选切点 */
const WEAK_BREAKS = new Set([..."，,、：:"]);
/** 闭合符：切点后吸附到前块（如 「……。”」 的引号） */
const TRAILING_CLOSERS = new Set([...'”’"\'」』）)】']);

export function splitTtsChunks(
  text: string,
  maxLen = TTS_CHUNK_MAX_CHARS,
): string[] {
  if (!text.trim()) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.length - i <= maxLen) {
      chunks.push(text.slice(i));
      break;
    }
    // 窗口 [i, i+maxLen) 内从后往前找切点（不含 i 本身，保证前进）
    let cut = -1;
    for (let j = i + maxLen - 1; j > i; j--) {
      if (STRONG_BREAKS.has(text[j])) {
        cut = j;
        break;
      }
    }
    if (cut === -1) {
      for (let j = i + maxLen - 1; j > i; j--) {
        if (WEAK_BREAKS.has(text[j])) {
          cut = j;
          break;
        }
      }
    }
    if (cut === -1) {
      for (let j = i + maxLen - 1; j > i; j--) {
        if (/\s/.test(text[j])) {
          cut = j;
          break;
        }
      }
    }
    let end = cut === -1 ? i + maxLen : cut + 1;
    // 吸附紧随的闭合符（仍受 maxLen 约束）
    while (
      end < text.length &&
      end - i < maxLen &&
      TRAILING_CLOSERS.has(text[end])
    ) {
      end++;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
