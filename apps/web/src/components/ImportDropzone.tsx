import { MAX_UPLOAD_BYTES, SUPPORTED_FORMATS } from "@yudu/shared";
import { useCallback, useRef, useState } from "react";

const ACCEPT = ".txt,.md,.markdown,.epub,text/plain,text/markdown,application/epub+zip";

interface ImportDropzoneProps {
  /** 支持多文件；同批「书名-序号」会在服务端合并 */
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
  /** 校验/本地错误回传页面（避免小按钮下错误看不见） */
  onLocalError?: (message: string | null) => void;
}

function isSupportedName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    SUPPORTED_FORMATS.some((ext) => lower.endsWith(`.${ext}`)) ||
    lower.endsWith(".markdown")
  );
}

export default function ImportDropzone({
  onFiles,
  disabled,
  compact,
  onLocalError,
}: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const reportError = useCallback(
    (msg: string | null) => {
      setHint(msg);
      onLocalError?.(msg);
    },
    [onLocalError],
  );

  const validateAndSend = useCallback(
    async (list: FileList | File[] | null | undefined) => {
      reportError(null);
      if (!list || list.length === 0) {
        reportError("未选择任何文件");
        return;
      }

      try {
        const files = Array.from(list);
        const accepted: File[] = [];
        const rejected: string[] = [];

        for (const file of files) {
          if (!isSupportedName(file.name)) {
            rejected.push(`${file.name}（格式不支持）`);
            continue;
          }
          if (file.size > MAX_UPLOAD_BYTES) {
            rejected.push(
              `${file.name}（超过 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB）`,
            );
            continue;
          }
          if (file.size === 0) {
            rejected.push(`${file.name}（空文件）`);
            continue;
          }
          accepted.push(file);
        }

        if (!accepted.length) {
          reportError(
            rejected.length
              ? `无法导入：${rejected.join("；")}`
              : "没有可导入的文件（请选 txt / md / epub）",
          );
          return;
        }

        if (rejected.length) {
          reportError(`部分已跳过：${rejected.join("；")}。正在上传其余文件…`);
        } else {
          reportError(null);
          setHint(`正在导入 ${accepted.length} 个文件…`);
        }

        await onFiles(accepted);
        setHint(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "选择文件后处理失败";
        reportError(msg);
        console.error("[ImportDropzone]", err);
      }
    },
    [onFiles, reportError],
  );

  function openPicker() {
    if (disabled) return;
    // 重置 value，保证连续选同一文件也会触发 change
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;
    await validateAndSend(e.dataTransfer.files);
  }

  return (
    <div className={compact ? "relative" : "w-full"}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const list = e.target.files;
          void validateAndSend(list);
        }}
      />

      {compact ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          className="min-h-[44px] rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm text-[var(--accent)] hover:border-[var(--accent)]/60 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {disabled ? "导入中…" : "导入文件"}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={openPicker}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-60 ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent)]/10"
              : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)]/60"
          }`}
        >
          <p className="text-base text-[var(--text)]">
            {disabled
              ? "正在导入…"
              : "点击选择文件，或拖拽到此处（可多选）"}
          </p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            支持 txt / md / epub（更多格式规划中）· 最大{" "}
            {MAX_UPLOAD_BYTES / (1024 * 1024)}
            MB/个
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            「标题-01/02」可合并为一部作品；之后再导「标题-03」会追加章节
          </p>
        </button>
      )}

      {hint && !onLocalError ? (
        <p
          className={`mt-2 text-sm ${hint.includes("正在") ? "text-[var(--text-muted)]" : "text-red-400"}`}
          role="status"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
