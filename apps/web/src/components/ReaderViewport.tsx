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

const MARGIN_PAD: Record<string, string> = {
  compact: "1rem",
  normal: "1.5rem",
  relaxed: "2rem",
};

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
  const moved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    moved.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startX.current == null) return;
    if (Math.abs(e.clientX - startX.current) > 10) moved.current = true;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (startX.current == null) return;
      const dx = e.clientX - startX.current;
      startX.current = null;
      if (Math.abs(dx) > 50) {
        if (dx < 0) onNext();
        else onPrev();
        return;
      }
      if (moved.current) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      if (ratio < 0.3) onPrev();
      else if (ratio > 0.7) onNext();
      else onToggleChrome();
    },
    [onNext, onPrev, onToggleChrome],
  );

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 items-stretch justify-center bg-[var(--page-bg)]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        startX.current = null;
      }}
    >
      <div
        ref={contentRef}
        className="reader-page mx-auto flex h-full w-full max-w-[720px] flex-col overflow-hidden"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: String(lineHeight),
          padding: MARGIN_PAD[pageMargin] ?? MARGIN_PAD.normal,
          ["--reader-font-size" as string]: `${fontSize}px`,
          ["--reader-line-height" as string]: String(lineHeight),
        }}
      >
        <div className="reader-page-inner min-h-0 flex-1 whitespace-pre-wrap break-words">
          {pageText}
        </div>
      </div>
    </div>
  );
}
