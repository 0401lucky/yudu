import type { UserPreferences } from "@yudu/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useThemePrefs } from "../components/ThemeProvider";
import { ApiError } from "../lib/api";
import {
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "../lib/aiSettings";
import { useAuth } from "../lib/auth";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { prefs, setPrefs, loading } = useThemePrefs();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());
  const [aiSaved, setAiSaved] = useState(false);

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
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">设置</h1>
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

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
          <h2 className="text-sm text-[var(--text-muted)]">AI 创作（new-api）</h2>
          <p className="text-xs text-[var(--text-muted)]">
            仅保存在本浏览器，不会上传到雨读服务器。请使用 OpenAI 兼容中转，并配置
            CORS 允许本站来源。密钥请自行保管。
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">API Base URL</span>
            <input
              value={ai.baseUrl}
              onChange={(e) => {
                setAiSaved(false);
                setAi((s) => ({ ...s, baseUrl: e.target.value }));
              }}
              placeholder="https://your-new-api.example.com"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">API Key</span>
            <input
              type="password"
              value={ai.apiKey}
              onChange={(e) => {
                setAiSaved(false);
                setAi((s) => ({ ...s, apiKey: e.target.value }));
              }}
              placeholder="sk-…"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">模型名</span>
            <input
              value={ai.model}
              onChange={(e) => {
                setAiSaved(false);
                setAi((s) => ({ ...s, model: e.target.value }));
              }}
              placeholder="例如 gpt-4o 或你的破限模型 id"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              saveAiSettings(ai);
              setAi(loadAiSettings());
              setAiSaved(true);
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            保存到本机
          </button>
          {aiSaved ? (
            <p className="text-xs text-emerald-400">已保存到 localStorage</p>
          ) : null}
          <Link
            to="/studio"
            className="inline-block text-sm text-[var(--accent)] hover:underline"
          >
            打开创作台 →
          </Link>
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

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
