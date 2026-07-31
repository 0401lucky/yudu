import type { UserPreferences } from "@yudu/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AiProviderSettings from "../components/AiProviderSettings";
import { useThemePrefs } from "../components/ThemeProvider";
import { ApiError } from "../lib/api";
import { AiClientError } from "../lib/aiClient";
import { useAuth } from "../lib/auth";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { prefs, setPrefs, loading } = useThemePrefs();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onLogout() {
    setError(null);
    setSubmitting(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errMessage(err, "登出失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function update(partial: Partial<UserPreferences>) {
    setError(null);
    setSaving(true);
    try {
      await setPrefs(partial);
    } catch (err) {
      setError(errMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="yudu-page-in min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">设置</h1>
        <Link
          to="/library"
          className="rounded text-sm text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          返回书架
        </Link>
      </header>

      <section className="mx-auto mt-8 max-w-lg space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm text-[var(--text-muted)]">账号</h2>
          <p className="mt-2 text-[var(--text)]">{user?.email ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
          <h2 className="text-sm text-[var(--text-muted)]">阅读偏好</h2>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">加载中…</p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">主题</span>
                <select
                  value={prefs.theme}
                  disabled={saving}
                  onChange={(e) =>
                    void update({
                      theme: e.target.value as UserPreferences["theme"],
                    })
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <option value="night">雨夜（深色）</option>
                  <option value="paper">纸页（浅色）</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  字号：{prefs.fontSize}px
                </span>
                <input
                  type="range"
                  min={14}
                  max={28}
                  value={prefs.fontSize}
                  disabled={saving}
                  onChange={(e) =>
                    void update({ fontSize: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  行距：{prefs.lineHeight.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={1.4}
                  max={2.2}
                  step={0.05}
                  value={prefs.lineHeight}
                  disabled={saving}
                  onChange={(e) =>
                    void update({ lineHeight: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">页边距</span>
                <select
                  value={prefs.pageMargin}
                  disabled={saving}
                  onChange={(e) =>
                    void update({
                      pageMargin: e.target
                        .value as UserPreferences["pageMargin"],
                    })
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <option value="compact">紧凑</option>
                  <option value="normal">适中</option>
                  <option value="relaxed">宽松</option>
                </select>
              </label>
            </>
          )}
        </div>

        <AiProviderSettings />

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onLogout}
          disabled={submitting}
          className="w-full rounded-lg border border-[var(--border)] py-2.5 text-[var(--text)] transition-colors duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {submitting ? "退出中…" : "退出登录"}
        </button>
      </section>
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
