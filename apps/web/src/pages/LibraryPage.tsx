import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** 书架占位页（完整书架 UI 在后续任务） */
export default function LibraryPage() {
  const { user } = useAuth();

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">
          雨读
        </h1>
        <nav className="flex items-center gap-4 text-sm">
          <span className="hidden sm:inline text-[var(--text-muted)]">
            {user?.email}
          </span>
          <Link
            to="/settings"
            className="text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
          >
            设置
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-12 max-w-5xl text-center">
        <h2 className="text-2xl font-medium text-[var(--text)]">我的书架</h2>
        <p className="mt-3 text-[var(--text-muted)]">
          书架功能即将就绪。导入、列表与进度同步会在后续版本出现在这里。
        </p>
        <div className="mt-8 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-16">
          <p className="text-[var(--text-muted)]">暂无书籍</p>
        </div>
      </section>
    </main>
  );
}
