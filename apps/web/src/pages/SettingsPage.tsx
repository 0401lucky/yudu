import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

/** 设置占位页（完整偏好 UI 在后续任务） */
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onLogout() {
    setError(null);
    setSubmitting(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "登出失败";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">设置</h1>
        <Link
          to="/library"
          className="text-sm text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
        >
          返回书架
        </Link>
      </header>

      <section className="mx-auto mt-8 max-w-lg space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm text-[var(--text-muted)]">账号</h2>
          <p className="mt-2 text-[var(--text)]">{user?.email ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm text-[var(--text-muted)]">阅读偏好</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            主题、字号等设置将在后续版本提供。
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onLogout}
          disabled={submitting}
          className="w-full rounded-lg border border-[var(--border)] py-2.5 text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {submitting ? "退出中…" : "退出登录"}
        </button>
      </section>
    </main>
  );
}
