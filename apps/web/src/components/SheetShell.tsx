import type { ReactNode } from "react";

interface SheetShellProps {
  open: boolean;
  onClose: () => void;
  /** 遮罩关闭按钮的 aria-label（必须，供读屏朗读关闭入口） */
  overlayLabel: string;
  /** dialog 的 aria-label（可选，保持调用方现状） */
  ariaLabel?: string;
  /** 面板内容（常驻渲染，与现有 Sheet 行为一致） */
  children: ReactNode;
}

/** 底部滑入 Sheet 外壳：遮罩 + rounded-t-2xl 面板 + 顶部拖拽把手 + 300ms 滑入滑出。
 *  常驻挂载模式：关闭时面板下移 + 遮罩淡出，内容保留在 DOM（与 NoteEditorSheet 现状一致）。 */
export default function SheetShell({
  open,
  onClose,
  overlayLabel,
  ariaLabel,
  children,
}: SheetShellProps) {
  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label={overlayLabel}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg-elevated)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" />
        {children}
      </div>
    </div>
  );
}
