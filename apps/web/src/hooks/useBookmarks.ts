import type { BookmarkDto, ChapterMeta } from "@yudu/shared";
import { MAX_BOOKMARK_LABEL_CHARS } from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createBookmark,
  deleteBookmark,
  listBookmarks,
} from "../lib/api";

/** 待创建书签的锚点（charOffset 换算在 ReaderPage 完成） */
export interface BookmarkAnchor {
  chapterIndex: number;
  charOffset: number;
  label: string;
}

/** 旧版 localStorage 书签（仅迁移用） */
interface LegacyBookmark {
  chapterIndex: number;
  pageInChapter: number;
  label: string;
}

/**
 * 单页典型字符容量（中文一页约 600 字）：
 * 旧书签迁移换算、ReaderPage 滚动模式的近似页/书签点亮区间共用同一口径
 */
export const ASSUMED_PAGE_CHARS = 600;

function legacyKey(bookId: string): string {
  return `yudu.reader.bookmarks.${bookId}`;
}

/** 读取旧版本地书签；key 不存在返回 null，存在但无有效条目返回 [] */
function readLegacy(bookId: string): LegacyBookmark[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(legacyKey(bookId));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is LegacyBookmark =>
        b != null &&
        typeof b === "object" &&
        typeof (b as LegacyBookmark).chapterIndex === "number" &&
        (b as LegacyBookmark).chapterIndex >= 0 &&
        typeof (b as LegacyBookmark).pageInChapter === "number" &&
        (b as LegacyBookmark).pageInChapter >= 0,
    );
  } catch {
    return [];
  }
}

function clearLegacy(bookId: string): void {
  try {
    localStorage.removeItem(legacyKey(bookId));
  } catch {
    // 静默
  }
}

function sortMarks(list: BookmarkDto[]): BookmarkDto[] {
  return [...list].sort(
    (a, b) => a.chapterIndex - b.chapterIndex || a.charOffset - b.charOffset,
  );
}

/** 按 id 去重后排序合并 */
function mergeMark(list: BookmarkDto[], mark: BookmarkDto): BookmarkDto[] {
  if (list.some((b) => b.id === mark.id)) return list;
  return sortMarks([...list, mark]);
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * 云端书签：打开书拉取；增删乐观更新，失败回滚并暴露 error 供 UI 提示。
 * chapters 用于旧版 localStorage 书签的一次性迁移换算（页号 → 近似 charOffset）。
 */
export function useBookmarks(
  bookId: string | undefined,
  chapters: ChapterMeta[] | undefined,
) {
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 云端拉取成功后才允许迁移，避免网络异常时误清本地数据
  const [loaded, setLoaded] = useState(false);
  const migratedRef = useRef<string | null>(null);
  // 创建完成前被用户删除的乐观临时项 id：创建返回后需撤销云端记录
  const removedTempIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setBookmarks([]);
    setLoaded(false);
    setError(null);
    removedTempIdsRef.current.clear();
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listBookmarks(bookId);
        if (cancelled) return;
        setBookmarks(sortMarks(list));
        setLoaded(true);
      } catch {
        // 拉取失败静默：不打断阅读，本次会话书签功能降级
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  // 旧版本地书签一次性迁移：全部上传成功才清 key，部分失败保留下次重试
  //（服务端同锚点幂等，重试不会产生重复书签）
  useEffect(() => {
    if (!bookId || !loaded || !chapters || chapters.length === 0) return;
    if (migratedRef.current === bookId) return;
    migratedRef.current = bookId;

    const legacy = readLegacy(bookId);
    if (legacy == null) return;
    if (legacy.length === 0) {
      // 空数组或已损坏的旧数据：直接清理
      clearLegacy(bookId);
      return;
    }

    let cancelled = false;
    (async () => {
      let allOk = true;
      for (const old of legacy) {
        if (cancelled) return; // 中断则保留本地 key，下次重试
        const chapterIndex = Math.min(
          Math.max(0, old.chapterIndex),
          chapters.length - 1,
        );
        const charCount = chapters[chapterIndex]?.charCount ?? 0;
        const charOffset = Math.max(
          0,
          Math.min(old.pageInChapter * ASSUMED_PAGE_CHARS, charCount - 1),
        );
        const label = (
          (typeof old.label === "string" && old.label.trim()) ||
          `第 ${chapterIndex + 1} 章`
        ).slice(0, MAX_BOOKMARK_LABEL_CHARS);
        try {
          const dto = await createBookmark(bookId, {
            chapterIndex,
            charOffset,
            label,
          });
          if (!cancelled) {
            setBookmarks((prev) => mergeMark(prev, dto));
          }
        } catch {
          allOk = false;
        }
      }
      if (allOk) {
        clearLegacy(bookId);
      }
    })();
    return () => {
      cancelled = true;
      // 中断（含 StrictMode 开发期二次挂载）时清除标记允许重试；
      // 同锚点服务端幂等，重试不会产生重复书签
      migratedRef.current = null;
    };
  }, [bookId, loaded, chapters]);

  const add = useCallback(
    async (anchor: BookmarkAnchor) => {
      if (!bookId) return;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: BookmarkDto = {
        id: tempId,
        ...anchor,
        createdAt: Date.now(),
      };
      setBookmarks((prev) => sortMarks([...prev, temp]));
      try {
        const dto = await createBookmark(bookId, anchor);
        // 创建期间用户已删除该乐观项（快速连点 toggle）：撤销云端记录，不再展示
        if (removedTempIdsRef.current.delete(tempId)) {
          try {
            await deleteBookmark(bookId, dto.id);
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) return;
            // 撤销失败：恢复展示，保持与云端一致
            setBookmarks((prev) => mergeMark(prev, dto));
            setError(errText(err, "删除书签失败，请稍后重试"));
          }
          return;
        }
        setBookmarks((prev) =>
          sortMarks(
            prev
              .filter((b) => b.id !== tempId)
              .filter((b) => b.id !== dto.id)
              .concat(dto),
          ),
        );
      } catch (err) {
        setBookmarks((prev) => prev.filter((b) => b.id !== tempId));
        // 创建期间用户已删除该项：结果与用户意图一致，静默即可
        if (!removedTempIdsRef.current.delete(tempId)) {
          setError(errText(err, "添加书签失败，请稍后重试"));
        }
      }
    },
    [bookId],
  );

  const remove = useCallback(
    async (mark: BookmarkDto) => {
      if (!bookId) return;
      setBookmarks((prev) => prev.filter((b) => b.id !== mark.id));
      // 尚未落库的乐观临时项：本地移除并登记，待创建返回后撤销云端记录
      if (mark.id.startsWith("temp-")) {
        removedTempIdsRef.current.add(mark.id);
        return;
      }
      try {
        await deleteBookmark(bookId, mark.id);
      } catch (err) {
        // 云端已不存在视为删除成功
        if (err instanceof ApiError && err.status === 404) return;
        setBookmarks((prev) => mergeMark(prev, mark));
        setError(errText(err, "删除书签失败，请稍后重试"));
      }
    },
    [bookId],
  );

  const clearError = useCallback(() => setError(null), []);

  return { bookmarks, add, remove, error, clearError };
}
