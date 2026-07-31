import type { HighlightColor } from "@yudu/shared";
import { HIGHLIGHT_COLORS } from "@yudu/shared";
import { useLayoutEffect, useRef, useState } from "react";

/** 气泡锚点：选区/命中高亮的视口（client）矩形 */
export interface PopoverAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface HighlightPopoverProps {
  anchor: PopoverAnchorRect;
  /** create=选区创建；edit=命中已有高亮（含删除） */
  mode: "create" | "edit";
  /** 编辑模式当前颜色（对应色点高亮显示） */
  currentColor?: HighlightColor;
  /** 创建模式选区超长：仅展示提示，不可标注 */
  overLimit?: boolean;
  /** 编辑模式当前高亮是否已有笔记（决定按钮文案） */
  hasNote?: boolean;
  onPick: (color: HighlightColor) => void;
  /** 写想法：create 模式先建高亮再开编辑；edit 模式直接开编辑 */
  onNote?: () => void;
  /** 分享书摘卡片（仅 edit 模式展示） */
  onShare?: () => void;
  onDelete?: () => void;
}

/** 色点底色：消费 --hl-* 变量（与正文高亮底色同源，night/paper 各自调色） */
const DOT_BG: Record<HighlightColor, string> = {
  yellow: "var(--hl-yellow)",
  green: "var(--hl-green)",
  blue: "var(--hl-blue)",
};
const DOT_LABEL: Record<HighlightColor, string> = {
  yellow: "黄色高亮",
  green: "绿色高亮",
  blue: "蓝色高亮",
};

/** 气泡与选区/屏幕边缘的间距 */
const GAP = 8;

/**
 * 高亮操作气泡：3 色圆点 +（编辑模式）删除按钮。
 * fixed 定位在锚点矩形上方，顶部放不下时翻转到下方；水平方向夹取在屏幕内。
 * 点外部关闭由 useReaderHighlights 统一处理（依据 data-hl-popover 标记）。
 */
export default function HighlightPopover({
  anchor,
  mode,
  currentColor,
  overLimit = false,
  hasNote = false,
  onPick,
  onNote,
  onShare,
  onDelete,
}: HighlightPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // 先隐形渲染测量自身尺寸，再定位（越界翻转）
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    let top = anchor.top - h - GAP;
    if (top < GAP) top = anchor.bottom + GAP;
    const centerX = (anchor.left + anchor.right) / 2;
    const left = Math.min(
      Math.max(GAP, centerX - w / 2),
      Math.max(GAP, window.innerWidth - w - GAP),
    );
    setPos({ left, top });
  }, [anchor, mode, overLimit]);

  return (
    <div
      ref={rootRef}
      data-hl-popover
      role="toolbar"
      aria-label={mode === "create" ? "创建标注" : "编辑标注"}
      className="fixed z-50 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-xl"
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: 0, top: 0, visibility: "hidden" }
      }
      // 阻断视口手势：气泡内按下不应触发翻页/滚动切换
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {overLimit ? (
        <span className="px-1 text-xs text-[var(--text-muted)]">
          选区过长，无法标注
        </span>
      ) : (
        <>
          {HIGHLIGHT_COLORS.map((color) => {
            const active = mode === "edit" && color === currentColor;
            return (
              <button
                key={color}
                type="button"
                aria-label={DOT_LABEL[color]}
                aria-pressed={active}
                onClick={() => onPick(color)}
                className={`h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  active
                    ? "ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--bg-elevated)]"
                    : ""
                }`}
                style={{ backgroundColor: DOT_BG[color] }}
              />
            );
          })}
          {onNote ? (
            <>
              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--border)]"
              />
              <button
                type="button"
                aria-label={
                  mode === "create"
                    ? "高亮并写想法"
                    : hasNote
                      ? "编辑想法"
                      : "写想法"
                }
                onClick={onNote}
                className="flex h-7 items-center rounded-full px-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                {mode === "create" ? "想法" : hasNote ? "编辑想法" : "写想法"}
              </button>
            </>
          ) : null}
          {mode === "edit" && onShare ? (
            <>
              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--border)]"
              />
              <button
                type="button"
                aria-label="分享书摘"
                onClick={onShare}
                className="flex h-7 items-center rounded-full px-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                分享
              </button>
            </>
          ) : null}
          {mode === "edit" && onDelete ? (
            <>
              <span
                aria-hidden
                className="mx-0.5 h-5 w-px bg-[var(--border)]"
              />
              <button
                type="button"
                aria-label="删除标注"
                onClick={onDelete}
                className="flex h-7 items-center rounded-full px-2 text-sm text-[var(--text-muted)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                删除
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
