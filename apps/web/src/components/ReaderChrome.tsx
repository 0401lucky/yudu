import type { UserPreferences } from "@yudu/shared";
import { Link } from "react-router-dom";

interface ReaderChromeProps {
  visible: boolean;
  title: string;
  chapterTitle: string;
  pageLabel: string;
  prefs: UserPreferences;
  onOpenToc: () => void;
  onPrefs: (partial: Partial<UserPreferences>) => void;
}

/** 顶栏：参与文档流，不再 fixed，避免挡住正文 */
export function ReaderHeader({
  visible,
  title,
  chapterTitle,
  onOpenToc,
}: Pick<
  ReaderChromeProps,
  "visible" | "title" | "chapterTitle" | "onOpenToc"
>) {
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
          onClick={onOpenToc}
          className="flex h-10 shrink-0 items-center rounded px-2.5 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          目录
        </button>
      </div>
    </header>
  );
}

/** 底栏：参与文档流 */
export function ReaderFooter({
  visible,
  pageLabel,
  prefs,
  onPrefs,
}: Pick<ReaderChromeProps, "visible" | "pageLabel" | "prefs" | "onPrefs">) {
  if (!visible) return null;
  return (
    <footer className="reader-chrome shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:py-2">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)] sm:text-xs">
          {pageLabel}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            onClick={() =>
              onPrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })
            }
            aria-label="减小字号"
          >
            A−
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            onClick={() =>
              onPrefs({ fontSize: Math.min(28, prefs.fontSize + 1) })
            }
            aria-label="增大字号"
          >
            A+
          </button>
          <button
            type="button"
            className="flex h-10 items-center rounded px-2 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            onClick={() =>
              onPrefs({
                theme: prefs.theme === "night" ? "paper" : "night",
              })
            }
          >
            {prefs.theme === "night" ? "纸页" : "夜读"}
          </button>
        </div>
      </div>
    </footer>
  );
}

/** 兼容旧 import（若有） */
export default function ReaderChrome(props: ReaderChromeProps) {
  return (
    <>
      <ReaderHeader {...props} />
      <ReaderFooter {...props} />
    </>
  );
}
