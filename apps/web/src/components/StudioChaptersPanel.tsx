import type { StudioChapterOutline } from "@yudu/shared";
import { CHAPTER_FIELDS } from "../lib/studioPrompts";

interface StudioChaptersPanelProps {
  chapters: StudioChapterOutline[];
  /** 刚手动新增的章序号，该卡默认展开 */
  newlyAddedIndex: number | null;
  /** 立项里的「AI 自行决定章数」，只影响生成按钮文案 */
  autoChapterCount: boolean;
  saving: boolean;
  generating: boolean;
  onChange: (i: number, patch: Partial<StudioChapterOutline>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onGenerate: () => void;
  onSave: () => void;
  onStop: () => void;
}

/** 各字段输入框行数 */
const FIELD_ROWS: Record<string, number> = {
  summary: 3,
  conflict: 2,
  hook: 2,
  characters: 2,
};

/**
 * 分章细纲面板：一章一张可折叠卡片。
 * 几十章时平铺会把页面拉得极长，故默认收起只显示「第 N 章 · 标题」。
 */
export default function StudioChaptersPanel({
  chapters,
  newlyAddedIndex,
  autoChapterCount,
  saving,
  generating,
  onChange,
  onAdd,
  onRemove,
  onGenerate,
  onSave,
  onStop,
}: StudioChaptersPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={generating}
          onClick={onGenerate}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
        >
          {generating
            ? "生成中…"
            : autoChapterCount
              ? "AI 生成细纲（自动章数）"
              : "AI 生成细纲（10 章）"}
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          加一章细纲
        </button>
        <button
          type="button"
          disabled={saving || generating}
          onClick={onSave}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
        >
          保存细纲
        </button>
        {generating ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300"
          >
            停止
          </button>
        ) : null}
      </div>

      {chapters.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          暂无细纲。先写好总大纲，再点「AI 生成细纲」会更连贯。
        </p>
      ) : (
        <ul className="space-y-2">
          {chapters.map((ch, i) => (
            <li key={i}>
              <details
                open={i === newlyAddedIndex}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)]"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-[var(--text-muted)]">第 {i + 1} 章</span>
                    <span className="ml-2 font-medium text-[var(--text)]">
                      {ch.title || "未命名"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      // summary 内的按钮点击会连带切换折叠，这里拦掉
                      e.preventDefault();
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    className="shrink-0 rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    删除
                  </button>
                </summary>

                <div className="space-y-3 border-t border-[var(--border)] p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[var(--text-muted)]">章标题</span>
                    <input
                      value={ch.title}
                      onChange={(e) => onChange(i, { title: e.target.value })}
                      className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm font-medium"
                    />
                  </label>
                  {CHAPTER_FIELDS.map((f) => (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        {f.label}
                      </span>
                      <textarea
                        value={ch[f.key] ?? ""}
                        onChange={(e) => onChange(i, { [f.key]: e.target.value })}
                        rows={FIELD_ROWS[f.key] ?? 2}
                        className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm leading-relaxed"
                      />
                    </label>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
