import { MAX_BOOK_GROUP_CHARS } from "@yudu/shared";
import type { BookSummary, DailyReadingStat } from "@yudu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BookCard from "../components/BookCard";
import ImportDropzone from "../components/ImportDropzone";
import ReadingStatsBar from "../components/ReadingStatsBar";
import ShelfToolbar, {
  isShelfSortBy,
  SHELF_SORT_KEY,
  type ShelfSortBy,
} from "../components/ShelfToolbar";
import {
  ApiError,
  deleteBook,
  getReadingStats,
  importBooks,
  listBooks,
  reparseBook,
  updateBookGroup,
} from "../lib/api";
import { useAuth } from "../lib/auth";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TIMES = 60;

function readStoredSort(): ShelfSortBy {
  if (typeof localStorage === "undefined") return "recent-read";
  try {
    const raw = localStorage.getItem(SHELF_SORT_KEY);
    return isShelfSortBy(raw) ? raw : "recent-read";
  } catch {
    return "recent-read";
  }
}

function compareBooks(
  a: BookSummary,
  b: BookSummary,
  sortBy: ShelfSortBy,
): number {
  if (sortBy === "recent-read") {
    // 无阅读记录（null）排最后
    return (b.lastReadAt ?? -1) - (a.lastReadAt ?? -1);
  }
  if (sortBy === "recent-import") return b.createdAt - a.createdAt;
  return a.title.localeCompare(b.title, "zh");
}

