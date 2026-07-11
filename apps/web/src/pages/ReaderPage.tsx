import { Link, useParams } from "react-router-dom";

/** 阅读页占位（完整翻页 UI 在后续任务） */
export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();

  return (
    <main className="min-h-full flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-medium text-[var(--text)]">阅读页即将就绪</h1>
      <p className="text-sm text-[var(--text-muted)]">
        书籍 ID：{bookId ?? "—"}
      </p>
      <Link
        to="/library"
        className="text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
      >
        返回书架
      </Link>
    </main>
  );
}
