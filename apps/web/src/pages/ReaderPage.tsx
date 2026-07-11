import type { BookDetail, ChapterContent } from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ReaderFooter, ReaderHeader } from "../components/ReaderChrome";
import ReaderSettingsSheet from "../components/ReaderSettingsSheet";
import ReaderViewport from "../components/ReaderViewport";
import TocDrawer from "../components/TocDrawer";
import { useThemePrefs } from "../components/ThemeProvider";
import { useBookmarks, type Bookmark } from "../hooks/useBookmarks";
import { useLocalReaderPrefs } from "../hooks/useLocalReaderPrefs";
import { useProgressSync } from "../hooks/useProgressSync";
import { ApiError, getBook, getChapter, getProgress } from "../lib/api";

/** 换章后想落到的页：数字=具体页；"last"=末页；null=不指定 */
type PendingPage = number | "last" | null;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { prefs, setPrefs } = useThemePrefs();
  const { localPrefs, setLocalPrefs } = useLocalReaderPrefs();
  const { schedule } = useProgressSync(bookId);
  const { bookmarks, isBookmarked, toggle, remove } = useBookmarks(bookId);

  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 换章/恢复进度时，等新章测量出页数后再落位
  const pendingPageRef = useRef<PendingPage>(null);

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
        pendingPageRef.current = Math.max(0, progress.pageInChapter ?? 0);
        setChapterIndex(idx);
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

  // 视口测量出本章页数后回调：落位到 pending 页并夹取范围
  const handlePageCount = useCallback((count: number) => {
    setPageCount(count);
    const pending = pendingPageRef.current;
    pendingPageRef.current = null;
    setPageIndex((cur) => {
      let target = pending === "last" ? count - 1 : pending ?? cur;
      return Math.min(Math.max(0, target), Math.max(0, count - 1));
    });
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!book || !chapter) return;
      // 章节切换后正等待新章测量，忽略翻页，避免连按跳过整章
      if (pendingPageRef.current !== null) return;
      if (nextPage < 0) {
        if (chapterIndex <= 0) return;
        pendingPageRef.current = "last";
        setChapterIndex((i) => i - 1);
        return;
      }
      if (nextPage >= pageCount) {
        if (chapterIndex >= book.chapters.length - 1) return;
        pendingPageRef.current = 0;
        setChapterIndex((i) => i + 1);
        return;
      }
      setPageIndex(nextPage);
    },
    [book, chapter, chapterIndex, pageCount],
  );

  const onPrev = useCallback(() => goToPage(pageIndex - 1), [goToPage, pageIndex]);
  const onNext = useCallback(() => goToPage(pageIndex + 1), [goToPage, pageIndex]);

  // 键盘翻页
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

  // 进度云同步：pageInChapter 用于恢复到页；charOffset 由页比例近似，
  // 供书架列表按字数计算全书百分比（后端要求非负整数）
  useEffect(() => {
    if (!book || !chapter) return;
    const approxOffset =
      pageCount > 0
        ? Math.round((pageIndex / pageCount) * chapter.text.length)
        : 0;
    schedule(chapterIndex, approxOffset, pageIndex);
  }, [book, chapter, chapterIndex, pageIndex, pageCount, schedule]);

  const jumpToChapter = useCallback((idx: number, page: PendingPage = 0) => {
    pendingPageRef.current = page;
    setChapterIndex(idx);
    setPageIndex(0);
  }, []);

  // 全书进度 0–1（章内按页加权近似）
  const totalChapters = book?.chapters.length ?? 1;
  const progress =
    (chapterIndex + (pageCount > 0 ? pageIndex / pageCount : 0)) /
    Math.max(1, totalChapters);

  const onSeek = useCallback(
    (ratio: number) => {
      if (!book || totalChapters <= 0) return;
      const idx = Math.min(
        Math.max(0, Math.floor(ratio * totalChapters)),
        totalChapters - 1,
      );
      if (idx === chapterIndex) {
        // 同章内按比例定位页
        const within = ratio * totalChapters - idx;
        setPageIndex(
          Math.min(Math.max(0, Math.round(within * pageCount)), pageCount - 1),
        );
      } else {
        jumpToChapter(idx, 0);
      }
    },
    [book, totalChapters, chapterIndex, pageCount, jumpToChapter],
  );

  const currentBookmarked = isBookmarked(chapterIndex, pageIndex);
  const onToggleBookmark = useCallback(() => {
    const excerpt = chapter?.text
      .slice(0, 40)
      .replace(/\s+/g, " ")
      .trim();
    toggle({
      chapterIndex,
      pageInChapter: pageIndex,
      label: chapter?.title || excerpt || `第 ${chapterIndex + 1} 章`,
    });
  }, [chapter, chapterIndex, pageIndex, toggle]);

  const onSelectBookmark = useCallback(
    (mark: Bookmark) => {
      if (mark.chapterIndex === chapterIndex) {
        setPageIndex(Math.min(mark.pageInChapter, Math.max(0, pageCount - 1)));
      } else {
        jumpToChapter(mark.chapterIndex, mark.pageInChapter);
      }
    },
    [chapterIndex, pageCount, jumpToChapter],
  );

  const pageLabel = chapter
    ? `第 ${chapterIndex + 1}/${totalChapters} 章 · ${pageIndex + 1}/${Math.max(pageCount, 1)} 页`
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
        bookmarked={currentBookmarked}
        onOpenToc={() => setTocOpen(true)}
        onToggleBookmark={onToggleBookmark}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ReaderViewport
          text={chapter?.text ?? ""}
          pageIndex={pageIndex}
          fontSize={prefs.fontSize}
          lineHeight={prefs.lineHeight}
          fontFamily={localPrefs.fontFamily}
          pageMargin={prefs.pageMargin}
          onPageCount={handlePageCount}
          onPrev={onPrev}
          onNext={onNext}
          onToggleChrome={() => setChromeVisible((v) => !v)}
        />
      </div>

      <ReaderFooter
        visible={chromeVisible}
        pageLabel={pageLabel}
        progress={Math.min(1, Math.max(0, progress))}
        onSeek={onSeek}
        themeLabel={prefs.theme === "night" ? "纸页" : "夜读"}
        onToggleTheme={() =>
          void setPrefs({ theme: prefs.theme === "night" ? "paper" : "night" })
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* 亮度蒙层：固定定位，pointer-events-none，不压暗菜单（z 低于抽屉/面板） */}
      {localPrefs.brightness < 1 ? (
        <div
          className="pointer-events-none fixed inset-0 z-30 bg-black"
          style={{ opacity: 1 - localPrefs.brightness }}
          aria-hidden
        />
      ) : null}

      <TocDrawer
        open={tocOpen}
        chapters={book.chapters}
        currentIndex={chapterIndex}
        bookmarks={bookmarks}
        onClose={() => setTocOpen(false)}
        onSelect={(idx) => jumpToChapter(idx, 0)}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={remove}
      />

      <ReaderSettingsSheet
        open={settingsOpen}
        prefs={prefs}
        localPrefs={localPrefs}
        onClose={() => setSettingsOpen(false)}
        onPrefs={(partial) => void setPrefs(partial)}
        onLocalPrefs={setLocalPrefs}
      />
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
