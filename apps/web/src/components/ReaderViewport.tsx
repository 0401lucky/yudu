import { useCallback, useRef } from "react";

interface ReaderViewportProps {
  pageText: string;
  fontSize: number;
  lineHeight: number;
  pageMargin: "compact" | "normal" | "relaxed";
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
  contentRef: React.RefObject<HTMLDivElement>;
}

/** 窄屏用更紧凑边距，避免手机行过短或留白过大 */
function marginStyle(
  pageMargin: "compact" | "normal" | "relaxed",
): string {
  // 水平用 clamp，竖向略小
  switch (pageMargin) {
    case "compact":
      return "0.75rem clamp(0.75rem, 4vw, 1rem)";
    case "relaxed":
      return "1.25rem clamp(1rem, 5vw, 2rem)";
    default:
      return "1rem clamp(0.875rem, 4.5vw, 1.5rem)";
  }
}

export default function ReaderViewport({
  pageText,
  fontSize,
  lineHeight,
  pageMargin,
  onPrev,
  onNext,
  onToggleChrome,
  contentRef,
}: ReaderViewportProps) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    moved.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = Math.abs(e.clientX - startX.current);
    const dy = Math.abs(e.clientY - (startY.current ?? e.clientY));
    if (dx > 10 || dy > 10) moved.current = true;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (startX.current == null) return;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - (startY.current ?? e.clientY);
      startX.current = null;
      startY.current = null;

      // 纵向滑动优先忽略（避免误翻页）
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
        return;
      }

      if (Math.abs(dx) > 40) {
        if (dx < 0) onNext();
        else onPrev();
        return;
      }
      if (moved.current) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      // 手机两侧热区略收窄，中间更大方便唤出工具栏
      if (ratio < 0.28) onPrev();
      else if (ratio > 0.72) onNext();
      else onToggleChrome();
    },
    [onNext, onPrev, onToggleChrome],
  );

  // fontSize 由 ReaderPage 按屏宽算好后传入，此处直接使用
  return (
    <div
      className="relative h-full min-h-0 w-full touch-pan-y select-none bg-[var(--page-bg)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        startX.current = null;
        startY.current = null;
      }}
    >
      <div
        ref={contentRef}
        className="reader-page mx-auto box-border flex h-full w-full max-w-[720px] flex-col overflow-hidden"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: String(lineHeight),
          padding: marginStyle(pageMargin),
          ["--reader-font-size" as string]: `${fontSize}px`,
          ["--reader-line-height" as string]: String(lineHeight),
        }}
      >
        <div className="reader-page-inner min-h-0 flex-1 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {pageText}
        </div>
      </div>

      {/* 侧边热区提示（极淡，不挡阅读） */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[12%] opacity-0 sm:opacity-0"
        aria-hidden
      />
    </div>
  );
}
