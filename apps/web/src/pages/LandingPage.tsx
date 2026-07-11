import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/library" replace />;
  }

  return (
    <main className="relative min-h-full overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, #c4a57422, transparent), radial-gradient(ellipse 60% 40% at 80% 80%, #1a2e2433, transparent)",
        }}
      />

      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-10 px-6 py-16 md:flex-row md:items-center md:gap-16 md:py-24">
        <div className="flex-1 space-y-5 text-center md:text-left">
          <p className="text-xs tracking-[0.35em] text-[var(--text-muted)] uppercase">
            YUDU
          </p>
          <h1 className="text-4xl font-semibold tracking-wide text-[var(--accent)] md:text-5xl">
            雨读
          </h1>
          <p className="text-lg text-[var(--text)]">雨夜书房 · 沉浸阅读</p>
          <p className="max-w-md text-[var(--text-muted)] leading-relaxed mx-auto md:mx-0">
            导入 txt / md / epub，账号云同步进度。在安静的深色书房里，左右翻页读完这一夜。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Link
              to="/register"
              className="rounded-lg bg-[var(--accent)] px-6 py-2.5 font-medium text-[var(--bg)] hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              开始使用
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-[var(--border)] px-6 py-2.5 text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              登录
            </Link>
          </div>
        </div>

        <div
          className="w-full max-w-sm shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl shadow-black/40"
          aria-hidden
        >
          <div className="mb-4 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>第一章</span>
            <span>3 / 12</span>
          </div>
          <div className="reader-page min-h-[220px] rounded-lg bg-[var(--page-bg)] p-5">
            <p className="font-serif text-[0.95rem] leading-[1.85] text-[var(--text)]">
              窗外雨声细密，灯下书页微暖。你翻过这一页，故事便在云端静静等你——不必赶路，只需把呼吸放慢，与角色并肩站在雨里。
            </p>
          </div>
          <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
            左右滑动翻页 · 进度自动同步
          </p>
        </div>
      </div>
    </main>
  );
}
