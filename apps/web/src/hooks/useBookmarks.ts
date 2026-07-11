import { useCallback, useEffect, useState } from "react";

export interface Bookmark {
  chapterIndex: number;
  pageInChapter: number;
  /** 章节标题 + 摘录，便于目录里辨认 */
  label: string;
  ts: number;
}

function keyFor(bookId: string): string {
  return `yudu.reader.bookmarks.${bookId}`;
}

function read(bookId: string): Bookmark[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(bookId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Bookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useBookmarks(bookId: string | undefined) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    setBookmarks(bookId ? read(bookId) : []);
  }, [bookId]);

  const persist = useCallback(
    (next: Bookmark[]) => {
      setBookmarks(next);
      if (!bookId) return;
      try {
        localStorage.setItem(keyFor(bookId), JSON.stringify(next));
      } catch {
        // 静默
      }
    },
    [bookId],
  );

  const isBookmarked = useCallback(
    (chapterIndex: number, pageInChapter: number) =>
      bookmarks.some(
        (b) =>
          b.chapterIndex === chapterIndex && b.pageInChapter === pageInChapter,
      ),
    [bookmarks],
  );

  const toggle = useCallback(
    (mark: Omit<Bookmark, "ts">) => {
      const exists = bookmarks.some(
        (b) =>
          b.chapterIndex === mark.chapterIndex &&
          b.pageInChapter === mark.pageInChapter,
      );
      if (exists) {
        persist(
          bookmarks.filter(
            (b) =>
              !(
                b.chapterIndex === mark.chapterIndex &&
                b.pageInChapter === mark.pageInChapter
              ),
          ),
        );
      } else {
        persist(
          [...bookmarks, { ...mark, ts: Date.now() }].sort((a, b) =>
            a.chapterIndex === b.chapterIndex
              ? a.pageInChapter - b.pageInChapter
              : a.chapterIndex - b.chapterIndex,
          ),
        );
      }
    },
    [bookmarks, persist],
  );

  const remove = useCallback(
    (chapterIndex: number, pageInChapter: number) => {
      persist(
        bookmarks.filter(
          (b) =>
            !(
              b.chapterIndex === chapterIndex &&
              b.pageInChapter === pageInChapter
            ),
        ),
      );
    },
    [bookmarks, persist],
  );

  return { bookmarks, isBookmarked, toggle, remove };
}
