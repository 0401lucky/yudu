import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

/**
 * 全站统一主/描边按钮。
 * - Primary：accent 实底，hover 背景色混合微暗（消除 opacity 瞬变）
 * - Outline：描边，hover 边框/文字变 accent
 * 默认 px-4 py-2 text-sm font-medium，调用方可传 className 覆盖尺寸；
 * 默认带 focus-visible:ring-2 ring-[var(--accent)] 焦点样式。
 */

export function PrimaryButton({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,var(--bg))] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
    >
      {children}
    </button>
  );
}

/** Link 形态的主按钮（如 Landing CTA、空态「去书架」入口） */
export function PrimaryButtonLink({
  className = "",
  children,
  ...rest
}: LinkProps) {
  return (
    <Link
      {...rest}
      className={`inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors duration-150 hover:bg-[color:color-mix(in_srgb,var(--accent)_88%,var(--bg))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
    >
      {children}
    </Link>
  );
}

/** Link 形态的描边按钮（如 Landing 登录、Library 导航、Studio 列表操作） */
export function OutlineButtonLink({
  className = "",
  children,
  ...rest
}: LinkProps) {
  return (
    <Link
      {...rest}
      className={`inline-block rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${className}`}
    >
      {children}
    </Link>
  );
}
