import type {
  BookDetail,
  BookmarkDto,
  BookSearchMatch,
} from "@yudu/shared";
import { MAX_BOOKMARK_LABEL_CHARS } from "@yudu/shared";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import { ReaderFooter, ReaderHeader } from "../components/ReaderChrome";
import ReaderSettingsSheet from "../components/ReaderSettingsSheet";
import ReaderViewport from "../components/ReaderViewport";
import type {
  ScrollChapterItem,
  ScrollPendingTarget,
} from "../components/ScrollReaderViewport";
import ScrollReaderViewport from "../components/ScrollReaderViewport";
import SearchDrawer from "../components/SearchDrawer";
import TocDrawer from "../components/TocDrawer";
import { useThemePrefs } from "../components/ThemeProvider";
import { ASSUMED_PAGE_CHARS, useBookmarks } from "../hooks/useBookmarks";
import { useChapterWindow } from "../hooks/useChapterWindow";
import type { LocalReaderPrefs } from "../hooks/useLocalReaderPrefs";
import { useLocalReaderPrefs } from "../hooks/useLocalReaderPrefs";
import { useProgressSync } from "../hooks/useProgressSync";
import { useReadingClock } from "../hooks/useReadingClock";
import { ApiError, getBook, getProgress, searchBook } from "../lib/api";
import { mdPlainLengthApprox } from "../lib/mdRender";

// pdf.js 体积大（~1MB+），懒加载让它只进独立 chunk，不拖累主 bundle
const PdfReaderView = lazy(() => import("../components/PdfReaderView"));

