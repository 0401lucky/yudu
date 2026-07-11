import { MAX_UPLOAD_BYTES, SUPPORTED_FORMATS } from "@yudu/shared";
import { useCallback, useId, useRef, useState } from "react";

const ACCEPT = SUPPORTED_FORMATS.map((f) => `.${f}`).join(",");

interface ImportDropzoneProps {
  onFile: (file: File) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
}

function isSupportedName(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_FORMATS.some((ext) => lower.endsWith(`.${ext}`));
}

export default function ImportDropzone({
  onFile,
  disabled,
  compact,
}: ImportDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndSend = useCallback(
    async (file: File | undefined | null) => {
      setLocalError(null);
      if (!file) return;

      if (!isSupportedName(file.name)) {
        setLocalError("仅支持 txt、md、epub 格式");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setLocalError(`文件超过上限 ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`);
        return;
      }
      if (file.size === 0) {
        setLocalError("文件为空");
        return;
      }

      await onFile(file);
    },
    [onFile],
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
    const file = e.dataTransfer.files?.[0];
    await validateAndSend(file);
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
          className="sr-only"
          disabled={disabled}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            await validateAndSend(file);
          }}
        />
        {compact ? (
          <span className="text-[var(--accent)]">
            {disabled ? "导入中…" : "导入书籍"}
          </span>
        ) : (
          <>
            <p className="text-base text-[var(--text)]">
              {disabled ? "正在导入…" : "拖拽文件到此处，或点击选择"}
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              支持 txt / md / epub，最大 {MAX_UPLOAD_BYTES / (1024 * 1024)}MB
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
