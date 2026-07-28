import type { BookSummary } from "@yudu/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  createStudioBook,
  deleteBook,
  listStudioBooks,
} from "../lib/api";
import { isAiSettingsReady, loadAiSettings } from "../lib/aiSettings";
import { useAuth } from "../lib/auth";

export default function StudioListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(() => isAiSettingsReady());

  const refresh = useCallback(async () => {
    const list = await listStudioBooks();
    setBooks(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await refresh();
        if (!cancelled) setAiReady(isAiSettingsReady(loadAiSettings()));
      } catch (err) {
        if (!cancelled) setError(errMessage(err, "加载创作列表失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function onCreate() {
    setCreating(true);
    setError(null);
    try {
      const book = await createStudioBook({ title: "未命名作品" });
      navigate(`/studio/${book.id}`);
    } catch (err) {
      setError(errMessage(err, "新建失败"));
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(book: BookSummary) {
    const ok = window.confirm(
      `确定删除《${book.title}》？创作内容与章节将不可恢复。`,
    );
    if (!ok) return;
    try {
      await deleteBook(book.id);
      await refresh();
    } catch (err) {
      setError(errMessage(err, "删除失败"));
    }
  }

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">
            创作台
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {user?.email ?? ""} · AI 小说工作流
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            to="/library"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            书架
          </Link>
          <Link
            to="/settings"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            API 设置
          </Link>
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={creating}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--bg)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {creating ? "创建中…" : "新建作品"}
          </button>
        </nav>
      </header>

      <section className="mx-auto mt-8 max-w-4xl space-y-4">
        {!aiReady ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text)]">
            尚未配置 new-api。可先写设定与正文，生成前请到{" "}
            <Link to="/settings" className="text-[var(--accent)] underline">
              设置
            </Link>{" "}
            填写 Base URL、API Key 与模型（需中转允许本站 CORS）。
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-[var(--text-muted)]">加载中…</p>
        ) : books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center">
            <p className="text-[var(--text)]">还没有创作中的作品</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              从立项、人设、大纲到逐章生成，可选上架到书架继续阅读。
            </p>
            <button
              type="button"
              onClick={() => void onCreate()}
              disabled={creating}
              className="mt-6 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[var(--bg)] disabled:opacity-60"
            >
              开始第一部
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {books.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/studio/${b.id}`}
                    className="text-lg font-medium text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {b.title}
                    {b.breakLimit ? (
                      <span className="ml-2 rounded bg-rose-500/20 px-1.5 py-0.5 text-xs text-rose-300">
                        破限
                      </span>
                    ) : null}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {b.chapterCount} 章 ·{" "}
                    {b.onShelf ? "已上架" : "未上架"} · 更新{" "}
                    {new Date(b.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link
                    to={`/studio/${b.id}`}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
                  >
                    继续创作
                  </Link>
                  {b.onShelf ? (
                    <Link
                      to={`/read/${b.id}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
                    >
                      阅读
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onDelete(b)}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-red-300 hover:bg-red-500/10"
                  >
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
