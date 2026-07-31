import { useEffect, useMemo, useState } from "react";
import { OutlineButton, PrimaryButton } from "./buttons";
import type { QuoteCardData, QuoteCardTemplate } from "../lib/quoteCardRender";
import { quoteCardToBlob, renderQuoteCard } from "../lib/quoteCardRender";

interface QuoteCardModalProps {
  /** 卡片内容；由入口页面在打开时组装 */
  data: QuoteCardData;
  onClose: () => void;
}

const TEMPLATES: { id: QuoteCardTemplate; label: string }[] = [
  { id: "night", label: "雨夜" },
  { id: "paper", label: "纸页" },
];

/**
 * 书摘分享卡片预览弹窗：Canvas 生成 → objectURL 预览；
 * 支持模板切换、保存 PNG、系统分享（navigator.share 可用且支持文件时）。
 */
export default function QuoteCardModal({ data, onClose }: QuoteCardModalProps) {
  const [template, setTemplate] = useState<QuoteCardTemplate>("night");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 内容/模板变化时重新绘制导出
  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const canvas = renderQuoteCard(data, template);
        const nextBlob = await quoteCardToBlob(canvas);
        if (!cancelled) setBlob(nextBlob);
      } catch {
        if (!cancelled) setError("生成卡片失败，请稍后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, template]);

  // Escape 关闭（对齐 SearchDrawer 惯例；组件仅在打开时挂载）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // objectURL 生命周期：blob 更替 / 组件卸载时 revoke
  useEffect(() => {
    if (!blob) return;
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  const fileName = `《${data.bookTitle}》书摘.png`;

  // 系统分享：需 share + canShare 且当前环境允许分享文件
  const shareFile = useMemo(
    () => (blob ? new File([blob], fileName, { type: "image/png" }) : null),
    [blob, fileName],
  );
  const canShare =
    shareFile != null &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [shareFile] });

  const handleSave = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const handleShare = () => {
    if (!shareFile) return;
    // 用户取消分享（AbortError）等失败静默忽略
    void navigator.share({ files: [shareFile] }).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="分享书摘卡片"
    >
      <button
        type="button"
        aria-label="关闭分享卡片"
        onClick={onClose}
        className="yudu-fade-in absolute inset-0 bg-black/60"
      />
      <div className="yudu-modal-in relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--text)]">分享书摘</h2>
          <div
            className="flex items-center gap-1 rounded-full border border-[var(--border)] p-0.5"
            role="group"
            aria-label="卡片模板"
          >
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={template === t.id}
                onClick={() => setTemplate(t.id)}
                className={`rounded-full px-3 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  template === t.id
                    ? "bg-[var(--accent)] font-medium text-[var(--bg)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-4">
          {error ? (
            <p className="py-10 text-center text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : url ? (
            <img
              src={url}
              alt="书摘卡片预览"
              className="w-full rounded-lg shadow-lg"
            />
          ) : (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              生成中…
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            关闭
          </button>
          {canShare ? (
            <OutlineButton onClick={handleShare} className="px-3 py-1.5">
              分享
            </OutlineButton>
          ) : null}
          <PrimaryButton
            onClick={handleSave}
            disabled={!url}
            className="px-4 py-1.5"
          >
            保存图片
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
