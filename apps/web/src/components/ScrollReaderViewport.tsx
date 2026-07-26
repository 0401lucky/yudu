import type { ChapterContent } from "@yudu/shared";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { FontFamilyId } from "../hooks/useLocalReaderPrefs";
import type { ReaderHighlightBridge } from "../hooks/useReaderHighlights";
import { mdPlainLengthApprox, renderMarkdown } from "../lib/mdRender";
import type { PageMarginId } from "./readerTypography";
import {
  FONT_STACK,
  HORIZONTAL_PAD,
  MEASURE_EM,
  VERTICAL_PAD,
} from "./readerTypography";

/** 窗口内单章渲染项（content 为 null 时显示加载占位） */
export interface ScrollChapterItem {
  index: number;
  title: string;
  content: ChapterContent | null;
}

/** 待落位目标：目标章内容挂载后按 charOffset 比例换算 scrollTop */
export interface ScrollPendingTarget {
  chapterIndex: number;
  charOffset: number;
}

interface ScrollReaderViewportProps {
  /** [prev, current, next] 三章窗口（首/末章缺邻章则少于 3 项） */
  items: ScrollChapterItem[];
  totalChapters: number;
  /** plain=纯文本；markdown=MD 子集富文本 */
  contentMode?: "plain" | "markdown";
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamilyId;
  pageMargin: PageMarginId;
  /** 待落位目标；消费完成后回调 onPendingApplied */
  pending: ScrollPendingTarget | null;
  onPendingApplied: () => void;
  /** 节流上报当前位置：当前章（视口顶部+1/3 屏高所在章）+ 章内高度比例 */
  onPosition: (chapterIndex: number, offsetRatio: number) => void;
  onToggleChrome: () => void;
  /** 文本高亮桥接：正文 DOM 变化上报 + 点击命中转发 */
  highlightBridge?: ReaderHighlightBridge;
}

/** 位置上报节流间隔 */
const REPORT_THROTTLE_MS = 150;
/** 点击唤出工具栏的位移阈值（与翻页视口一致） */
const TAP_THRESHOLD = 10;
/** 当前章判定探针：视口顶部再往下 1/3 屏高 */
const PROBE_RATIO = 1 / 3;

interface SectionGeom {
  top: number;
  height: number;
}

/**
 * 连续阅读（上下滚动）视口：按序渲染窗口内各章 section，
 * 章首有标题分隔；DOM 变化（上一章 prepend、占位展开、字号调整）时
 * 以「视口顶部所在章 + 章内高度比例」为锚点补偿 scrollTop，保证视觉不跳。
 *
 * 导出用 memo 包裹：滚动中父组件每 150ms 更新位置状态，
 * 若跟着整树重渲染，md 模式会反复对整章执行 renderMarkdown，造成卡顿。
 */
