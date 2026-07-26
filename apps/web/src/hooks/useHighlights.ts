import type { HighlightColor, HighlightDto } from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  createHighlight,
  deleteHighlight,
  listHighlights,
  patchHighlightColor,
  updateHighlightNote,
} from "../lib/api";

/** 待创建高亮的锚点（偏移由 textAnchor 在渲染 DOM 上实测） */
export interface HighlightAnchor {
  chapterIndex: number;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  excerpt: string;
}

function sortHls(list: HighlightDto[]): HighlightDto[] {
  return [...list].sort(
    (a, b) => a.chapterIndex - b.chapterIndex || a.startOffset - b.startOffset,
  );
}

/** 按 id 去重后排序合并 */
function mergeHl(list: HighlightDto[], hl: HighlightDto): HighlightDto[] {
  if (list.some((h) => h.id === hl.id)) return list;
  return sortHls([...list, hl]);
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/**
 * 云端文本高亮：打开书拉取全书；增删改色乐观更新，
 * 失败回滚并暴露 error 供 UI 提示（对标 useBookmarks，无 legacy 迁移）。
 */
export function useHighlights(bookId: string | undefined) {
  const [highlights, setHighlights] = useState<HighlightDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 创建完成前被用户删除的乐观临时项 id：创建返回后需撤销云端记录
  const removedTempIdsRef = useRef<Set<string>>(new Set());
  // 创建完成前被改色的乐观临时项：创建返回后补一次改色
  const recoloredTempRef = useRef<Map<string, HighlightColor>>(new Map());
  // 创建完成前被写笔记的乐观临时项：创建返回后补一次改笔记
  const notedTempRef = useRef<Map<string, string | null>>(new Map());

  useEffect(() => {
    setHighlights([]);
    setError(null);
    removedTempIdsRef.current.clear();
    recoloredTempRef.current.clear();
    notedTempRef.current.clear();
    if (!bookId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listHighlights(bookId);
        if (cancelled) return;
        setHighlights(sortHls(list));
      } catch {
        // 拉取失败静默：不打断阅读，本次会话高亮功能降级
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const add = useCallback(
    async (anchor: HighlightAnchor) => {
      if (!bookId) return;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: HighlightDto = {
        id: tempId,
        ...anchor,
        note: null,
        createdAt: Date.now(),
      };
      setHighlights((prev) => sortHls([...prev, temp]));
      try {
        const dto = await createHighlight(bookId, anchor);
        // 创建期间用户已删除该乐观项：撤销云端记录，不再展示
        if (removedTempIdsRef.current.delete(tempId)) {
          recoloredTempRef.current.delete(tempId);
          notedTempRef.current.delete(tempId);
          try {
            await deleteHighlight(bookId, dto.id);
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) return;
            // 撤销失败：恢复展示，保持与云端一致
            setHighlights((prev) => mergeHl(prev, dto));
            setError(errText(err, "删除标注失败，请稍后重试"));
          }
          return;
        }
        // 创建期间用户已改色：补一次改色（失败保留服务端颜色）
        let finalDto = dto;
        const pendingColor = recoloredTempRef.current.get(tempId);
        recoloredTempRef.current.delete(tempId);
        if (pendingColor && pendingColor !== dto.color) {
          try {
            finalDto = await patchHighlightColor(bookId, dto.id, pendingColor);
          } catch {
            finalDto = dto;
          }
        }
        // 创建期间用户已写笔记：补一次改笔记（失败保留服务端笔记）
        const hasPendingNote = notedTempRef.current.has(tempId);
        const pendingNote = notedTempRef.current.get(tempId) ?? null;
        notedTempRef.current.delete(tempId);
        if (hasPendingNote && pendingNote !== finalDto.note) {
          try {
            finalDto = await updateHighlightNote(
              bookId,
              finalDto.id,
              pendingNote,
            );
          } catch {
            // 保留服务端笔记
          }
        }
        setHighlights((prev) =>
          sortHls(
            prev
              .filter((h) => h.id !== tempId)
              .filter((h) => h.id !== finalDto.id)
              .concat(finalDto),
          ),
        );
      } catch (err) {
        setHighlights((prev) => prev.filter((h) => h.id !== tempId));
        recoloredTempRef.current.delete(tempId);
        notedTempRef.current.delete(tempId);
        // 创建期间用户已删除该项：结果与用户意图一致，静默即可
        if (!removedTempIdsRef.current.delete(tempId)) {
          setError(errText(err, "添加标注失败，请稍后重试"));
        }
      }
    },
    [bookId],
  );

  const remove = useCallback(
    async (hl: HighlightDto) => {
      if (!bookId) return;
      setHighlights((prev) => prev.filter((h) => h.id !== hl.id));
      // 尚未落库的乐观临时项：本地移除并登记，待创建返回后撤销云端记录
      if (hl.id.startsWith("temp-")) {
        removedTempIdsRef.current.add(hl.id);
        return;
      }
      try {
        await deleteHighlight(bookId, hl.id);
      } catch (err) {
        // 云端已不存在视为删除成功
        if (err instanceof ApiError && err.status === 404) return;
        setHighlights((prev) => mergeHl(prev, hl));
        setError(errText(err, "删除标注失败，请稍后重试"));
      }
    },
    [bookId],
  );

  const recolor = useCallback(
    async (hl: HighlightDto, color: HighlightColor) => {
      if (!bookId || hl.color === color) return;
      setHighlights((prev) =>
        prev.map((h) => (h.id === hl.id ? { ...h, color } : h)),
      );
      // 尚未落库的乐观临时项：登记目标色，待创建返回后补改
      if (hl.id.startsWith("temp-")) {
        recoloredTempRef.current.set(hl.id, color);
        return;
      }
      try {
        await patchHighlightColor(bookId, hl.id, color);
      } catch (err) {
        // 云端已不存在：本地移除，保持与云端一致
        if (err instanceof ApiError && err.status === 404) {
          setHighlights((prev) => prev.filter((h) => h.id !== hl.id));
          return;
        }
        setHighlights((prev) =>
          prev.map((h) => (h.id === hl.id ? { ...h, color: hl.color } : h)),
        );
        setError(errText(err, "修改颜色失败，请稍后重试"));
      }
    },
    [bookId],
  );

  const updateNote = useCallback(
    async (hl: HighlightDto, note: string | null) => {
      if (!bookId) return;
      // 与服务端同口径：trim 后空串视为清除（存 null）
      const normalized = note?.trim() || null;
      if ((hl.note ?? null) === normalized) return;
      setHighlights((prev) =>
        prev.map((h) => (h.id === hl.id ? { ...h, note: normalized } : h)),
      );
      // 尚未落库的乐观临时项：登记目标笔记，待创建返回后补改
      if (hl.id.startsWith("temp-")) {
        notedTempRef.current.set(hl.id, normalized);
        return;
      }
      try {
        await updateHighlightNote(bookId, hl.id, normalized);
      } catch (err) {
        // 云端已不存在：本地移除，保持与云端一致
        if (err instanceof ApiError && err.status === 404) {
          setHighlights((prev) => prev.filter((h) => h.id !== hl.id));
          return;
        }
        setHighlights((prev) =>
          prev.map((h) => (h.id === hl.id ? { ...h, note: hl.note } : h)),
        );
        setError(errText(err, "保存笔记失败，请稍后重试"));
      }
    },
    [bookId],
  );

  const clearError = useCallback(() => setError(null), []);

  return { highlights, add, remove, recolor, updateNote, error, clearError };
}
