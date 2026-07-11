import type { BookDetail, ChapterContent } from "@yudu/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ReaderFooter,
  ReaderHeader,
} from "../components/ReaderChrome";
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
  compact: 12,
  normal: 16,
  relaxed: 20,
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

  // 测量真实可用区域（chrome 在文档流内，flex-1 区域即版心）
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setViewport({
          width: Math.max(1, Math.floor(w)),
          height: Math.max(1, Math.floor(h)),
        });
      }
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);

    // 移动端地址栏伸缩
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [loading, book, chromeVisible]);

  // 窄屏用更小边距参与分页估算
  const narrow = viewport.width < 480;
  const pad = narrow
    ? Math.min(MARGIN_PX[prefs.pageMargin] ?? 16, 14)
    : (MARGIN_PX[prefs.pageMargin] ?? 16);

  // 估算字号与实际显示一致（手机上限 22，与 Viewport 一致）
  const effectiveFontSize = narrow
    ? Math.min(prefs.fontSize, 22)
    : prefs.fontSize;

  const metrics: PageMetrics = useMemo(() => {
    // 安全余量：估算分页略偏乐观时避免文字溢出底边
    const safety = narrow ? 12 : 8;
    return {
      width: Math.max(1, viewport.width - pad * 2),
      height: Math.max(1, viewport.height - pad * 2 - safety),
      fontSize: effectiveFontSize,
      lineHeight: prefs.lineHeight,
      fontFamily: "serif",
      paragraphGap: Math.round(effectiveFontSize * 0.65),
    };
  }, [
    viewport,
    pad,
    effectiveFontSize,
    prefs.lineHeight,
    narrow,
  ]);

  const pageStarts = useMemo(() => {
    if (!chapter) return [0];
    return paginateText(chapter.text, metrics);
  }, [chapter, metrics]);

  useEffect(() => {
    if (!chapter) return;
    const idx = pageIndexForOffset(pageStarts, charOffset);
    setPageIndex(idx);
    const start = pageStarts[idx] ?? 0;
    if (start !== charOffset) {
      setCharOffset(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageStarts, chapter?.index]);

  useEffect(() => {
    if (!book || !chapter) return;
    schedule(chapterIndex, charOffset, pageIndex);
  }, [book, chapter, chapterIndex, charOffset, pageIndex, schedule]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!chapter || !book) return;
      if (nextPage < 0) {
        if (chapterIndex <= 0) return;
        setChapterIndex(chapterIndex - 1);
        setCharOffset(Number.MAX_SAFE_INTEGER);
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

  useEffect(() => {
    if (!chapter) return;
    if (charOffset === Number.MAX_SAFE_INTEGER) {
      const last = Math.max(0, pageStarts.length - 1);
      const start = pageStarts[last] ?? 0;
      setPageIndex(last);
      setCharOffset(start);
    }
  }, [chapter, pageStarts, charOffset]);

  const onPrev = useCallback(
    () => goToPage(pageIndex - 1),
    [goToPage, pageIndex],
  );
  const onNext = useCallback(
    () => goToPage(pageIndex + 1),
    [goToPage, pageIndex],
  );

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
    ? `第 ${chapterIndex + 1}/${book?.chapters.length ?? 1} 章 · ${pageIndex + 1}/${Math.max(pageStarts.length, 1)} 页`
    : "";

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-8">
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
    <main className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[var(--page-bg)]">
      <ReaderHeader
        visible={chromeVisible}
        title={book.title}
        chapterTitle={chapter?.title ?? ""}
        onOpenToc={() => setTocOpen(true)}
      />

      {/* 唯一测量区：顶底栏不占 fixed，这里高度 = 真实可读区域 */}
      <div ref={measureRef} className="relative min-h-0 flex-1 overflow-hidden">
        <ReaderViewport
          pageText={pageText}
          fontSize={effectiveFontSize}
          lineHeight={prefs.lineHeight}
          pageMargin={prefs.pageMargin}
          onPrev={onPrev}
          onNext={onNext}
          onToggleChrome={() => setChromeVisible((v) => !v)}
          contentRef={contentRef}
        />
      </div>

      <ReaderFooter
        visible={chromeVisible}
        pageLabel={pageLabel}
        prefs={prefs}
        onPrefs={(partial) => {
          void setPrefs(partial);
        }}
      />

      <TocDrawer
        open={tocOpen}
        chapters={book.chapters}
        currentIndex={chapterIndex}
        onClose={() => setTocOpen(false)}
        onSelect={(idx) => {
          setChapterIndex(idx);
          setCharOffset(0);
          setPageIndex(0);
          setTocOpen(false);
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
