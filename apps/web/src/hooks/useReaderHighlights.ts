import type { HighlightColor, HighlightDto } from "@yudu/shared";
import { HIGHLIGHT_COLORS, MAX_HIGHLIGHT_CHARS, MAX_HIGHLIGHT_EXCERPT_CHARS } from "@yudu/shared";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PopoverAnchorRect } from "../components/HighlightPopover";
import HighlightPopover from "../components/HighlightPopover";
import { offsetsToRange, pointToOffset, rangeToOffsets } from "../lib/textAnchor";
import type { HighlightAnchor } from "./useHighlights";

/** 视口正文容器标记属性：值为章号（本 hook 据此收集渲染中的章区域） */
export const HL_CHAPTER_ATTR = "data-hl-chapter";

/** 视口 ↔ 高亮层桥接：视口只需上报重排、转发点击命中 */
export interface ReaderHighlightBridge {
  /** 正文 DOM 变化（章切换/窗口平移/字号重排）后调用，重建高亮 Range */
  notifyLayout: () => void;
  /** 仅收起气泡（同章翻页等 DOM 未变、Range 仍有效的场景）；气泡未开时零开销 */
  closePopover: () => void;
  /** 是否存在落在正文内的非空选区（翻页视口用于跳过拖动翻页） */
  hasSelection: () => boolean;
  /** 点击（未构成滑动）时调用：命中高亮/选区/气泡收起时返回 true，视口跳过翻页与工具栏切换 */
  handleTap: (clientX: number, clientY: number) => boolean;
}

interface UseReaderHighlightsParams {
  /** 非 PDF 且书已加载时启用 */
  enabled: boolean;
  highlights: HighlightDto[];
  onCreate: (anchor: HighlightAnchor) => void;
  onRecolor: (hl: HighlightDto, color: HighlightColor) => void;
  onRemove: (hl: HighlightDto) => void;
}

type PopoverState =
  | {
      kind: "create";
      rect: PopoverAnchorRect;
      chapterIndex: number;
      startOffset: number;
      endOffset: number;
      excerpt: string;
      overLimit: boolean;
    }
  | { kind: "edit"; rect: PopoverAnchorRect; highlight: HighlightDto };

interface ChapterRegion {
  chapterIndex: number;
  el: HTMLElement;
}

/** CSS Custom Highlight API 特性检测：不支持则跳过正文渲染（列表/增删仍可用） */
const HIGHLIGHT_API_SUPPORTED =
  typeof CSS !== "undefined" && "highlights" in CSS;

/** 选区弹泡防抖：等移动端选区手柄调整稳定后再更新气泡 */
const SELECTION_DEBOUNCE_MS = 250;

function highlightName(color: HighlightColor): string {
  return `yudu-hl-${color}`;
}

/** 收集当前渲染中的章正文区域（视口以 data-hl-chapter 标记容器） */
function collectRegions(): ChapterRegion[] {
  const regions: ChapterRegion[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(
    `[${HL_CHAPTER_ATTR}]`,
  )) {
    const idx = Number(el.getAttribute(HL_CHAPTER_ATTR));
    if (Number.isInteger(idx) && idx >= 0) {
      regions.push({ chapterIndex: idx, el });
    }
  }
  return regions;
}

/** 当前选区若完整落在某章正文内则返回换算结果 */
function getSelectionInRegions(): {
  region: ChapterRegion;
  range: Range;
  start: number;
  end: number;
} | null {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  for (const region of collectRegions()) {
    if (
      region.el.contains(range.startContainer) &&
      region.el.contains(range.endContainer)
    ) {
      const offsets = rangeToOffsets(region.el, range);
      if (!offsets) return null;
      return { region, range, start: offsets.start, end: offsets.end };
    }
  }
  return null;
}