function ScrollReaderViewport({
  items,
  totalChapters,
  contentMode = "plain",
  fontSize,
  lineHeight,
  fontFamily,
  pageMargin,
  pending,
  onPendingApplied,
  onPosition,
  onToggleChrome,
  highlightBridge,
}: ScrollReaderViewportProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  // 上一轮布局的各章几何，用于检测 DOM 变化并做锚点补偿
  const geomRef = useRef(new Map<number, SectionGeom>());
  // 视口顶部锚点：所在章 + 章内高度比例（滚动时同步更新）
  const anchorRef = useRef<{ index: number; ratio: number } | null>(null);

  // 渲染期同步 ref，供事件回调读取最新值
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);

  // 章内近似文本长度：charOffset ↔ 高度比例换算基准（md 用近似纯文本长度）
  const textLenOf = useCallback(
    (content: ChapterContent) =>
      contentMode === "markdown"
        ? mdPlainLengthApprox(content.text)
        : content.text.length,
    [contentMode],
  );

  // 量测各章 section 在滚动内容坐标系中的 top/height
  const measureGeom = useCallback((): Map<number, SectionGeom> => {
    const geom = new Map<number, SectionGeom>();
    const scroller = scrollerRef.current;
    if (!scroller) return geom;
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    for (const [idx, el] of sectionRefs.current) {
      const rect = el.getBoundingClientRect();
      geom.set(idx, { top: rect.top - base, height: rect.height });
    }
    return geom;
  }, []);

  // 定位内容坐标 y 落在哪一章：取最后一个 top <= y 的章；y 在首章之前则取首章
  const locate = useCallback(
    (geom: Map<number, SectionGeom>, y: number) => {
      let hit: { index: number; top: number; height: number } | null = null;
      for (const item of itemsRef.current) {
        const g = geom.get(item.index);
        if (!g) continue;
        if (hit === null || g.top <= y) {
          hit = { index: item.index, top: g.top, height: g.height };
        }
      }
      return hit;
    },
    [],
  );

  // 同步更新视口顶部锚点（每次滚动都做，保证补偿基准不过期）
  const updateAnchor = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const top = locate(measureGeom(), scroller.scrollTop);
    if (!top || top.height <= 0) return;
    anchorRef.current = {
      index: top.index,
      ratio: clamp01((scroller.scrollTop - top.top) / top.height),
    };
  }, [locate, measureGeom]);

  // 上报当前位置：以「视口顶部 + 1/3 屏高」所在章为当前章
  const reportPosition = useCallback(() => {
    const scroller = scrollerRef.current;
    // 待落位期间不上报，避免覆盖目标位置
    if (!scroller || pendingRef.current) return;
    const geom = measureGeom();
    const probeY = scroller.scrollTop + scroller.clientHeight * PROBE_RATIO;
    const cur = locate(geom, probeY);
    if (!cur || cur.height <= 0) return;
    onPositionRef.current(
      cur.index,
      clamp01((scroller.scrollTop - cur.top) / cur.height),
    );
  }, [locate, measureGeom]);

  const handleScroll = useCallback(() => {
    updateAnchor();
    if (reportTimerRef.current) return; // 节流：窗口期内合并为一次拖尾上报
    reportTimerRef.current = setTimeout(() => {
      reportTimerRef.current = null;
      reportPosition();
    }, REPORT_THROTTLE_MS);
  }, [updateAnchor, reportPosition]);

  useEffect(
    () => () => {
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current);
    },
    [],
  );

  // 让容器可聚焦：↑/↓/PageUp/PageDown/空格交给浏览器原生滚动
  useEffect(() => {
    scrollerRef.current?.focus({ preventScroll: true });
  }, []);

  // 正文 DOM 变化（窗口平移/占位展开/内容模式切换）：通知高亮层重建 Range
  useLayoutEffect(() => {
    highlightBridge?.notifyLayout();
  }, [items, contentMode, highlightBridge]);

  // 每次渲染后：先消费待落位，否则按锚点补偿几何变化
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // 1) 待落位：目标章内容已挂载则换算 scrollTop 落位
    if (pending) {
      const item = items.find((i) => i.index === pending.chapterIndex);
      const el = sectionRefs.current.get(pending.chapterIndex);
      if (item?.content && el) {
        const geom = measureGeom();
        const g = geom.get(pending.chapterIndex);
        if (g) {
          const len = textLenOf(item.content);
          const ratio = len > 0 ? clamp01(pending.charOffset / len) : 0;
          scroller.scrollTop = g.top + ratio * g.height;
          anchorRef.current = { index: pending.chapterIndex, ratio };
          geomRef.current = geom;
          onPendingApplied();
        }
      }
      return; // 内容未就绪则等下一轮渲染
    }

    // 2) 几何补偿：锚点章的 top/height 变化（prepend/占位展开/字号调整）时恢复视觉位置
    const geom = measureGeom();
    const anchor = anchorRef.current;
    if (anchor) {
      const oldG = geomRef.current.get(anchor.index);
      const newG = geom.get(anchor.index);
      if (
        oldG &&
        newG &&
        (Math.abs(newG.top - oldG.top) > 1 ||
          Math.abs(newG.height - oldG.height) > 1)
      ) {
        scroller.scrollTop = newG.top + anchor.ratio * newG.height;
      }
    } else {
      // 初始锚点：当前视口顶部位置
      const top = locate(geom, scroller.scrollTop);
      if (top && top.height > 0) {
        anchorRef.current = {
          index: top.index,
          ratio: clamp01((scroller.scrollTop - top.top) / top.height),
        };
      }
    }
    geomRef.current = geom;
  });

  // 旋转屏幕/窗口尺寸变化：按锚点比例恢复阅读位置
  useEffect(() => {
    const onResize = () => {
      const scroller = scrollerRef.current;
      const anchor = anchorRef.current;
      if (!scroller || !anchor || pendingRef.current) return;
      const geom = measureGeom();
      const g = geom.get(anchor.index);
      if (g && g.height > 0) {
        scroller.scrollTop = g.top + anchor.ratio * g.height;
      }
      geomRef.current = geom;
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [measureGeom]);

  // 点击（位移 < 阈值）只切换工具栏，无左右翻页分区
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    tapStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (!start) return;
      if (
        Math.abs(e.clientX - start.x) < TAP_THRESHOLD &&
        Math.abs(e.clientY - start.y) < TAP_THRESHOLD
      ) {
        // 点击命中已有高亮/存在选区/收起气泡：手势被高亮层消费，不切工具栏
        if (highlightBridge?.handleTap(e.clientX, e.clientY)) return;
        onToggleChrome();
      }
    },
    [onToggleChrome, highlightBridge],
  );

  const measureMax = `min(100%, ${MEASURE_EM[pageMargin]}em)`;
  const lastItem = items.length > 0 ? items[items.length - 1] : undefined;
  const showBookEnd =
    lastItem != null &&
    lastItem.index === totalChapters - 1 &&
    lastItem.content != null;

  return (
    <div
      ref={scrollerRef}
      tabIndex={-1}
      className="reader-page h-full w-full select-none overflow-y-auto outline-none"
      // overflow-anchor:none —— 关闭浏览器滚动锚定，补偿逻辑自己掌控
      style={{ overflowAnchor: "none" }}
      onScroll={handleScroll}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        tapStartRef.current = null;
      }}
    >
      <div
        className="mx-auto w-full"
        style={{
          maxWidth: measureMax,
          fontSize: `${fontSize}px`,
          lineHeight: String(lineHeight),
          fontFamily: FONT_STACK[fontFamily],
          padding: `${VERTICAL_PAD[pageMargin]} ${HORIZONTAL_PAD[pageMargin]}`,
        }}
      >
        {items.map((item) => (
          <section
            key={item.index}
            data-chapter-index={item.index}
            ref={(el) => {
              if (el) sectionRefs.current.set(item.index, el);
              else sectionRefs.current.delete(item.index);
            }}
          >
            {/* 章首标题分隔：让读者感知章节边界 */}
            <h2 className="mb-[1.2em] mt-[1.6em] text-center text-[0.95em] font-medium text-[var(--text-muted)]">
              {item.title}
            </h2>
            {item.content ? (
              <div
                // 正文允许选择文本（根容器 select-none 只保留给章题等 chrome）
                data-hl-chapter={item.index}
                className={
                  contentMode === "markdown"
                    ? "select-text break-words [overflow-wrap:anywhere]"
                    : "select-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                }
              >
                {contentMode === "markdown"
                  ? renderMarkdown(item.content.text)
                  : item.content.text}
              </div>
            ) : (
              // 占位高度：避免邻章加载完成时滚动条跳动过大
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--text-muted)]">
                加载中…
              </div>
            )}
          </section>
        ))}
        {showBookEnd ? (
          <p className="py-[2.5em] text-center text-sm text-[var(--text-muted)]">
            —— 全书完 ——
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default memo(ScrollReaderViewport);

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
