import type { BookSummary } from "@yudu/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface BookCardProps {
  book: BookSummary;
  onDelete: (bookId: string) => void;
  deleting?: boolean;
  /** 仅 md 书：从源文件重新解析 */
  onReparse?: (bookId: string) => void;
  reparsing?: boolean;
  /** 管理模式：卡片变复选，点击即勾选，不进阅读器 */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (bookId: string) => void;
}

function statusLabel(status: BookSummary["status"]): string | null {
  if (status === "processing") return "处理中";
  if (status === "failed") return "失败";
  return null;
}

export default function BookCard({
  book,
  onDelete,
  deleting,
  onReparse,
  reparsing,
  selectable,
  selected,
  onToggleSelect,
}: BookCardProps) {
  const navigate = useNavigate();
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const badge = statusLabel(book.status);
  const canOpen = book.status === "ready" && !selectable;
  const canReparse =
    !selectable &&
    book.format === "md" &&
    book.status === "ready" &&
    typeof onReparse === "function";

  function handleOpen() {
    if (selectable) {
      onToggleSelect?.(book.id);
      return;
    }
    if (!canOpen) return;
    navigate(`/read/${book.id}`);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (deleting || reparsing) return;
    const ok = window.confirm(`确定删除《${book.title}》？此操作不可恢复。`);
    if (ok) onDelete(book.id);
  }

  function handleReparse(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!canReparse || reparsing || deleting) return;
    const ok = window.confirm(
      `重新解析《${book.title}》？将从源文件重建章节，进度尽量保留在原章节。`,
    );
    if (ok) onReparse?.(book.id);
  }

  return (
    <article
      className={`group relative flex flex-col rounded-xl border bg-[var(--bg-elevated)] transition-all duration-200 ${
        selectable && selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
          : "border-[var(--border)]"
      } ${
        selectable
          ? "cursor-pointer"
          : canOpen
            ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 focus-within:ring-2 focus-within:ring-[var(--accent)]"
            : "opacity-90"
      }`}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if ((selectable || canOpen) && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleOpen();
        }
      }}
      role={selectable ? "checkbox" : canOpen ? "button" : undefined}
      aria-checked={selectable ? !!selected : undefined}
      tabIndex={selectable || canOpen ? 0 : undefined}
      aria-label={
        selectable
          ? `选择《${book.title}》`
          : canOpen
            ? `打开《${book.title}》`
            : `《${book.title}》${badge ?? ""}`
      }
    >
      {/* 封面 2:3 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-lg bg-[var(--bg)]">
        {book.coverUrl && !coverFailed ? (
          <img
            src={book.coverUrl}
            alt=""
            className={`h-full w-full object-cover transition-opacity duration-150 ${
              coverLoaded ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            // 缓存命中时 load 事件在 React 监听挂载前已派发，ref 挂载时 complete 兜底
            ref={(el) => {
              if (el && el.complete) setCoverLoaded(true);
            }}
            onLoad={() => setCoverLoaded(true)}
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
                ? "bg-[var(--danger-weak)] text-[var(--danger)]"
                : "bg-[color:color-mix(in_srgb,var(--bg)_80%,transparent)] text-[var(--accent)]"
            }`}
          >
            {badge}
          </span>
        ) : null}

        {/* 管理模式复选浮层：右上角勾选圆点 */}
        {selectable ? (
          <span
            aria-hidden="true"
            className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${
              selected
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
                : "border-[var(--border)] bg-[color:color-mix(in_srgb,var(--bg)_80%,transparent)] text-transparent"
            }`}
          >
            ✓
          </span>
        ) : null}

        {/* PDF 格式徽标：与状态徽标分居两角（管理模式让位给复选点） */}
        {book.format === "pdf" && !selectable ? (
          <span className="absolute right-2 top-2 rounded bg-[color:color-mix(in_srgb,var(--bg)_80%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--accent)]">
            PDF
          </span>
        ) : null}

        {book.source === "studio" && !selectable ? (
          <span className="absolute bottom-2 left-2 rounded bg-[color:color-mix(in_srgb,var(--bg)_80%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
            {book.breakLimit ? "创作·破限" : "创作"}
          </span>
        ) : null}

        {book.status === "processing" ? (
          <div className="absolute inset-0 animate-pulse bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)]" />
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
          <p className="line-clamp-2 text-xs text-[var(--danger)]" title={book.errorMessage}>
            {book.errorMessage}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-[var(--text-muted)]">
            {book.status === "ready" && book.progressPercent != null
              ? `${book.progressPercent}%`
              : book.status === "ready"
                ? book.format === "pdf"
                  ? "—" // PDF 无章节字数，算不出百分比，显示占位
                  : "未读"
                : book.format.toUpperCase()}
          </span>
          <div
            className={`flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${
              selectable ? "hidden" : ""
            }`}
          >
            {book.source === "studio" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  navigate(`/studio/${book.id}`);
                }}
                className="rounded px-1.5 py-1 text-xs text-[var(--text-muted)] opacity-80 hover:bg-[var(--bg)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                aria-label={`继续创作《${book.title}》`}
              >
                创作
              </button>
            ) : null}
            {canReparse ? (
              <button
                type="button"
                onClick={handleReparse}
                disabled={reparsing || deleting}
                className="rounded px-1.5 py-1 text-xs text-[var(--text-muted)] opacity-80 hover:bg-[var(--bg)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
                aria-label={`重新解析《${book.title}》`}
              >
                {reparsing ? "解析中…" : "重新解析"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || reparsing}
              className="rounded px-1.5 py-1 text-xs text-[var(--text-muted)] opacity-80 hover:bg-[var(--danger-weak)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              aria-label={`删除《${book.title}》`}
            >
              {deleting ? "…" : "删除"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
