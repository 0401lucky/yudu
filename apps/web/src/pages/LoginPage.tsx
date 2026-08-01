import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PrimaryButton } from "../components/buttons";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

/**
 * 衬线排版工具类：登录页固定纸面主题（data-theme="paper"），
 * 标题/强调统一引用 --font-serif，与阅读器正文同源。
 */
const SERIF = "[font-family:var(--font-serif)]";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <main
        data-theme="paper"
        className="flex min-h-full items-center justify-center bg-[var(--bg)] p-8"
      >
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/library" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱");
      return;
    }
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmed, password);
      navigate("/library", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "登录失败";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      data-theme="paper"
      className="yudu-page-in relative min-h-full overflow-hidden bg-[var(--bg)]"
    >
      {/* 纸面氛围背景：灯下暖光 + 纸张颗粒 */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="yudu-paper-texture absolute inset-0 opacity-[0.05]" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 50% -5%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 65%), radial-gradient(ellipse 55% 45% at 92% 92%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-10 px-6 py-14 md:flex-row md:items-center md:gap-16 md:py-16">
        {/* 扉页（桌面端品牌叙事） */}
        <div className="hidden flex-1 flex-col items-start gap-4 md:flex">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--text-muted)]">
            YUDU
          </p>
          <h1
            className={`${SERIF} text-6xl font-medium leading-none text-[var(--accent)]`}
          >
            雨读
          </h1>
          <p className="text-lg text-[var(--text)]">雨夜书房 · 通用阅读器</p>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
            导入 txt / md / epub / pdf，进度与书签云同步。翻开一页纸，把注意力留给文字本身。
          </p>
          <div className="mt-2 flex items-center gap-2.5 text-[var(--text-muted)]">
            <span className="h-px w-8 bg-[var(--border)]" />
            <span className={`${SERIF} text-sm`}>翻开书页，继续阅读</span>
          </div>
        </div>

        {/* 书页卡片 */}
        <div
          className="yudu-rise-in relative w-full max-w-md shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-7 md:p-8"
          style={{
            boxShadow:
              "0 1px 0 color-mix(in srgb, var(--text) 8%, transparent), 0 24px 48px -24px color-mix(in srgb, var(--accent) 25%, transparent)",
          }}
        >
          {/* 纸张颗粒 */}
          <div
            aria-hidden
            className="yudu-paper-texture pointer-events-none absolute inset-0 opacity-[0.03]"
          />

          <div className="relative">
            {/* 页眉 */}
            <div className="mb-6">
              <div className="flex items-baseline justify-between">
                <span className={`${SERIF} text-2xl text-[var(--text)]`}>
                  登录
                </span>
                <span className="text-[0.65rem] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Sign In
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                登录雨读，同步你的文库
              </p>
              <div className="mt-5 flex items-center gap-2" aria-hidden>
                <span className="h-px flex-1 bg-[var(--border)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
                <span className="h-px flex-1 bg-[var(--border)]" />
              </div>
            </div>

            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs text-[var(--text-muted)]"
                >
                  邮箱
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-0 border-b border-[var(--border)] bg-transparent px-1 py-2 text-[var(--text)] caret-[var(--accent)] transition-colors duration-200 placeholder:opacity-50 placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs text-[var(--text-muted)]"
                >
                  密码
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-0 border-b border-[var(--border)] bg-transparent px-1 py-2 text-[var(--text)] caret-[var(--accent)] transition-colors duration-200 placeholder:opacity-50 placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="至少 8 位"
                  minLength={8}
                  required
                />
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-[var(--danger-weak)] bg-[var(--danger-weak)] px-3 py-2 text-sm text-[var(--danger)]"
                >
                  {error}
                </p>
              ) : null}

              <PrimaryButton
                type="submit"
                disabled={submitting}
                className="w-full py-2.5"
              >
                {submitting ? "登录中…" : "登录"}
              </PrimaryButton>
            </form>

            {/* 页脚：注册入口 */}
            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <p className="text-center text-sm text-[var(--text-muted)]">
                还没有账号？{" "}
                <Link
                  to="/register"
                  className={`${SERIF} text-[var(--accent)] rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
                >
                  创建新账号
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 页面页码 */}
      <p className="pointer-events-none absolute inset-x-0 bottom-5 select-none text-center text-xs text-[var(--text-muted)] opacity-70">
        <span className={SERIF}>雨读 · 第 01 页</span>
      </p>
    </main>
  );
}
