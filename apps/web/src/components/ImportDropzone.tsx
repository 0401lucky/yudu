import { MAX_UPLOAD_BYTES, SUPPORTED_FORMATS } from "@yudu/shared";
import { useCallback, useId, useRef, useState } from "react";

const ACCEPT = SUPPORTED_FORMATS.map((f) => `.${f}`).join(",");

interface ImportDropzoneProps {
  /** 支持多文件；同批「书名-序号」会在服务端合并 */
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
}

function isSupportedName(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_FORMATS.some((ext) => lower.endsWith(`.${ext}`));
}

export default function ImportDropzone({
  onFiles,
  disabled,
  compact,
}: ImportDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndSend = useCallback(
    async (list: FileList | File[] | null | undefined) => {
      setLocalError(null);
      if (!list || list.length === 0) return;

      const files = Array.from(list);
      const accepted: File[] = [];
      for (const file of files) {
        if (!isSupportedName(file.name)) {
          setLocalError(`跳过不支持的格式：${file.name}（仅 txt / md / epub）`);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          setLocalError(
            `${file.name} 超过上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
          );
          continue;
        }
        if (file.size === 0) {
          setLocalError(`${file.name} 为空`);
          continue;
        }
        accepted.push(file);
      }

      if (!accepted.length) {
        setLocalError((prev) => prev ?? "没有可导入的文件");
        return;
      }

      await onFiles(accepted);
    },
    [onFiles],
  );

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
    <div className={compact ? "" : "w-full"}>
      <label
        htmlFor={inputId}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)] ${
          compact
            ? "min-h-[44px] border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm"
            : "min-h-[160px] border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-10"
        } ${
          dragging
            ? "border-[var(--accent)] bg-[var(--accent)]/10"
            : "hover:border-[var(--accent)]/60"
        } ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={async (e) => {
            const list = e.target.files;
            e.target.value = "";
            await validateAndSend(list);
          }}
        />
        {compact ? (
          <span className="text-[var(--accent)]">
            {disabled ? "导入中…" : "导入书籍"}
          </span>
        ) : (
          <>
            <p className="text-base text-[var(--text)]">
              {disabled
                ? "正在导入…"
                : "拖拽文件到此处，或点击选择（可多选）"}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              支持 txt / md / epub · 最大{" "}
              {MAX_UPLOAD_BYTES / (1024 * 1024)}MB/个
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              「书名-01」「书名-02」等同批会自动合并为一本书
            </p>
          </>
        )}
      </label>
      {localError ? (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
