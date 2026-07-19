import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { FontFamilyId } from "../hooks/useLocalReaderPrefs";
import { renderMarkdown } from "../lib/mdRender";

interface ReaderViewportProps {
  /** 整章文本，由浏览器多栏排版自动分页，永不裁字 */
  text: string;
  /** plain=纯文本；markdown=MD 子集富文本 */
  contentMode?: "plain" | "markdown";
  /** 当前页（0-based） */
  pageIndex: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamilyId;
  pageMargin: "compact" | "normal" | "relaxed";
  /** 本章总页数变化时上报 */
  onPageCount: (count: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
}

const VERTICAL_PAD: Record<string, string> = {
  compact: "0.75rem",
  normal: "1rem",
  relaxed: "1.25rem",
};
/** 栏内左右内边距（版心已限宽，大屏不再用巨大 padding「硬挤」） */
const HORIZONTAL_PAD: Record<string, string> = {
  compact: "0.85rem",
  normal: "1.15rem",
  relaxed: "1.5rem",
};

/**
 * 桌面端版心最大宽度（相对字号的 em），避免整屏拉行导致难读。
 * 中文约 32～40 字/行更舒适；边距档位略调宽窄。
 */
const MEASURE_EM: Record<"compact" | "normal" | "relaxed", number> = {
  compact: 34,
  normal: 38,
  relaxed: 42,
};

const FONT_STACK: Record<FontFamilyId, string> = {
  serif:
    '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif',
  sans: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
};

const SWIPE_THRESHOLD = 48;

/**
 * 用 CSS 多栏把整章排成横向若干「栏」，每栏正好一页，
 * 通过 translateX 平移实现翻页动画。分页交给浏览器，从根上避免裁字/遮挡。
 */
export default function ReaderViewport({
  text,
  contentMode = "plain",
  pageIndex,
  fontSize,
  lineHeight,
  fontFamily,
  pageMargin,
  onPageCount,
  onPrev,
  onNext,
  onToggleChrome,
}: ReaderViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // 每页步进宽度（裁剪窗口宽度），用于平移与跟手拖动
  const [stride, setStride] = useState(1);
  const [animate, setAnimate] = useState(false);
  const [dragDx, setDragDx] = useState(0);

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const axisLocked = useRef<"h" | "v" | null>(null);

  // 测量总页数与步进宽度。列宽 = 裁剪窗口宽度（stride）。
  // 首次测量时 stride 还是旧值，列宽与实际不符，先只更新 stride 触发复算，
  // 待列宽与测量宽度一致后再上报页数，避免错误页数吞掉待恢复的页码。
  const measure = useCallback(() => {
    const clip = clipRef.current;
    const track = trackRef.current;
    if (!clip || !track) return;
    if (!text) return;
    const contentWidth = clip.clientWidth;
    if (contentWidth <= 0) return;
    if (stride !== contentWidth) {
      setStride(contentWidth);
      return;
    }
    const total = track.scrollWidth;
    const count = Math.max(1, Math.round(total / contentWidth));
    onPageCount(count);
  }, [onPageCount, text, stride]);

  useLayoutEffect(() => {
    measure();
  }, [
    measure,
    stride,
    text,
    contentMode,
    fontSize,
    lineHeight,
    fontFamily,
    pageMargin,
  ]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    window.visualViewport?.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [measure]);

  // 翻页时开启动画；测量重排时不带动画，避免跳动
  useEffect(() => {
    setAnimate(true);
  }, [pageIndex]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragging.current = true;
    axisLocked.current = null;
    setAnimate(false);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || startX.current == null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - (startY.current ?? e.clientY);
    if (axisLocked.current == null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
    }
    if (axisLocked.current === "h") {
      e.preventDefault();
      setDragDx(dx);
    }
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || startX.current == null) {
        return;
      }
      const dx = e.clientX - startX.current;
      const dy = e.clientY - (startY.current ?? e.clientY);
      const wasHorizontal = axisLocked.current === "h";
      dragging.current = false;
      startX.current = null;
      startY.current = null;
      axisLocked.current = null;
      setAnimate(true);
      setDragDx(0);

      if (wasHorizontal && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0) onNext();
        else onPrev();
        return;
      }

      // 未构成滑动：按点击位置分区（两侧翻页，中间唤出工具栏）
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const frame = frameRef.current;
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        if (ratio < 0.3) onPrev();
        else if (ratio > 0.7) onNext();
        else onToggleChrome();
      }
    },
    [onNext, onPrev, onToggleChrome],
  );

  const translateX = -(pageIndex * stride) + dragDx;
  const measureMax = `min(100%, ${MEASURE_EM[pageMargin]}em)`;

  return (
    <div
      ref={frameRef}
      className="reader-page relative flex h-full w-full touch-pan-y select-none items-stretch justify-center overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/*
        版心：大屏限制最大行宽并水平居中；手机仍 100%。
        外层 frame 全宽，两侧空白仍可点翻页/唤出工具栏。
      */}
      <div
        className="reader-page-inner relative flex h-full min-h-0 w-full flex-col"
        style={{
          maxWidth: measureMax,
          fontSize: `${fontSize}px`,
          padding: `${VERTICAL_PAD[pageMargin]} ${HORIZONTAL_PAD[pageMargin]}`,
        }}
      >
        {/* 裁剪窗口：只露出当前栏，padding 区不会漏出相邻栏 */}
        <div ref={clipRef} className="min-h-0 w-full flex-1 overflow-hidden">
          <div
            ref={trackRef}
            className={
              contentMode === "markdown"
                ? "reader-track h-full break-words [overflow-wrap:anywhere]"
                : "reader-track h-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            }
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: String(lineHeight),
              fontFamily: FONT_STACK[fontFamily],
              columnWidth: `${stride}px`,
              columnGap: 0,
              columnFill: "auto",
              transform: `translateX(${translateX}px)`,
              transition: animate ? "transform 0.28s ease" : "none",
              willChange: "transform",
            }}
          >
            {contentMode === "markdown" ? renderMarkdown(text) : text}
          </div>
        </div>
      </div>
    </div>
  );
}
