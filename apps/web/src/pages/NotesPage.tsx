import type { HighlightWithChapter, NotesBookGroup } from "@yudu/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NoteEditorSheet from "../components/NoteEditorSheet";
import {
  ApiError,
  deleteHighlight,
  getNotes,
  updateHighlightNote,
} from "../lib/api";

/** 列表小圆点颜色（与 HighlightPopover 取色一致） */
const HL_DOT_COLOR: Record<HighlightWithChapter["color"], string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
};

/** 编辑目标：书 + 高亮 id（保存/清除时定位） */
interface EditTarget {
  bookId: string;
  highlight: HighlightWithChapter;
}

export default function NotesPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<NotesBookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getNotes();
        if (!cancelled) setGroups(data);
      } catch (err) {
        if (!cancelled) setError(errMessage(err, "加载笔记失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 操作失败提示：短暂展示后自动消失
  useEffect(() => {
    if (!error || loading) return;
    const timer = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(timer);
  }, [error, loading]);

  const jumpTo = useCallback(
    (bookId: string, hl: HighlightWithChapter) => {
      navigate(
        `/read/${encodeURIComponent(bookId)}?chapter=${hl.chapterIndex}&offset=${hl.startOffset}`,
      );
    },
    [navigate],
  );

  const handleRemove = useCallback(
    async (bookId: string, hl: HighlightWithChapter) => {
      if (!window.confirm("删除这条标注（连同笔记）？")) return;
      // 乐观移除，失败回滚
      setGroups((prev) => removeFromGroups(prev, bookId, hl.id));
      try {
        await deleteHighlight(bookId, hl.id);
      } catch (err) {
        // 云端已不存在视为删除成功
        if (err instanceof ApiError && err.status === 404) return;
        setGroups((prev) => restoreToGroups(prev, bookId, hl));
        setError(errMessage(err, "删除标注失败，请稍后重试"));
      }
    },
    [],
  );

  const handleSaveNote = useCallback(
    async (text: string) => {
      const target = editTarget;
      setEditTarget(null);
      if (!target) return;
      const normalized = text.trim() || null;
      if ((target.highlight.note ?? null) === normalized) return;
      // 乐观更新，失败回滚
      setGroups((prev) =>
        patchNoteInGroups(prev, target.bookId, target.highlight.id, normalized),
      );
      try {
        await updateHighlightNote(target.bookId, target.highlight.id, normalized);
      } catch (err) {
        setGroups((prev) =>
          patchNoteInGroups(
            prev,
            target.bookId,
            target.highlight.id,
            target.highlight.note,
          ),
        );
        setError(errMessage(err, "保存笔记失败，请稍后重试"));
      }
    },
    [editTarget],
  );

  const handleExport = useCallback((group: NotesBookGroup) => {
    const md = buildMarkdown(group);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `《${group.bookTitle}》笔记.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // 乐观删除后可能出现空组：渲染时过滤
  const visibleGroups = groups.filter((g) => g.highlights.length > 0);
  const empty = !loading && visibleGroups.length === 0;

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">
          雨读
        </h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/library"
            className="rounded text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            书架
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-8 max-w-4xl">
        <div className="mb-6">
          <h2 className="text-2xl font-medium text-[var(--text)]">我的笔记</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {loading
              ? "加载中…"
              : visibleGroups.length > 0
                ? `${visibleGroups.length} 本书 · 共 ${visibleGroups.reduce((n, g) => n + g.highlights.length, 0)} 条标注`
                : "暂无标注"}
          </p>
        </div>

        {error ? (
          <p
            className="mb-4 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl bg-[var(--bg-elevated)]"
              />
            ))}
          </div>
        ) : empty ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-center">
            <p className="text-lg text-[var(--text)]">还没有任何标注</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              阅读时选中正文文字即可高亮，点击高亮还能写下想法。
            </p>
            <Link
              to="/library"
              className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              去书架
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => (
              <article
                key={group.bookId}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-medium text-[var(--text)]">
                      {group.bookTitle}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {group.bookAuthor ? `${group.bookAuthor} · ` : ""}
                      {group.highlights.length} 条标注
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExport(group)}
                    className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    导出 Markdown
                  </button>
                </div>

                <ul>
                  {group.highlights.map((hl) => (
                    <li
                      key={hl.id}
                      className="flex items-start gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => jumpTo(group.bookId, hl)}
                        className="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <span className="flex items-start gap-1.5">
                          <span
                            aria-hidden
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: HL_DOT_COLOR[hl.color] }}
                          />
                          <span className="min-w-0 flex-1 text-sm leading-snug text-[var(--text)]">
                            {hl.excerpt || "（无摘录）"}
                          </span>
                        </span>
                        {hl.note ? (
                          <span className="mt-1.5 block rounded bg-[var(--bg)] px-2 py-1.5 text-sm leading-snug text-[var(--text-muted)]">
                            {hl.note}
                          </span>
                        ) : null}
                        <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                          {hl.chapterTitle} · {formatDate(hl.createdAt)}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setEditTarget({ bookId: group.bookId, highlight: hl })
                          }
                          className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        >
                          {hl.note ? "编辑想法" : "写想法"}
                        </button>
                        <button
                          type="button"
                          aria-label="删除标注"
                          onClick={() => void handleRemove(group.bookId, hl)}
                          className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <NoteEditorSheet
        open={editTarget != null}
        excerpt={editTarget?.highlight.excerpt ?? ""}
        initialNote={editTarget?.highlight.note ?? ""}
        onClose={() => setEditTarget(null)}
        onSave={(text) => void handleSaveNote(text)}
      />
    </main>
  );
}

/** 按章节顺序生成导出 Markdown：书名标题 + 「> 摘录 / 笔记」列表 */
function buildMarkdown(group: NotesBookGroup): string {
  const lines: string[] = [`# 《${group.bookTitle}》笔记`, ""];
  if (group.bookAuthor) {
    lines.push(`作者：${group.bookAuthor}`, "");
  }
  let lastChapter: string | null = null;
  for (const hl of group.highlights) {
    if (hl.chapterTitle !== lastChapter) {
      lines.push(`## ${hl.chapterTitle}`, "");
      lastChapter = hl.chapterTitle;
    }
    lines.push(`> ${hl.excerpt || "（无摘录）"}`, "");
    if (hl.note) {
      lines.push(hl.note, "");
    }
  }
  return lines.join("\n");
}

/** 乐观删除：仅清空条目、保留组（渲染时过滤空组），回滚时组信息不丢失 */
function removeFromGroups(
  groups: NotesBookGroup[],
  bookId: string,
  highlightId: string,
): NotesBookGroup[] {
  return groups.map((g) =>
    g.bookId === bookId
      ? { ...g, highlights: g.highlights.filter((h) => h.id !== highlightId) }
      : g,
  );
}

/** 删除失败回滚：按章序 + 起点插回原位 */
function restoreToGroups(
  groups: NotesBookGroup[],
  bookId: string,
  hl: HighlightWithChapter,
): NotesBookGroup[] {
  return groups.map((g) => {
    if (g.bookId !== bookId || g.highlights.some((h) => h.id === hl.id)) {
      return g;
    }
    const highlights = [...g.highlights, hl].sort(
      (a, b) =>
        a.chapterIndex - b.chapterIndex || a.startOffset - b.startOffset,
    );
    return { ...g, highlights };
  });
}

function patchNoteInGroups(
  groups: NotesBookGroup[],
  bookId: string,
  highlightId: string,
  note: string | null,
): NotesBookGroup[] {
  return groups.map((g) =>
    g.bookId === bookId
      ? {
          ...g,
          highlights: g.highlights.map((h) =>
            h.id === highlightId ? { ...h, note } : h,
          ),
        }
      : g,
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