/** 换章后想落到的页：数字=具体页；"last"=末页；对象=按字符偏移落页；null=不指定 */
type PendingPage = number | "last" | { charOffset: number } | null;

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { prefs, setPrefs } = useThemePrefs();
  const { localPrefs, setLocalPrefs } = useLocalReaderPrefs();
  const { schedule } = useProgressSync(bookId);
  // 阅读时长统计：与进度同步互不干扰（独立 timer），所有格式（含 PDF）均计时
  useReadingClock();

  const [book, setBook] = useState<BookDetail | null>(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  // 滚动模式：当前章内的高度比例（0–1），以及待落位目标
  const [scrollRatio, setScrollRatio] = useState(0);
  const [pendingScroll, setPendingScroll] =
    useState<ScrollPendingTarget | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // PDF：文档解析出真实页数前不显示页码（避免"第 1 / 1 页"假数据）
  const [pdfCountKnown, setPdfCountKnown] = useState(false);

  const isPdf = book?.format === "pdf";
  // 滚动模式仅对非 PDF 生效（PDF 的设置入口本就关闭）
  const isScroll = !isPdf && localPrefs.readingMode === "scroll";

  // 渲染期同步 ref，供不依赖状态刷新的回调读取最新值
  const scrollRatioRef = useRef(0);
  scrollRatioRef.current = scrollRatio;
  const pendingScrollRef = useRef<ScrollPendingTarget | null>(null);
  pendingScrollRef.current = pendingScroll;

  const {
    bookmarks,
    add: addBookmark,
    remove: removeBookmark,
    error: bookmarkError,
    clearError: clearBookmarkError,
  } = useBookmarks(bookId, book?.chapters);

  // 换章/恢复进度时，等新章测量出页数后再落位
  const pendingPageRef = useRef<PendingPage>(null);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPdfCountKnown(false);
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
        // 优先 charOffset 锚点（两种模式的公共坐标）；
        // 旧记录 charOffset 为 0 时回退 pageInChapter 按页恢复（含 PDF）
        const co = Math.max(0, Math.floor(progress.charOffset));
        const pg = Math.max(0, progress.pageInChapter ?? 0);
        pendingPageRef.current = co > 0 ? { charOffset: co } : pg;
        if (detail.format !== "pdf") {
          // 仅 pageInChapter 可靠的旧记录：按「页号 × 近似页字数」换算滚动锚点
          //（与 useBookmarks 旧书签迁移同口径），避免滚动模式误落回章首
          const charCount = detail.chapters[idx]?.charCount ?? 0;
          const scrollOffset =
            co > 0
              ? co
              : Math.min(pg * ASSUMED_PAGE_CHARS, Math.max(0, charCount - 1));
          setPendingScroll({ chapterIndex: idx, charOffset: scrollOffset });
        }
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

  // 章节窗口（当前章 ±1）：两种模式共用同一缓存与并发去重，
  // 翻页模式顺带预取相邻章，模式互切无需重新请求。PDF 无章节，禁用。
  const { window: chapterWindow, error: chapterError } = useChapterWindow(
    isPdf ? undefined : bookId,
    chapterIndex,
    book?.chapters.length ?? 0,
  );
  const chapter = useMemo(
    () => chapterWindow.find((i) => i.index === chapterIndex)?.content ?? null,
    [chapterWindow, chapterIndex],
  );

  // 当前章加载失败时提示（与原章节加载错误处理同级）
  useEffect(() => {
    if (chapterError) setError(chapterError);
  }, [chapterError]);

  // 章内近似文本长度：书签/进度的 charOffset 换算基准（md 用近似纯文本长度）
  const textLen = useMemo(() => {
    if (!book || !chapter) return 0;
    return book.format === "md"
      ? mdPlainLengthApprox(chapter.text)
      : chapter.text.length;
  }, [book, chapter]);
  // 渲染期同步到 ref，保证子组件测量回调（早于父 effect）读到当前章的值
  const textLenRef = useRef(0);
  textLenRef.current = textLen;

  // 视口测量出本章页数后回调：落位到 pending 页并夹取范围
  const handlePageCount = useCallback((count: number) => {
    setPageCount(count);
    const pending = pendingPageRef.current;
    pendingPageRef.current = null;
    setPageIndex((cur) => {
      let target: number;
      if (pending === "last") {
        target = count - 1;
      } else if (typeof pending === "number") {
        target = pending;
      } else if (pending !== null) {
        // charOffset 锚点：按占全章比例换算成页
        const len = textLenRef.current;
        target = len > 0 ? Math.floor((pending.charOffset / len) * count) : 0;
      } else {
        target = cur;
      }
      return Math.min(Math.max(0, target), Math.max(0, count - 1));
    });
  }, []);

  // PDF 页数上报：走同一落位逻辑，并解锁页码显示
  const handlePdfPageCount = useCallback(
    (count: number) => {
      setPdfCountKnown(true);
      handlePageCount(count);
    },
    [handlePageCount],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      // PDF：单文档平铺页，夹取范围内直接跳页（无跨章语义）
      if (isPdf) {
        if (pendingPageRef.current !== null) return;
        setPageIndex(
          Math.min(Math.max(0, nextPage), Math.max(0, pageCount - 1)),
        );
        return;
      }
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
    [book, chapter, chapterIndex, pageCount, isPdf],
  );

  const onPrev = useCallback(() => goToPage(pageIndex - 1), [goToPage, pageIndex]);
  const onNext = useCallback(() => goToPage(pageIndex + 1), [goToPage, pageIndex]);

  // 进度云同步（翻页模式）：pageInChapter 用于恢复到页；charOffset 由页比例近似，
  // 供书架列表按字数计算全书百分比（后端要求非负整数）
  useEffect(() => {
    if (isScroll) return;
    if (!book || !chapter) return;
    const approxOffset =
      pageCount > 0 ? Math.round((pageIndex / pageCount) * textLen) : 0;
    schedule(chapterIndex, approxOffset, pageIndex);
  }, [
    isScroll,
    book,
    chapter,
    textLen,
    chapterIndex,
    pageIndex,
    pageCount,
    schedule,
  ]);

  // 进度云同步（滚动模式）：charOffset 为主锚点；pageInChapter 仅为旧口径兼容的近似页
  useEffect(() => {
    if (!isScroll || !book || !chapter) return;
    // 恢复/跳转落位前不上报，避免把云端进度覆盖回落位前的位置
    if (pendingScroll) return;
    const charOffset = Math.round(scrollRatio * textLen);
    schedule(
      chapterIndex,
      charOffset,
      Math.floor(charOffset / ASSUMED_PAGE_CHARS),
    );
  }, [
    isScroll,
    book,
    chapter,
    textLen,
    chapterIndex,
    scrollRatio,
    pendingScroll,
    schedule,
  ]);

  // PDF 进度：chapterIndex/charOffset 恒 0，pageInChapter=当前页；
  // 恢复页落位（pendingPageRef 消费完）前不上报，避免把云端进度覆盖回第 0 页
  useEffect(() => {
    if (!book || book.format !== "pdf") return;
    if (pendingPageRef.current !== null) return;
    schedule(0, 0, pageIndex);
  }, [book, pageIndex, pageCount, schedule]);

  const jumpToChapter = useCallback(
    (idx: number, page: PendingPage = 0) => {
      // 滚动模式：目录/书签/搜索跳转统一走 (chapterIndex, charOffset) 待落位
      if (isScroll) {
        const charOffset =
          typeof page === "object" && page !== null ? page.charOffset : 0;
        setPendingScroll({ chapterIndex: idx, charOffset });
        setChapterIndex(idx);
        return;
      }
      pendingPageRef.current = page;
      setChapterIndex(idx);
      setPageIndex(0);
    },
    [isScroll],
  );

  // 滚动模式键盘 ←/→ 切上一/下一章
  const onPrevChapter = useCallback(() => {
    if (chapterIndex > 0) jumpToChapter(chapterIndex - 1, 0);
  }, [chapterIndex, jumpToChapter]);
  const onNextChapter = useCallback(() => {
    if (!book) return;
    if (chapterIndex < book.chapters.length - 1) {
      jumpToChapter(chapterIndex + 1, 0);
    }
  }, [book, chapterIndex, jumpToChapter]);

  // 键盘操作；文本输入场景（如搜索框）豁免，避免劫持光标移动。
  // 翻页模式 ←/→ 翻页；滚动模式 ←/→ 切章，↑/↓/PageUp/PageDown 交给浏览器原生滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const isTextInput =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "TEXTAREA" ||
          (target instanceof HTMLInputElement && target.type !== "range"));
      if (isTextInput) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isScroll) onPrevChapter();
        else onPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isScroll) onNextChapter();
        else onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isScroll, onPrev, onNext, onPrevChapter, onNextChapter]);

  // 滚动视口位置上报：更新当前章与章内比例
  const handleScrollPos = useCallback((idx: number, ratio: number) => {
    if (pendingScrollRef.current) return; // 落位前忽略，防止覆盖目标位置
    setChapterIndex(idx);
    setScrollRatio(ratio);
  }, []);

  // 待落位消费完成：按目标 charOffset 同步章内比例并清除 pending
  const handlePendingApplied = useCallback(() => {
    const p = pendingScrollRef.current;
    if (p) {
      const len = textLenRef.current;
      setScrollRatio(len > 0 ? Math.min(1, Math.max(0, p.charOffset / len)) : 0);
    }
    setPendingScroll(null);
  }, []);

  // 切换阅读模式时把当前位置换算成 charOffset 锚点，另一模式恢复到同一处（误差 ≤ 一屏）
  const handleLocalPrefs = useCallback(
    (partial: Partial<LocalReaderPrefs>) => {
      const nextMode = partial.readingMode;
      if (nextMode && nextMode !== localPrefs.readingMode && !isPdf) {
        const len = textLenRef.current;
        if (nextMode === "scroll") {
          // 尚未消费的落页锚点直接沿用，否则取当前页起点
          const pendingPg = pendingPageRef.current;
          const charOffset =
            pendingPg !== null && typeof pendingPg === "object"
              ? pendingPg.charOffset
              : pageCount > 0
                ? Math.round((pageIndex / pageCount) * len)
                : 0;
          pendingPageRef.current = null;
          setPendingScroll({ chapterIndex, charOffset });
        } else {
          const charOffset = pendingScrollRef.current
            ? pendingScrollRef.current.charOffset
            : Math.round(scrollRatioRef.current * len);
          setPendingScroll(null);
          pendingPageRef.current = { charOffset };
        }
      }
      setLocalPrefs(partial);
    },
    [localPrefs.readingMode, isPdf, pageCount, pageIndex, chapterIndex, setLocalPrefs],
  );

  // 全书进度 0–1（章内按页/滚动比例加权近似）
  const totalChapters = book?.chapters.length ?? 1;
  const chapterFraction = isScroll
    ? scrollRatio
    : pageCount > 0
      ? pageIndex / pageCount
      : 0;
  const progress = (chapterIndex + chapterFraction) / Math.max(1, totalChapters);

  const onSeek = useCallback(
    (ratio: number) => {
      // PDF：按比例直接落到目标页
      if (isPdf) {
        if (pageCount <= 0 || pendingPageRef.current !== null) return;
        const target = Math.min(
          Math.max(0, Math.floor(ratio * pageCount)),
          pageCount - 1,
        );
        setPageIndex(target);
        return;
      }
      if (!book || totalChapters <= 0) return;
      const idx = Math.min(
        Math.max(0, Math.floor(ratio * totalChapters)),
        totalChapters - 1,
      );
      // 滚动模式：同章按比例换算 charOffset；跨章与翻页模式一致落到章首
      if (isScroll) {
        const within = Math.min(1, Math.max(0, ratio * totalChapters - idx));
        const charOffset =
          idx === chapterIndex ? Math.round(within * textLen) : 0;
        jumpToChapter(idx, { charOffset });
        return;
      }
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
    [
      book,
      totalChapters,
      chapterIndex,
      pageCount,
      jumpToChapter,
      isPdf,
      isScroll,
      textLen,
    ],
  );

  // 当前页书签判定：页 p 的 offset 区间为 [p/pageCount*textLen, (p+1)/pageCount*textLen)
  // 末页上界放开，容纳换算口径差异导致的溢出 offset
  const currentPageBookmark = useMemo(() => {
    if (!chapter) return undefined;
    // 滚动模式：视口顶部附近一「屏」（近似一页字数）内命中即点亮
    if (isScroll) {
      const lower = scrollRatio * textLen;
      const upper = lower + ASSUMED_PAGE_CHARS;
      return bookmarks.find(
        (b) =>
          b.chapterIndex === chapterIndex &&
          b.charOffset >= lower &&
          b.charOffset < upper,
      );
    }
    if (pageCount <= 0) return undefined;
    const lower = (pageIndex / pageCount) * textLen;
    const upper =
      pageIndex >= pageCount - 1
        ? Number.POSITIVE_INFINITY
        : ((pageIndex + 1) / pageCount) * textLen;
    return bookmarks.find(
      (b) =>
        b.chapterIndex === chapterIndex &&
        b.charOffset >= lower &&
        b.charOffset < upper,
    );
  }, [
    bookmarks,
    chapter,
    chapterIndex,
    pageIndex,
    pageCount,
    textLen,
    isScroll,
    scrollRatio,
  ]);
  const currentBookmarked = Boolean(currentPageBookmark);

  const onToggleBookmark = useCallback(() => {
    if (!chapter) return;
    if (currentPageBookmark) {
      void removeBookmark(currentPageBookmark);
      return;
    }
    const excerpt = chapter.text
      .slice(0, 40)
      .replace(/\s+/g, " ")
      .trim();
    // 用 ceil 保证 offset 恒落在本页/当前视口区间起点之后：
    // round 在小数部分 < 0.5 时会落到上一区间，导致刚加的书签图标不亮
    const charOffset = isScroll
      ? Math.ceil(scrollRatio * textLen)
      : pageCount > 0
        ? Math.ceil((pageIndex / pageCount) * textLen)
        : 0;
    void addBookmark({
      chapterIndex,
      charOffset,
      label: (
        chapter.title.trim() ||
        excerpt ||
        `第 ${chapterIndex + 1} 章`
      ).slice(0, MAX_BOOKMARK_LABEL_CHARS),
    });
  }, [
    chapter,
    currentPageBookmark,
    removeBookmark,
    addBookmark,
    chapterIndex,
    pageIndex,
    pageCount,
    textLen,
    isScroll,
    scrollRatio,
  ]);

  const onSelectBookmark = useCallback(
    (mark: BookmarkDto) => {
      // 滚动模式：同章/跨章统一走 charOffset 待落位
      if (isScroll) {
        jumpToChapter(mark.chapterIndex, { charOffset: mark.charOffset });
        return;
      }
      if (mark.chapterIndex === chapterIndex) {
        const page =
          textLen > 0
            ? Math.floor((mark.charOffset / textLen) * pageCount)
            : 0;
        setPageIndex(Math.min(Math.max(0, page), Math.max(0, pageCount - 1)));
      } else {
        jumpToChapter(mark.chapterIndex, { charOffset: mark.charOffset });
      }
    },
    [isScroll, chapterIndex, textLen, pageCount, jumpToChapter],
  );

  // 搜索结果跳转：与书签同款近似落位（同章直接换算页，跨章走 charOffset 变体）
  const onSelectSearchMatch = useCallback(
    (match: BookSearchMatch) => {
      if (isScroll) {
        jumpToChapter(match.chapterIndex, { charOffset: match.charOffset });
        return;
      }
      if (match.chapterIndex === chapterIndex) {
        const page =
          textLen > 0
            ? Math.floor((match.charOffset / textLen) * pageCount)
            : 0;
        setPageIndex(Math.min(Math.max(0, page), Math.max(0, pageCount - 1)));
      } else {
        jumpToChapter(match.chapterIndex, { charOffset: match.charOffset });
      }
    },
    [isScroll, chapterIndex, textLen, pageCount, jumpToChapter],
  );

  const onSearch = useCallback(
    (q: string) => searchBook(bookId ?? "", q),
    [bookId],
  );

  // 稳定引用：ScrollReaderViewport 用 memo 阻断滚动位置更新引发的整树重渲染，
  // 内联箭头函数会使 memo 失效
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  // 书签增删失败提示：短暂展示后自动消失
  useEffect(() => {
    if (!bookmarkError) return;
    const timer = setTimeout(clearBookmarkError, 3500);
    return () => clearTimeout(timer);
  }, [bookmarkError, clearBookmarkError]);

  const pageLabel = isPdf
    ? pdfCountKnown
      ? `第 ${pageIndex + 1} / ${Math.max(pageCount, 1)} 页`
      : ""
    : chapter
      ? isScroll
        ? `第 ${chapterIndex + 1}/${totalChapters} 章 · ${Math.round(scrollRatio * 100)}%`
        : `第 ${chapterIndex + 1}/${totalChapters} 章 · ${pageIndex + 1}/${Math.max(pageCount, 1)} 页`
      : "";

  // 滚动窗口渲染项：标题优先取目录元数据（占位阶段也能显示章题）
  const scrollItems = useMemo<ScrollChapterItem[]>(
    () =>
      chapterWindow.map((item) => ({
        index: item.index,
        title:
          book?.chapters[item.index]?.title.trim() ||
          item.content?.title ||
          `第 ${item.index + 1} 章`,
        content: item.content,
      })),
    [chapterWindow, book],
  );

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
        onOpenToc={!isPdf ? () => setTocOpen(true) : undefined}
        onToggleBookmark={!isPdf ? onToggleBookmark : undefined}
        onOpenSearch={!isPdf ? () => setSearchOpen(true) : undefined}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isPdf ? (
          <Suspense
            fallback={
              <div
                role="status"
                className="flex h-full w-full flex-col items-center justify-center gap-3"
              >
                <span
                  aria-hidden
                  className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
                />
                <p className="text-sm text-[var(--text-muted)]">
                  正在打开 PDF…
                </p>
              </div>
            }
          >
            <PdfReaderView
              bookId={book.id}
              pageIndex={pageIndex}
              onPageCount={handlePdfPageCount}
              onPrev={onPrev}
              onNext={onNext}
              onToggleChrome={toggleChrome}
            />
          </Suspense>
        ) : isScroll ? (
          <ScrollReaderViewport
            items={scrollItems}
            totalChapters={totalChapters}
            contentMode={book.format === "md" ? "markdown" : "plain"}
            fontSize={prefs.fontSize}
            lineHeight={prefs.lineHeight}
            fontFamily={localPrefs.fontFamily}
            pageMargin={prefs.pageMargin}
            pending={pendingScroll}
            onPendingApplied={handlePendingApplied}
            onPosition={handleScrollPos}
            onToggleChrome={toggleChrome}
          />
        ) : (
          <ReaderViewport
            text={chapter?.text ?? ""}
            contentMode={book.format === "md" ? "markdown" : "plain"}
            pageIndex={pageIndex}
            fontSize={prefs.fontSize}
            lineHeight={prefs.lineHeight}
            fontFamily={localPrefs.fontFamily}
            pageMargin={prefs.pageMargin}
            onPageCount={handlePageCount}
            onPrev={onPrev}
            onNext={onNext}
            onToggleChrome={toggleChrome}
          />
        )}
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
        onOpenSettings={!isPdf ? () => setSettingsOpen(true) : undefined}
      />

      {/* 亮度蒙层：固定定位，pointer-events-none，不压暗菜单（z 低于抽屉/面板） */}
      {localPrefs.brightness < 1 ? (
        <div
          className="pointer-events-none fixed inset-0 z-30 bg-black"
          style={{ opacity: 1 - localPrefs.brightness }}
          aria-hidden
        />
      ) : null}

      {/* 书签增删失败提示 */}
      {bookmarkError ? (
        <div
          role="alert"
          className="pointer-events-none fixed left-1/2 top-14 z-50 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm text-white shadow-lg"
        >
          {bookmarkError}
        </div>
      ) : null}

      {!isPdf ? (
        <TocDrawer
          open={tocOpen}
          chapters={book.chapters}
          currentIndex={chapterIndex}
          bookmarks={bookmarks}
          onClose={() => setTocOpen(false)}
          onSelect={(idx) => jumpToChapter(idx, 0)}
          onSelectBookmark={onSelectBookmark}
          onRemoveBookmark={removeBookmark}
        />
      ) : null}

      {!isPdf ? (
        <SearchDrawer
          open={searchOpen}
          chapters={book.chapters}
          onClose={() => setSearchOpen(false)}
          onSearch={onSearch}
          onSelectMatch={onSelectSearchMatch}
        />
      ) : null}

      {!isPdf ? (
        <ReaderSettingsSheet
          open={settingsOpen}
          prefs={prefs}
          localPrefs={localPrefs}
          onClose={() => setSettingsOpen(false)}
          onPrefs={(partial) => void setPrefs(partial)}
          onLocalPrefs={handleLocalPrefs}
        />
      ) : null}
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