export default function LibraryPage() {
  const { user } = useAuth();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reparsingId, setReparsingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollEpoch, setPollEpoch] = useState(0);
  const pollEpochRef = useRef(0);
  // 阅读统计：null = 加载中；"error" = 拉取失败（静默隐藏统计条）
  const [statsDays, setStatsDays] = useState<
    DailyReadingStat[] | null | "error"
  >(null);
  // 排序 / 分组筛选 / 管理模式
  const [sortBy, setSortBy] = useState<ShelfSortBy>(readStoredSort);
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [manageMode, setManageMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getReadingStats();
        if (!cancelled) setStatsDays(res.days);
      } catch {
        // 统计非关键数据，失败静默降级
        if (!cancelled) setStatsDays("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBooks = useCallback(async (): Promise<BookSummary[]> => {
    const list = await listBooks();
    setBooks(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await listBooks();
        if (cancelled) return;
        setBooks(list);
        if (list.some((b) => b.status === "processing")) {
          setPollEpoch((e) => e + 1);
        }
      } catch (err) {
        if (cancelled) return;
        setError(errMessage(err, "加载书架失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pollEpoch === 0) return;
    pollEpochRef.current = pollEpoch;
    let cancelled = false;
    let times = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      if (cancelled || times >= POLL_MAX_TIMES) return;
      timer = setTimeout(async () => {
        if (cancelled || pollEpochRef.current !== pollEpoch) return;
        times += 1;
        try {
          const list = await listBooks();
          if (cancelled || pollEpochRef.current !== pollEpoch) return;
          setBooks(list);
          if (list.some((b) => b.status === "processing")) {
            tick();
          }
        } catch {
          if (!cancelled && pollEpochRef.current === pollEpoch) {
            tick();
          }
        }
      }, POLL_INTERVAL_MS);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [pollEpoch]);

  const handleImport = useCallback(
    async (files: File[]) => {
      setError(null);
      setImportStatus(`正在上传 ${files.length} 个文件…`);
      setImporting(true);
      try {
        console.info(
          "[雨读] 开始导入",
          files.map((f) => `${f.name}(${f.size})`),
        );
        const summaries = await importBooks(files);
        console.info("[雨读] 导入结果", summaries);
        if (!summaries.length) {
          setError("导入完成但没有返回书籍，请重试");
          setImportStatus(null);
          return;
        }
        setBooks((prev) => {
          const ids = new Set(summaries.map((s) => s.id));
          const without = prev.filter((b) => !ids.has(b.id));
          return [...summaries, ...without];
        });
        const list = await refreshBooks();
        if (list.some((b) => b.status === "processing")) {
          setPollEpoch((e) => e + 1);
        }
        const failed = summaries.filter((s) => s.status === "failed");
        const ready = summaries.filter((s) => s.status === "ready");
        if (failed.length) {
          setError(
            failed
              .map((s) => `《${s.title}》: ${s.errorMessage ?? "失败"}`)
              .join("；"),
          );
          setImportStatus(null);
        } else {
          setError(null);
          const names = ready.map((s) => `《${s.title}》(${s.chapterCount}章)`);
          setImportStatus(
            `导入成功：${names.join("、")}（同名系列会自动追加到已有书）`,
          );
        }
      } catch (err) {
        console.error("[雨读] 导入失败", err);
        setImportStatus(null);
        setError(errMessage(err, "导入失败"));
      } finally {
        setImporting(false);
      }
    },
    [refreshBooks],
  );

  async function handleDelete(bookId: string) {
    setError(null);
    setDeletingId(bookId);
    try {
      await deleteBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
    } catch (err) {
      setError(errMessage(err, "删除失败"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReparse(bookId: string) {
    setError(null);
    setImportStatus(null);
    setReparsingId(bookId);
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, status: "processing" as const } : b,
      ),
    );
    try {
      const summary = await reparseBook(bookId);
      setBooks((prev) => prev.map((b) => (b.id === bookId ? summary : b)));
      setImportStatus(
        `重新解析成功：《${summary.title}》（${summary.chapterCount} 章）`,
      );
      if (summary.status === "processing") {
        setPollEpoch((e) => e + 1);
      }
    } catch (err) {
      try {
        await refreshBooks();
      } catch {
        // ignore
      }
      setError(errMessage(err, "重新解析失败"));
    } finally {
      setReparsingId(null);
    }
  }

  // 分组 tabs 数据：由书列表派生（空分组自然消失）
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) {
      if (b.group) counts.set(b.group, (counts.get(b.group) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }, [books]);

  // 当前分组消失（最后一本被移出/删除）时回到「全部」
  useEffect(() => {
    if (activeGroup !== "all" && !groups.some((g) => g.name === activeGroup)) {
      setActiveGroup("all");
    }
  }, [groups, activeGroup]);

  const visibleBooks = useMemo(() => {
    const filtered =
      activeGroup === "all"
        ? books
        : books.filter((b) => b.group === activeGroup);
    return [...filtered].sort((a, b) => compareBooks(a, b, sortBy));
  }, [books, activeGroup, sortBy]);

  const selectedBooks = useMemo(
    () => books.filter((b) => selected.has(b.id)),
    [books, selected],
  );
  const allVisibleSelected =
    visibleBooks.length > 0 && visibleBooks.every((b) => selected.has(b.id));

  function handleSortChange(next: ShelfSortBy) {
    setSortBy(next);
    try {
      localStorage.setItem(SHELF_SORT_KEY, next);
    } catch {
      // 隐私模式等写入失败时静默
    }
  }

  function handleToggleManage() {
    setManageMode((prev) => !prev);
    setSelected(new Set());
    setGroupPickerOpen(false);
    setNewGroupName("");
    setPickerError(null);
  }

  function handleToggleSelect(bookId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  function handleToggleSelectAll() {
    if (allVisibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleBooks.map((b) => b.id)));
    }
  }

  /** 批量删除：确认后串行调用单本 DELETE，失败项汇总提示 */
  async function handleBatchDelete() {
    const targets = selectedBooks;
    if (!targets.length || batchBusy) return;
    const ok = window.confirm(
      `确定删除选中的 ${targets.length} 本书？此操作不可恢复。`,
    );
    if (!ok) return;
    setError(null);
    setImportStatus(null);
    setBatchBusy(true);
    const failed: string[] = [];
    for (const { id, title } of targets) {
      try {
        await deleteBook(id);
        setBooks((prev) => prev.filter((b) => b.id !== id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        failed.push(`《${title}》`);
      }
    }
    setBatchBusy(false);
    if (failed.length) {
      setError(`删除失败：${failed.join("、")}`);
    } else {
      setImportStatus(`已删除 ${targets.length} 本`);
    }
  }

  /** 批量移动分组：串行 PATCH，group 为 null 表示移出分组 */
  async function handleBatchMove(group: string | null) {
    const targets = selectedBooks;
    if (!targets.length || batchBusy) return;
    setError(null);
    setImportStatus(null);
    setPickerError(null);
    setBatchBusy(true);
    const failed: string[] = [];
    for (const { id, title } of targets) {
      try {
        const summary = await updateBookGroup(id, group);
        setBooks((prev) => prev.map((b) => (b.id === id ? summary : b)));
      } catch {
        failed.push(`《${title}》`);
      }
    }
    setBatchBusy(false);
    setGroupPickerOpen(false);
    setNewGroupName("");
    if (failed.length) {
      setError(`移动失败：${failed.join("、")}`);
    } else {
      setSelected(new Set());
      setImportStatus(
        group
          ? `已移动 ${targets.length} 本到「${group}」`
          : `已将 ${targets.length} 本移出分组`,
      );
    }
  }

  /** 新建分组并移动：前端先校验分组名（trim 后 1–30 字符） */
  function handleCreateGroupAndMove() {
    const name = newGroupName.trim();
    if (!name) {
      setPickerError("请输入分组名");
      return;
    }
    if (name.length > MAX_BOOK_GROUP_CHARS) {
      setPickerError(`分组名不能超过 ${MAX_BOOK_GROUP_CHARS} 个字符`);
      return;
    }
    void handleBatchMove(name);
  }

  const empty = !loading && books.length === 0;
  const importDisabled = importing; // 不再用 loading 锁导入按钮，避免「一直点不了」

  return (
    <main
      className={`min-h-full p-6 md:p-10 ${manageMode ? "pb-28 md:pb-28" : ""}`}
    >
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">
          雨读
        </h1>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <span className="hidden sm:inline text-[var(--text-muted)]">
            {user?.email}
          </span>
          <ImportDropzone
            onFiles={handleImport}
            disabled={importDisabled}
            compact
            onLocalError={(msg) => {
              if (msg) setError(msg);
            }}
          />
          <Link
            to="/studio"
            title="创作台"
            aria-label="创作台"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] hover:border-[color:color-mix(in_srgb,var(--accent)_60%,transparent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <PenIcon />
            <span className="hidden sm:inline">创作台</span>
          </Link>
          <Link
            to="/notes"
            title="笔记"
            aria-label="笔记"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] hover:border-[color:color-mix(in_srgb,var(--accent)_60%,transparent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <NotebookIcon />
            <span className="hidden sm:inline">笔记</span>
          </Link>
          <Link
            to="/settings"
            title="设置"
            aria-label="设置"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text)] hover:border-[color:color-mix(in_srgb,var(--accent)_60%,transparent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <SettingsIcon />
            <span className="hidden sm:inline">设置</span>
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-8 max-w-6xl">
        {statsDays !== "error" ? <ReadingStatsBar days={statsDays} /> : null}

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-medium text-[var(--text)]">我的书架</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {loading
                ? "加载中…"
                : books.length > 0
                  ? `共 ${books.length} 本`
                  : "暂无书籍"}
            </p>
          </div>
        </div>

        {!loading && books.length > 0 ? (
          <ShelfToolbar
            sortBy={sortBy}
            onSortChange={handleSortChange}
            groups={groups}
            totalCount={books.length}
            activeGroup={activeGroup}
            onGroupChange={setActiveGroup}
            manageMode={manageMode}
            onToggleManage={handleToggleManage}
          />
        ) : null}

        {error ? (
          <p
            className="mb-4 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {importStatus ? (
          <p
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--accent)]"
            role="status"
          >
            {importStatus}
          </p>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[2/3] animate-pulse rounded-lg bg-[var(--bg-elevated)]"
              />
            ))}
          </div>
        ) : empty ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12">
            <p className="mb-6 text-center text-lg text-[var(--text)]">
              导入第一份文档或电子书，开始阅读
            </p>
            <div className="mx-auto max-w-md">
              <ImportDropzone
                onFiles={handleImport}
                disabled={importDisabled}
                onLocalError={(msg) => {
                  if (msg) setError(msg);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={handleDelete}
                deleting={deletingId === book.id}
                onReparse={handleReparse}
                reparsing={reparsingId === book.id}
                selectable={manageMode}
                selected={selected.has(book.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        )}
      </section>

      {/* 管理模式底部操作条 */}
      {manageMode ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="text-[var(--text)]">
              已选 {selectedBooks.length} 本
            </span>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              disabled={batchBusy || visibleBooks.length === 0}
              className="rounded px-2 py-1 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
            >
              {allVisibleSelected ? "取消全选" : "全选"}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setGroupPickerOpen((v) => !v);
                  setPickerError(null);
                }}
                disabled={batchBusy || selectedBooks.length === 0}
                aria-expanded={groupPickerOpen}
                className="rounded px-2 py-1 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
              >
                移动到分组
              </button>

              {groupPickerOpen ? (
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-lg shadow-black/30">
                  <p className="mb-2 text-xs text-[var(--text-muted)]">
                    移动 {selectedBooks.length} 本到：
                  </p>
                  <div className="mb-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {groups.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => void handleBatchMove(g.name)}
                        disabled={batchBusy}
                        className="rounded px-2 py-1 text-left text-[var(--text)] hover:bg-[var(--bg)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
                      >
                        {g.name}（{g.count}）
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void handleBatchMove(null)}
                      disabled={batchBusy}
                      className="rounded px-2 py-1 text-left text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
                    >
                      移出分组
                    </button>
                  </div>
                  <div className="flex gap-2 border-t border-[var(--border)] pt-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => {
                        setNewGroupName(e.target.value);
                        setPickerError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateGroupAndMove();
                      }}
                      maxLength={MAX_BOOK_GROUP_CHARS}
                      placeholder="新建分组…"
                      aria-label="新建分组名称"
                      className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleCreateGroupAndMove}
                      disabled={batchBusy}
                      className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
                    >
                      确定
                    </button>
                  </div>
                  {pickerError ? (
                    <p className="mt-2 text-xs text-red-400" role="alert">
                      {pickerError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void handleBatchDelete()}
              disabled={batchBusy || selectedBooks.length === 0}
              className="rounded px-2 py-1 text-red-400 hover:bg-red-950/40 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
            >
              {batchBusy ? "处理中…" : "删除"}
            </button>

            <span className="flex-1" />
            <button
              type="button"
              onClick={handleToggleManage}
              disabled={batchBusy}
              className="rounded px-2 py-1 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
            >
              退出
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

/** 图标风格对齐 ReaderChrome：18px 描边线稿，颜色随 currentColor */
function PenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 2v20" />
      <path d="M13 7h4M13 11h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
