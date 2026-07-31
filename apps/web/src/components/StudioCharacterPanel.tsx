import type { StudioCharacter } from "@yudu/shared";
import { OutlineButton, PrimaryButton } from "./buttons";
import { CHARACTER_FIELDS } from "../lib/studioPrompts";

interface StudioCharacterPanelProps {
  characters: StudioCharacter[];
  /** 刚手动新增的角色 id，该卡默认展开 */
  newlyAddedId: string | null;
  saving: boolean;
  generating: boolean;
  onChange: (i: number, patch: Partial<StudioCharacter>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onGenerate: () => void;
  onSave: () => void;
  onStop: () => void;
}

/** 各维度输入框的行数，按内容量给 */
const FIELD_ROWS: Record<string, number> = {
  ageIdentity: 2,
  speech: 2,
  background: 4,
  relations: 4,
};

/**
 * 人设面板：一个角色一张可折叠卡片，展开后按 8 个维度编辑。
 * 纯受控展示，生成与保存交回父页。
 */
export default function StudioCharacterPanel({
  characters,
  newlyAddedId,
  saving,
  generating,
  onChange,
  onAdd,
  onRemove,
  onGenerate,
  onSave,
  onStop,
}: StudioCharacterPanelProps) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
      <div className="flex flex-wrap gap-2">
        <PrimaryButton
          disabled={generating}
          onClick={onGenerate}
          className="px-3 py-1.5"
        >
          {generating ? "生成中…" : "AI 生成人设"}
        </PrimaryButton>
        <OutlineButton onClick={onAdd} className="px-3 py-1.5">
          添加角色
        </OutlineButton>
        <OutlineButton
          disabled={saving || generating}
          onClick={onSave}
          className="px-3 py-1.5"
        >
          保存人设
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

      {characters.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          暂无人设。先在「立项」写好故事想法，再点「AI 生成人设」会更贴题。
        </p>
      ) : (
        <ul className="space-y-2">
          {characters.map((c, i) => (
            <li key={c.id}>
              <details
                open={c.id === newlyAddedId}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)]"
              >
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-[var(--text)]">
                      {c.name || "未命名角色"}
                    </span>
                    <span className="ml-2 text-[var(--text-muted)]">
                      {c.role || "未定位"}
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <FieldLabel label="姓名">
                      <input
                        value={c.name}
                        onChange={(e) => onChange(i, { name: e.target.value })}
                        className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
                      />
                    </FieldLabel>
                    <FieldLabel label="故事定位">
                      <input
                        value={c.role}
                        placeholder="主角 / 反派 / 导师…"
                        onChange={(e) => onChange(i, { role: e.target.value })}
                        className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
                      />
                    </FieldLabel>
                  </div>

                  {CHARACTER_FIELDS.map((f) => (
                    <FieldLabel key={f.key} label={f.label}>
                      <textarea
                        value={c[f.key] ?? ""}
                        onChange={(e) => onChange(i, { [f.key]: e.target.value })}
                        rows={FIELD_ROWS[f.key] ?? 3}
                        className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm leading-relaxed"
                      />
                    </FieldLabel>
                  ))}

                  {c.description ? (
                    <FieldLabel label="旧描述（改造前生成，可自行拆到上面各栏）">
                      <textarea
                        value={c.description}
                        onChange={(e) =>
                          onChange(i, { description: e.target.value })
                        }
                        rows={3}
                        className="rounded border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm leading-relaxed"
                      />
                    </FieldLabel>
                  ) : null}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}
