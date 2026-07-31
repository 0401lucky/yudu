import { MAX_HIGHLIGHT_NOTE_CHARS } from "@yudu/shared";
import { useEffect, useState } from "react";
import { OutlineButton, PrimaryButton } from "./buttons";
import SheetShell from "./SheetShell";

interface NoteEditorSheetProps {
  open: boolean;
  /** 高亮摘录（面板顶部展示，让用户知道在为哪段文字写想法） */
  excerpt: string;
  /** 当前笔记；无笔记传空串 */
  initialNote: string;
  onClose: () => void;
  /** 保存；空串 = 清除笔记 */
  onSave: (note: string) => void;
}

/** 从底部滑入的笔记编辑面板（样式对标 ReaderSettingsSheet） */
export default function NoteEditorSheet({
  open,
  excerpt,
  initialNote,
  onClose,
  onSave,
}: NoteEditorSheetProps) {
  const [draft, setDraft] = useState(initialNote);

  // 每次打开时以当前笔记重置草稿
  useEffect(() => {
    if (open) setDraft(initialNote);
  }, [open, initialNote]);

  const overLimit = draft.length > MAX_HIGHLIGHT_NOTE_CHARS;

  return (
    <SheetShell
      open={open}
      onClose={onClose}
      overlayLabel="关闭笔记编辑"
      ariaLabel="编辑想法"
    >
      <div className="mx-auto max-w-lg space-y-3">
        {excerpt ? (
          <blockquote className="line-clamp-2 border-l-2 border-[var(--accent)] pl-2 text-sm leading-snug text-[var(--text-muted)]">
            {excerpt}
          </blockquote>
        ) : null}

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="写下这一刻的想法…"
          rows={4}
          maxLength={MAX_HIGHLIGHT_NOTE_CHARS}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          aria-label="想法内容"
        />

        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-xs ${
              overLimit ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
            }`}
          >
            {draft.length}/{MAX_HIGHLIGHT_NOTE_CHARS}
          </span>
          <div className="flex items-center gap-2">
            {initialNote ? (
              <button
                type="button"
                onClick={() => onSave("")}
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                清除想法
              </button>
            ) : null}
            <OutlineButton onClick={onClose} className="px-3 py-1.5">
              取消
            </OutlineButton>
            <PrimaryButton
              onClick={() => onSave(draft)}
              disabled={overLimit}
              className="px-4 py-1.5"
            >
              保存
            </PrimaryButton>
          </div>
        </div>
      </div>
    </SheetShell>
  );
}
