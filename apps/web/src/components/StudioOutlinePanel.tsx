import type { StudioOutlineDetail } from "@yudu/shared";
import { OutlineButton, PrimaryButton } from "./buttons";
import { OUTLINE_FIELDS } from "../lib/studioPrompts";

interface StudioOutlinePanelProps {
  /** 旧版整段大纲，仅在非空时展示 */
  outline: string;
  outlineDetail: StudioOutlineDetail;
  saving: boolean;
  generating: boolean;
  onDetailChange: (patch: Partial<StudioOutlineDetail>) => void;
  onOutlineChange: (v: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  onStop: () => void;
}

/** 各字段输入框行数；一句话主线用单行 input，不在此表 */
const FIELD_ROWS: Record<string, number> = {
  setting: 4,
  conflict: 3,
  act1: 4,
  act2: 4,
  act3: 4,
  act4: 4,
  subplots: 4,
};

/**
 * 总大纲面板：8 个结构化字段 + 旧大纲兜底区。
 * 纯受控展示，生成与保存交回父页。
 */
export default function StudioOutlinePanel({
  outline,
  outlineDetail,
  saving,
  generating,
  onDetailChange,
  onOutlineChange,
  onGenerate,
  onSave,
  onStop,
}: StudioOutlinePanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={generating}
          onClick={onGenerate}
          className="px-3 py-1.5"
        >
          {generating ? "生成中…" : "AI 生成总大纲"}
        </PrimaryButton>
        <OutlineButton
          disabled={saving || generating}
          onClick={onSave}
          className="px-3 py-1.5"
        >
          保存大纲
        </OutlineButton>
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

      <div className="space-y-3">
        {OUTLINE_FIELDS.map((f) =>
          f.key === "throughline" ? (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs text-[var(--text-muted)]">{f.label}</span>
              <input
                value={outlineDetail[f.key] ?? ""}
                onChange={(e) => onDetailChange({ [f.key]: e.target.value })}
                placeholder="一句话说清全书在讲什么"
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs text-[var(--text-muted)]">{f.label}</span>
              <textarea
                value={outlineDetail[f.key] ?? ""}
                onChange={(e) => onDetailChange({ [f.key]: e.target.value })}
                rows={FIELD_ROWS[f.key] ?? 3}
                className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-serif text-sm leading-relaxed"
              />
            </label>
          ),
        )}

        {outline ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-muted)]">
              旧大纲（改造前生成，可自行拆到上面各栏）
            </span>
            <textarea
              value={outline}
              onChange={(e) => onOutlineChange(e.target.value)}
              rows={10}
              className="rounded border border-dashed border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-serif text-sm leading-relaxed"
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
