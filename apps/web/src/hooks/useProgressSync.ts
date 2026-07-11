import { useCallback, useEffect, useRef } from "react";
import { putProgress } from "../lib/api";

const DEBOUNCE_MS = 1000;

export function useProgressSync(bookId: string | undefined) {
  const pendingRef = useRef<{
    chapterIndex: number;
    charOffset: number;
    pageInChapter: number | null;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;

  const flush = useCallback(async () => {
    const id = bookIdRef.current;
    const pending = pendingRef.current;
    if (!id || !pending) return;
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      await putProgress(id, pending);
    } catch {
      // 不打断阅读；保留失败时静默
    }
  }, []);

  const schedule = useCallback(
    (chapterIndex: number, charOffset: number, pageInChapter: number) => {
      pendingRef.current = {
        chapterIndex,
        charOffset,
        pageInChapter,
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        void flush();
      }
    };
    const onUnload = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onUnload);
      void flush();
    };
  }, [flush]);

  return { schedule, flush };
}
