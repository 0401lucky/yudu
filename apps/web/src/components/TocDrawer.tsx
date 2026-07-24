import type { BookmarkDto, ChapterMeta } from "@yudu/shared";
import { useState } from "react";

interface TocDrawerProps {
  open: boolean;
  chapters: ChapterMeta[];
  currentIndex: number;
  bookmarks: BookmarkDto[];
  onClose: () => void;
  onSelect: (index: number) => void;
  onSelectBookmark: (mark: BookmarkDto) => void;
  onRemoveBookmark: (mark: BookmarkDto) => void;
}

export default function TocDrawer({
  open,
  chapters,
  currentIndex,
  bookmarks,
  onClose,
  onSelect,
  onSelectBookmark,
  onRemoveBookmark,
}: TocDrawerProps) {
  const [tab, setTab] = useState<"toc" | "marks">("toc");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭目录"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-[min(100%,18rem)] max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] pt-[env(safe-area-inset-top)] shadow-xl sm:w-80">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
          <TabButton active={tab === "toc"} onClick={() => setTab("toc")}>
            目录
          </TabButton>
          <TabButton active={tab === "marks"} onClick={() => setTab("marks")}>
            书签{bookmarks.length ? ` (${bookmarks.length})` : ""}
          </TabButton>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center rounded px-3 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            关闭
          </button>
        </div>

        {tab === "toc" ? (
          <ul className="flex-1 overflow-y-auto overscroll-contain py-1 pb-[env(safe-area-inset-bottom)]">
            {chapters.map((ch) => {
              const active = ch.index === currentIndex;
              return (
                <li key={ch.index}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(ch.index);
                      onClose();
                    }}
                    className={`w-full px-3 py-3 text-left text-sm leading-snug transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4 sm:py-2.5 ${
                      active
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : "text-[var(--text)] hover:bg-[var(--bg)]"
                    }`}
                  >
                    {ch.title}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="flex-1 overflow-y-auto overscroll-contain py-1 pb-[env(safe-area-inset-bottom)]">
            {bookmarks.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                还没有书签。阅读时点顶栏书签图标即可添加。
              </li>
            ) : (
              bookmarks.map((mark) => (
                <li key={mark.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBookmark(mark);
                      onClose();
                    }}
                    className="min-w-0 flex-1 px-3 py-3 text-left text-sm leading-snug text-[var(--text)] hover:bg-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4"
                  >
                    <span className="block truncate">{mark.label}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                      第 {mark.chapterIndex + 1} 章 · 约{" "}
                      {chapterPercent(chapters, mark)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveBookmark(mark)}
                    aria-label="删除书签"
                    className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    ✕
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** 书签在章内的近似百分比位置（展示用） */
function chapterPercent(chapters: ChapterMeta[], mark: BookmarkDto): number {
  const charCount =
    chapters.find((ch) => ch.index === mark.chapterIndex)?.charCount ?? 0;
  if (charCount <= 0) return 0;
  return Math.min(100, Math.round((mark.charOffset / charCount) * 100));
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 items-center rounded-lg px-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        active
          ? "bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)]"
      }`}
    >
      {children}
    </button>
  );
}
