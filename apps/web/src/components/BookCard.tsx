import type { BookSummary } from "@yudu/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface BookCardProps {
  book: BookSummary;
  onDelete: (bookId: string) => void;
  deleting?: boolean;
}

function statusLabel(status: BookSummary["status"]): string | null {
  if (status === "processing") return "处理中";
  if (status === "failed") return "失败";
  return null;
}

export default function BookCard({ book, onDelete, deleting }: BookCardProps) {
  const navigate = useNavigate();
  const [coverFailed, setCoverFailed] = useState(false);
  const badge = statusLabel(book.status);
  const canOpen = book.status === "ready";

  function handleOpen() {
    if (!canOpen) return;
    navigate(`/read/${book.id}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (deleting) return;
    const ok = window.confirm(`确定删除《${book.title}》？此操作不可恢复。`);
    if (ok) onDelete(book.id);
  }

  return (
    <article
      className={`group relative flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] transition-all duration-200 ${
        canOpen
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 focus-within:ring-2 focus-within:ring-[var(--accent)]"
          : "opacity-90"
      }`}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (canOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleOpen();
        }
      }}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen ? `打开《${book.title}》` : `《${book.title}》${badge ?? ""}`}
    >
      {/* 封面 2:3 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-lg bg-[var(--bg)]">
        {book.coverUrl && !coverFailed ? (
          <img
            src={book.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
            <span className="line-clamp-3 text-sm font-medium text-[var(--accent)]">
              {book.title}
            </span>
            {book.author ? (
              <span className="line-clamp-1 text-xs text-[var(--text-muted)]">
                {book.author}
              </span>
            ) : null}
          </div>
        )}

        {badge ? (
          <span
            className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-medium ${
              book.status === "failed"
                ? "bg-red-900/80 text-red-200"
                : "bg-[var(--bg)]/80 text-[var(--accent)]"
            }`}
          >
            {badge}
          </span>
        ) : null}

        {book.status === "processing" ? (
          <div className="absolute inset-0 animate-pulse bg-[var(--accent)]/5" />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text)]">
          {book.title}
        </h3>
        {book.author ? (
          <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{book.author}</p>
        ) : null}

        {book.status === "failed" && book.errorMessage ? (
          <p className="line-clamp-2 text-xs text-red-400" title={book.errorMessage}>
            {book.errorMessage}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-[var(--text-muted)]">
            {book.status === "ready" && book.progressPercent != null
              ? `${book.progressPercent}%`
              : book.status === "ready"
                ? "未读"
                : book.format.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded px-1.5 py-1 text-xs text-[var(--text-muted)] opacity-80 hover:bg-red-950/40 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            aria-label={`删除《${book.title}》`}
          >
            {deleting ? "…" : "删除"}
          </button>
        </div>
      </div>
    </article>
  );
}
