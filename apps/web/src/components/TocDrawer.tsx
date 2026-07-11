import type { ChapterMeta } from "@yudu/shared";

interface TocDrawerProps {
  open: boolean;
  chapters: ChapterMeta[];
  currentIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}

export default function TocDrawer({
  open,
  chapters,
  currentIndex,
  onClose,
  onSelect,
}: TocDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭目录"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-[min(100%,20rem)] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--text)]">目录</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            关闭
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
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
                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
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
      </aside>
    </div>
  );
}
