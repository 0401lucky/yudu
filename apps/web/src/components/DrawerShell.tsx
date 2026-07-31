import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** 抽屉滑入滑出时长（250ms），关闭动画结束后卸载内容 */
const DRAWER_MS = 250;

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  /** 遮罩关闭按钮的 aria-label */
  overlayLabel: string;
  /** dialog 的 aria-label */
  ariaLabel: string;
  /** 面板内容——打开时才渲染（如目录章节列表，避免常驻渲染），关闭动画结束后卸载 */
  children: ReactNode;
  /** 内容渲染完成后回调（打开时首轮渲染为 null，调用方如需自动聚焦首个焦点元素应在此回调中做） */
  onContentMounted?: () => void;
}

/** 左侧全高抽屉外壳：常驻挂载 + 250ms 水平滑入滑出（面板 -translate-x-full→0，遮罩 fade 200ms）。
 *  键盘行为：Esc 关闭、遮罩点击关闭；打开时内容挂载（调用方负责聚焦首个焦点元素）；
 *  关闭动画期间 aria-hidden + pointer-events-none，动画结束后卸载内容（避免 Tab 进入不可见内容）。 */
export default function DrawerShell({
  open,
  onClose,
  overlayLabel,
  ariaLabel,
  children,
  onContentMounted,
}: DrawerShellProps) {
  // 内容渲染开关：打开立即渲染；关闭等动画播完再卸载
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), DRAWER_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // 内容渲染完成后通知调用方（如聚焦首个焦点元素；打开时首轮渲染为 null，input ref 尚不可用）
  useEffect(() => {
    if (open && rendered) onContentMounted?.();
  }, [open, rendered, onContentMounted]);

  // 关闭动画期间面板已移出屏幕但仍在 DOM，加 inert 禁止 Tab 聚焦（React 18 无 inert 类型，经 ref 设置）
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    asideRef.current?.toggleAttribute("inert", !open);
  }, [open, rendered]);

  // Escape 关闭抽屉（仅打开时监听；对齐 Sheet 惯例）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-40 flex ${open ? "" : "pointer-events-none"}`}
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
        className={`absolute inset-0 bg-[var(--overlay)] transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        ref={asideRef}
        className={`relative z-10 flex h-full w-[min(100%,18rem)] max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] pt-[env(safe-area-inset-top)] shadow-xl transition-transform duration-[250ms] ease-[var(--ease-out)] sm:w-80 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {children}
      </aside>
    </div>
  );
}