/** 点击坐标 → 所在章区域与文本偏移（caretPositionFromPoint 优先，缺失时回退 webkit 接口） */
function caretHit(
  x: number,
  y: number,
): { region: ChapterRegion; offset: number } | null {
  // 先确认点击确实落在正文元素上，避免 caret 接口把行外空白吸附到最近文字
  const target = document.elementFromPoint(x, y);
  if (!target) return null;
  const regions = collectRegions();
  const region = regions.find((r) => r.el.contains(target));
  if (!region) return null;

  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let nodeOffset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      node = pos.offsetNode;
      nodeOffset = pos.offset;
    }
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      nodeOffset = range.startOffset;
    }
  }
  if (!node) return null;
  const offset = pointToOffset(region.el, node, nodeOffset);
  if (offset == null) return null;
  return { region, offset };
}

function rectOf(range: Range): PopoverAnchorRect {
  const r = range.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** 摘录：空白折叠为空格并截断（与服务端截断口径一致） */
function excerptOf(range: Range): string {
  return range
    .toString()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HIGHLIGHT_EXCERPT_CHARS);
}

/**
 * 阅读器文本高亮层：两个视口（翻页/滚动）共用。
 * - 渲染：CSS Custom Highlight API（特性检测降级），正文重排后重建 Range
 * - 创建：pointerup / selectionchange（防抖）检测正文内选区 → 取色气泡
 * - 编辑：点击命中已有高亮 → 改色/删除气泡（此时视口不切换工具栏）
 */
