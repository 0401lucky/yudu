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

export default function ReaderChrome({
  visible,
  title,
  chapterTitle,
  pageLabel,
  prefs,
  onOpenToc,
  onPrefs,
}: ReaderChromeProps) {
  return (
    <>
      <header
        className={`reader-chrome fixed left-0 right-0 top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-2 backdrop-blur-sm transition-transform duration-200 safe-top ${
          visible ? "translate-y-0" : "-translate-y-full pointer-events-none"
        }`}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            to="/library"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-sm text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            返回
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text)]">
              {title}
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {chapterTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenToc}
            className="min-h-[44px] rounded px-3 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            目录
          </button>
        </div>
      </header>

      <footer
        className={`reader-chrome fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 px-3 py-2 backdrop-blur-sm transition-transform duration-200 safe-bottom ${
          visible ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-muted)]">{pageLabel}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-h-[44px] rounded px-2 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onClick={() =>
                onPrefs({ fontSize: Math.max(14, prefs.fontSize - 1) })
              }
              aria-label="减小字号"
            >
              A−
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded px-2 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onClick={() =>
                onPrefs({ fontSize: Math.min(28, prefs.fontSize + 1) })
              }
              aria-label="增大字号"
            >
              A+
            </button>
            <button
              type="button"
              className="min-h-[44px] rounded px-2 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
    </>
  );
}
