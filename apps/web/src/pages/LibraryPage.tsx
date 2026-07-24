import type { BookSummary, DailyReadingStat } from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BookCard from "../components/BookCard";
import ImportDropzone from "../components/ImportDropzone";
import ReadingStatsBar from "../components/ReadingStatsBar";
import {
  ApiError,
  deleteBook,
  getReadingStats,
  importBooks,
  listBooks,
  reparseBook,
} from "../lib/api";
import { useAuth } from "../lib/auth";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_TIMES = 60;

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

  const empty = !loading && books.length === 0;
  const importDisabled = importing; // 不再用 loading 锁导入按钮，避免「一直点不了」

  return (
    <main className="min-h-full p-6 md:p-10">
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
            to="/settings"
            className="rounded text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            设置
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
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={handleDelete}
                deleting={deletingId === book.id}
                onReparse={handleReparse}
                reparsing={reparsingId === book.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
