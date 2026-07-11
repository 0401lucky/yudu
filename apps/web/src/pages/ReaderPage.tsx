import type { BookDetail, ChapterContent } from "@yudu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReaderChrome from "../components/ReaderChrome";
import ReaderViewport from "../components/ReaderViewport";
import TocDrawer from "../components/TocDrawer";
import { useThemePrefs } from "../components/ThemeProvider";
import { useProgressSync } from "../hooks/useProgressSync";
import { ApiError, getBook, getChapter, getProgress } from "../lib/api";
import {
  pageIndexForOffset,
  pageSlice,
  paginateText,
  type PageMetrics,
} from "../lib/pagination";

const MARGIN_PX: Record<string, number> = {
  compact: 16,
  normal: 24,
  relaxed: 32,
};

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { prefs, setPrefs } = useThemePrefs();
  const { schedule } = useProgressSync(bookId);

  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [charOffset, setCharOffset] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewport, setViewport] = useState({ width: 320, height: 480 });

  const contentRef = useRef<HTMLDivElement>(null!);
  const measureRef = useRef<HTMLDivElement>(null);

  // 加载书与进度
  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [detail, progress] = await Promise.all([
          getBook(bookId),
          getProgress(bookId),
        ]);
        if (cancelled) return;
        setBook(detail);
        const idx = Math.min(
          Math.max(0, progress.chapterIndex),
          Math.max(0, detail.chapters.length - 1),
        );
        setChapterIndex(idx);
        setCharOffset(Math.max(0, progress.charOffset));
      } catch (err) {
        if (cancelled) return;
        setError(errMessage(err, "加载书籍失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // 拉章节
  useEffect(() => {
    if (!bookId || !book) return;
    let cancelled = false;
    (async () => {
      try {
        const ch = await getChapter(bookId, chapterIndex);
        if (cancelled) return;
        setChapter(ch);
      } catch (err) {
        if (cancelled) return;
        setError(errMessage(err, "加载章节失败"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, book, chapterIndex]);

  // 测量版心
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setViewport({
        width: Math.max(1, Math.floor(cr.width)),
        height: Math.max(1, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, book]);

  const pad = MARGIN_PX[prefs.pageMargin] ?? 24;
  const metrics: PageMetrics = useMemo(
    () => ({
      width: Math.max(1, viewport.width - pad * 2),
      height: Math.max(1, viewport.height - pad * 2),
      fontSize: prefs.fontSize,
      lineHeight: prefs.lineHeight,
      fontFamily: "serif",
      paragraphGap: Math.round(prefs.fontSize * 0.7),
    }),
    [viewport, prefs.fontSize, prefs.lineHeight, prefs.pageMargin, pad],
  );

  const pageStarts = useMemo(() => {
    if (!chapter) return [0];
    return paginateText(chapter.text, metrics);
  }, [chapter, metrics]);

  // 版式变化时用 charOffset 映射页码
  useEffect(() => {
    if (!chapter) return;
    const idx = pageIndexForOffset(pageStarts, charOffset);
    setPageIndex(idx);
    const start = pageStarts[idx] ?? 0;
    if (start !== charOffset) {
      setCharOffset(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在分页结果变化时重映射
  }, [pageStarts, chapter?.index]);

  // 同步进度
  useEffect(() => {
    if (!book || !chapter) return;
    schedule(chapterIndex, charOffset, pageIndex);
  }, [book, chapter, chapterIndex, charOffset, pageIndex, schedule]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!chapter || !book) return;
      if (nextPage < 0) {
        if (chapterIndex <= 0) return;
        const prevIdx = chapterIndex - 1;
        setChapterIndex(prevIdx);
        setCharOffset(Number.MAX_SAFE_INTEGER); // 将在新章加载后钳到末页
        return;
      }
      if (nextPage >= pageStarts.length) {
        if (chapterIndex >= book.chapters.length - 1) return;
        setChapterIndex(chapterIndex + 1);
        setCharOffset(0);
        setPageIndex(0);
        return;
      }
      const start = pageStarts[nextPage] ?? 0;
      setPageIndex(nextPage);
      setCharOffset(start);
    },
    [book, chapter, chapterIndex, pageStarts],
  );

  // 跳到上章时定位到最后一页
  useEffect(() => {
    if (!chapter) return;
    if (charOffset === Number.MAX_SAFE_INTEGER) {
      const last = Math.max(0, pageStarts.length - 1);
      const start = pageStarts[last] ?? 0;
      setPageIndex(last);
      setCharOffset(start);
    }
  }, [chapter, pageStarts, charOffset]);

  const onPrev = useCallback(() => goToPage(pageIndex - 1), [goToPage, pageIndex]);
  const onNext = useCallback(() => goToPage(pageIndex + 1), [goToPage, pageIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  const pageText = chapter
    ? pageSlice(chapter.text, pageStarts, pageIndex)
    : "";

  const pageLabel = chapter
    ? `第 ${chapterIndex + 1}/${book?.chapters.length ?? 1} 章 · ${pageIndex + 1}/${pageStarts.length} 页`
    : "";

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-red-400" role="alert">
          {error ?? "书籍不存在"}
        </p>
        <Link to="/library" className="text-[var(--accent)] hover:underline">
          返回书架
        </Link>
      </main>
    );
  }

  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--page-bg)]">
      <ReaderChrome
        visible={chromeVisible}
        title={book.title}
        chapterTitle={chapter?.title ?? ""}
        pageLabel={pageLabel}
        prefs={prefs}
        onOpenToc={() => setTocOpen(true)}
        onPrefs={(partial) => {
          void setPrefs(partial);
        }}
      />

      <div
        ref={measureRef}
        className="relative min-h-0 flex-1"
        style={{
          paddingTop: chromeVisible ? "3.25rem" : 0,
          paddingBottom: chromeVisible ? "3.25rem" : 0,
        }}
      >
        <ReaderViewport
          pageText={pageText}
          fontSize={prefs.fontSize}
          lineHeight={prefs.lineHeight}
          pageMargin={prefs.pageMargin}
          onPrev={onPrev}
          onNext={onNext}
          onToggleChrome={() => setChromeVisible((v) => !v)}
          contentRef={contentRef}
        />
      </div>

      <TocDrawer
        open={tocOpen}
        chapters={book.chapters}
        currentIndex={chapterIndex}
        onClose={() => setTocOpen(false)}
        onSelect={(idx) => {
          setChapterIndex(idx);
          setCharOffset(0);
          setPageIndex(0);
        }}
      />
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
