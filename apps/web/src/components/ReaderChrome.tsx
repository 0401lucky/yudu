import { Link } from "react-router-dom";

interface HeaderProps {
  visible: boolean;
  title: string;
  chapterTitle: string;
  bookmarked: boolean;
  onOpenToc: () => void;
  onToggleBookmark: () => void;
}

/** 顶栏：参与文档流，不再 fixed，避免挡住正文 */
export function ReaderHeader({
  visible,
  title,
  chapterTitle,
  bookmarked,
  onOpenToc,
  onToggleBookmark,
}: HeaderProps) {
  if (!visible) return null;
  return (
    <header className="reader-chrome shrink-0 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1.5 sm:px-3 sm:py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-1 sm:gap-3">
        <Link
          to="/library"
          className="flex h-10 min-w-[2.75rem] shrink-0 items-center justify-center rounded text-sm text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          返回
        </Link>
        <div className="min-w-0 flex-1 py-0.5">
          <p className="truncate text-sm font-medium leading-tight text-[var(--text)]">
            {title}
          </p>
          <p className="truncate text-[11px] leading-tight text-[var(--text-muted)] sm:text-xs">
            {chapterTitle}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-label={bookmarked ? "移除书签" : "添加书签"}
          aria-pressed={bookmarked}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <BookmarkIcon filled={bookmarked} />
        </button>
        <button
          type="button"
          onClick={onOpenToc}
          className="flex h-10 shrink-0 items-center rounded px-2.5 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          目录
        </button>
      </div>
    </header>
  );
}

interface FooterProps {
  visible: boolean;
  pageLabel: string;
  /** 全书进度 0–1 */
  progress: number;
  onSeek: (ratio: number) => void;
  onToggleTheme: () => void;
  themeLabel: string;
  onOpenSettings: () => void;
}

/** 底栏：进度条 + 页码 + 快捷主题 + 设置入口 */
export function ReaderFooter({
  visible,
  pageLabel,
  progress,
  onSeek,
  onToggleTheme,
  themeLabel,
  onOpenSettings,
}: FooterProps) {
  if (!visible) return null;
  return (
    <footer className="reader-chrome shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:py-2">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
            {Math.round(progress * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => onSeek(Number(e.target.value) / 1000)}
            className="h-9 flex-1 accent-[var(--accent)]"
            aria-label="全书进度"
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)] sm:text-xs">
            {pageLabel}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex h-10 items-center rounded px-2 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {themeLabel}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex h-10 items-center rounded px-2 text-sm font-medium text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="阅读设置"
            >
              Aa
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "var(--accent)" : "none"}
      stroke={filled ? "var(--accent)" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
