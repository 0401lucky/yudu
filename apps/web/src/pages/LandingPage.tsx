import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-full flex items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/library" replace />;
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-semibold tracking-wide text-[var(--accent)]">
          雨读
        </h1>
        <p className="text-lg text-[var(--text)]">雨夜书房</p>
        <p className="max-w-md text-[var(--text-muted)] leading-relaxed">
          导入本地小说，跨设备同步进度。在沉浸的雨夜里，安静地读完这一页。
        </p>
      </div>

      <div
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-lg"
        aria-hidden
      >
        <p className="text-xs text-[var(--text-muted)] mb-2">阅读预览</p>
        <p className="font-serif text-[var(--text)] leading-loose text-sm">
          窗外雨声细密，灯下书页微暖。你翻过这一页，故事便在云端静静等你。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/login"
          className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-[var(--text)] hover:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          登录
        </Link>
        <Link
          to="/register"
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[var(--bg)] font-medium hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          注册
        </Link>
      </div>
    </main>
  );
}
