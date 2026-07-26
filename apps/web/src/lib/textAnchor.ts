/**
 * DOM Range ↔ 章内字符偏移双向映射。
 *
 * 口径：TreeWalker 遍历容器内文本节点、按文档序累计字符数，
 * 偏移基于「渲染后纯文本」（plain 模式 = 原文；markdown 模式 = 渲染文案）。
 * 高亮渲染与选区换算共用同一口径，保证往返一致。
 */

/** 边界点（node, offset）→ 容器内文本偏移；node 不在容器内返回 null */
export function pointToOffset(
  container: Node,
  node: Node,
  offset: number,
): number | null {
  if (node !== container && !container.contains(node)) return null;
  const doc = container.ownerDocument;
  if (!doc) return null;

  // 归一化边界语义：
  // - 文本节点边界：ref = 该文本节点，偏移取 offset
  // - 元素边界：ref = 第 offset 个子节点（「ref 之前」）；ref 为 null 表示 node 尾部
  let ref: Node | null;
  let textBoundary = -1;
  if (node.nodeType === Node.TEXT_NODE) {
    ref = node;
    textBoundary = offset;
  } else {
    ref = node.childNodes[offset] ?? null;
  }

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    const text = cur as Text;
    if (text === ref) {
      return textBoundary >= 0
        ? acc + Math.min(textBoundary, text.data.length)
        : acc;
    }
    if (ref) {
      // 边界在 ref 之前：仅累计文档序先于 ref 的文本节点
      const pos = ref.compareDocumentPosition(text);
      if (!(pos & Node.DOCUMENT_POSITION_PRECEDING)) return acc;
      acc += text.data.length;
    } else {
      // 边界在 node 尾部：累计 node 之前与 node 内部的文本节点
      const pos = node.compareDocumentPosition(text);
      const inside = Boolean(pos & Node.DOCUMENT_POSITION_CONTAINED_BY);
      const before = Boolean(pos & Node.DOCUMENT_POSITION_PRECEDING);
      if (!inside && !before) return acc;
      acc += text.data.length;
    }
  }
  return acc;
}

/**
 * 选区 Range → 容器内字符偏移区间 [start, end)。
 * Range 端点不在容器内、或选区折叠/无效时返回 null。
 */
export function rangeToOffsets(
  container: Node,
  range: Range,
): { start: number; end: number } | null {
  const start = pointToOffset(container, range.startContainer, range.startOffset);
  const end = pointToOffset(container, range.endContainer, range.endOffset);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

/**
 * 字符偏移区间 [start, end) → Range（供 CSS Highlight 与跳转使用）。
 * 偏移越界或区间无效时返回 null。
 */
export function offsetsToRange(
  container: Node,
  start: number,
  end: number,
): Range | null {
  if (start < 0 || end <= start || !Number.isFinite(end)) return null;
  const doc = container.ownerDocument;
  if (!doc) return null;

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let startNode: Text | null = null;
  let startLocal = 0;
  let endNode: Text | null = null;
  let endLocal = 0;
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    const text = cur as Text;
    const len = text.data.length;
    // 起点归属「字符 start 所在节点」：恰在节点边界时归下一节点
    if (startNode == null && start < acc + len) {
      startNode = text;
      startLocal = start - acc;
    }
    // 终点是开区间边界：恰在节点末尾时归本节点
    if (endNode == null && end <= acc + len) {
      endNode = text;
      endLocal = end - acc;
      break;
    }
    acc += len;
  }
  if (!startNode || !endNode) return null; // 越界

  const range = doc.createRange();
  range.setStart(startNode, startLocal);
  range.setEnd(endNode, endLocal);
  return range;
}