export function useReaderHighlights({
  enabled,
  highlights,
  onCreate,
  onRecolor,
  onRemove,
}: UseReaderHighlightsParams): {
  bridge: ReaderHighlightBridge;
  popover: ReactNode;
} {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [layoutEpoch, setLayoutEpoch] = useState(0);

  // 渲染期同步 ref，供 document 级监听与稳定回调读取最新值
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  const popoverRef = useRef<PopoverState | null>(null);
  popoverRef.current = popover;
  const onCreateRef = useRef(onCreate);
  onCreateRef.current = onCreate;
  const onRecolorRef = useRef(onRecolor);
  onRecolorRef.current = onRecolor;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  // 手势状态：选区调整中不弹泡；气泡因外点收起时吞掉该次 tap
  const pointerActiveRef = useRef(false);
  const swallowTapRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 渲染：按颜色重建命名高亮 ----
  useEffect(() => {
    if (!HIGHLIGHT_API_SUPPORTED) return;
    if (!enabled) {
      for (const color of HIGHLIGHT_COLORS) {
        CSS.highlights.delete(highlightName(color));
      }
      return;
    }
    const byColor = new Map<HighlightColor, Range[]>();
    for (const region of collectRegions()) {
      for (const hl of highlights) {
        if (hl.chapterIndex !== region.chapterIndex) continue;
        const range = offsetsToRange(region.el, hl.startOffset, hl.endOffset);
        if (!range) continue; // 越界（内容变化导致锚点失效）：静默跳过
        const list = byColor.get(hl.color);
        if (list) list.push(range);
        else byColor.set(hl.color, [range]);
      }
    }
    for (const color of HIGHLIGHT_COLORS) {
      CSS.highlights.set(
        highlightName(color),
        new Highlight(...(byColor.get(color) ?? [])),
      );
    }
  }, [enabled, highlights, layoutEpoch]);

  // 卸载（离开阅读页）时清理命名高亮
  useEffect(
    () => () => {
      if (!HIGHLIGHT_API_SUPPORTED) return;
      for (const color of HIGHLIGHT_COLORS) {
        CSS.highlights.delete(highlightName(color));
      }
    },
    [],
  );

  // ---- 创建流：选区稳定后弹取色气泡 ----
  const showCreatePopoverFromSelection = useCallback(() => {
    if (!enabledRef.current) return;
    const hit = getSelectionInRegions();
    if (!hit) {
      // 选区消失：仅收起创建气泡，编辑气泡由外点关闭
      setPopover((p) => (p && p.kind === "create" ? null : p));
      return;
    }
    setPopover({
      kind: "create",
      rect: rectOf(hit.range),
      chapterIndex: hit.region.chapterIndex,
      startOffset: hit.start,
      endOffset: hit.end,
      excerpt: excerptOf(hit.range),
      overLimit: hit.end - hit.start > MAX_HIGHLIGHT_CHARS,
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onPointerDown = (e: PointerEvent) => {
      pointerActiveRef.current = true;
      swallowTapRef.current = false;
      // 点外部收起气泡；本次 tap 已被消费，视口不应再翻页/切工具栏
      if (
        popoverRef.current &&
        !(e.target instanceof Element && e.target.closest("[data-hl-popover]"))
      ) {
        setPopover(null);
        swallowTapRef.current = true;
      }
    };
    const onPointerEnd = () => {
      pointerActiveRef.current = false;
      // 浏览器在 pointerup 之后才敲定选区，推迟到下一拍检查
      setTimeout(showCreatePopoverFromSelection, 0);
    };
    const onSelectionChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        // 拖动选区/手柄调整过程中不弹泡，等手势结束
        if (pointerActiveRef.current) return;
        showCreatePopoverFromSelection();
      }, SELECTION_DEBOUNCE_MS);
    };
    // 正文滚动后 fixed 气泡与锚点错位：直接收起。
    // 创建气泡不丢操作——选区仍在，下一次 pointerup 会重新弹出
    const onScroll = () => {
      setPopover((p) => (p ? null : p));
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("scroll", onScroll, true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, showCreatePopoverFromSelection]);

  // ---- 桥接：视口回调 ----
  const notifyLayout = useCallback(() => {
    // 正文重排：气泡位置/选区 Range 已过期，收起并重建
    setPopover(null);
    setLayoutEpoch((e) => e + 1);
  }, []);

  const closePopover = useCallback(() => {
    setPopover((p) => (p ? null : p));
  }, []);

  const hasSelection = useCallback(
    () => enabledRef.current && getSelectionInRegions() != null,
    [],
  );

  const handleTap = useCallback((clientX: number, clientY: number) => {
    if (swallowTapRef.current) {
      swallowTapRef.current = false;
      return true;
    }
    if (!enabledRef.current) return false;
    // 有活动选区：交给创建流处理，不翻页不切工具栏
    if (getSelectionInRegions()) return true;
    const hit = caretHit(clientX, clientY);
    if (!hit) return false;
    const found = highlightsRef.current.find(
      (h) =>
        h.chapterIndex === hit.region.chapterIndex &&
        h.startOffset <= hit.offset &&
        hit.offset < h.endOffset,
    );
    if (!found) return false;
    const range = offsetsToRange(
      hit.region.el,
      found.startOffset,
      found.endOffset,
    );
    if (!range) return false;
    setPopover({ kind: "edit", rect: rectOf(range), highlight: found });
    return true;
  }, []);

  const bridge = useMemo<ReaderHighlightBridge>(
    () => ({ notifyLayout, closePopover, hasSelection, handleTap }),
    [notifyLayout, closePopover, hasSelection, handleTap],
  );

  // ---- 气泡动作 ----
  const handlePick = useCallback((color: HighlightColor) => {
    const p = popoverRef.current;
    if (!p) return;
    if (p.kind === "create") {
      if (p.overLimit) return;
      onCreateRef.current({
        chapterIndex: p.chapterIndex,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
        color,
        excerpt: p.excerpt,
      });
      document.getSelection()?.removeAllRanges();
    } else {
      onRecolorRef.current(p.highlight, color);
    }
    setPopover(null);
  }, []);

  const handleDelete = useCallback(() => {
    const p = popoverRef.current;
    if (p?.kind === "edit") {
      onRemoveRef.current(p.highlight);
    }
    setPopover(null);
  }, []);

  const popoverNode: ReactNode = popover
    ? createElement(HighlightPopover, {
        anchor: popover.rect,
        mode: popover.kind,
        currentColor:
          popover.kind === "edit" ? popover.highlight.color : undefined,
        overLimit: popover.kind === "create" ? popover.overLimit : false,
        onPick: handlePick,
        onDelete: popover.kind === "edit" ? handleDelete : undefined,
      })
    : null;

  return { bridge, popover: popoverNode };
}
