import type { ChapterContent } from "@yudu/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getChapter } from "../lib/api";

/** LRU 缓存上限：窗口只有 3 章，10 章足够来回滚动/跳转命中 */
const CACHE_LIMIT = 10;

export interface ChapterWindowItem {
  index: number;
  /** null = 加载中（或加载失败待重试） */
  content: ChapterContent | null;
}

/**
 * 维护 [prev, current, next] 三章内容窗口：
 * - LRU 缓存（上限 10 章），窗口平移时相邻章按需加载
 * - getChapter 并发去重（同章只发一次请求）
 * - 仅当前章加载失败时上报 error（邻章失败静默，等窗口平移重试）
 */
export function useChapterWindow(
  bookId: string | undefined,
  chapterIndex: number,
  chapterCount: number,
): { window: ChapterWindowItem[]; error: string | null } {
  const cacheRef = useRef(new Map<number, ChapterContent>());
  const inflightRef = useRef(new Set<number>());
  // 缓存内容更新时递增，触发窗口重算
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // 渲染期同步：请求回调里判断「当前章是否已切走」，避免陈旧失败误报
  const chapterIndexRef = useRef(chapterIndex);
  chapterIndexRef.current = chapterIndex;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 换书时清空缓存与在途标记（渲染期同步处理，避免旧书内容闪现）
  const lastBookRef = useRef(bookId);
  if (lastBookRef.current !== bookId) {
    lastBookRef.current = bookId;
    cacheRef.current.clear();
    inflightRef.current.clear();
  }

  useEffect(() => {
    if (!bookId || chapterCount <= 0) return;
    setError(null);
    // 当前章优先，其次下一章、上一章
    const wanted = [chapterIndex, chapterIndex + 1, chapterIndex - 1].filter(
      (idx) => idx >= 0 && idx < chapterCount,
    );
    for (const idx of wanted) {
      if (cacheRef.current.has(idx) || inflightRef.current.has(idx)) continue;
      inflightRef.current.add(idx);
      getChapter(bookId, idx)
        .then((ch) => {
          // 书已切换则丢弃过期响应（不动 inflight——它已属于新书）
          if (lastBookRef.current !== bookId) return;
          inflightRef.current.delete(idx);
          // delete + set 刷新 LRU 顺序（Map 按插入序迭代）
          cacheRef.current.delete(idx);
          cacheRef.current.set(idx, ch);
          evictStale(cacheRef.current, wanted);
          if (mountedRef.current) setVersion((v) => v + 1);
        })
        .catch((err: unknown) => {
          if (lastBookRef.current !== bookId) return;
          inflightRef.current.delete(idx);
          if (!mountedRef.current) return;
          // 邻章预取失败静默；当前章失败（且尚未切走）才需要用户可见
          if (idx === chapterIndexRef.current) {
            setError(
              err instanceof ApiError || err instanceof Error
                ? err.message
                : "加载章节失败",
            );
          }
        });
    }
  }, [bookId, chapterIndex, chapterCount]);

  const windowItems = useMemo<ChapterWindowItem[]>(() => {
    void version; // 缓存更新时重算
    if (!bookId || chapterCount <= 0) return [];
    const items: ChapterWindowItem[] = [];
    for (const idx of [chapterIndex - 1, chapterIndex, chapterIndex + 1]) {
      if (idx < 0 || idx >= chapterCount) continue;
      items.push({ index: idx, content: cacheRef.current.get(idx) ?? null });
    }
    return items;
  }, [bookId, chapterIndex, chapterCount, version]);

  return { window: windowItems, error };
}

/** 超出上限时淘汰最旧且不在当前窗口内的章 */
function evictStale(cache: Map<number, ChapterContent>, keep: number[]): void {
  if (cache.size <= CACHE_LIMIT) return;
  for (const key of cache.keys()) {
    if (keep.includes(key)) continue;
    cache.delete(key);
    if (cache.size <= CACHE_LIMIT) return;
  }
}
