import type { StudioPremise } from "@yudu/shared";
import { useState } from "react";
import { OutlineButton, PrimaryButton } from "./buttons";
import {
  GENRE_PRESETS,
  IDEA_SAMPLES,
  LENGTH_PRESETS,
  TONE_PRESETS,
} from "../lib/studioPresets";

interface StudioPremisePanelProps {
  title: string;
  breakLimit: boolean;
  /** 立项草稿，由父页持有；本组件只读值 + 回调改值 */
  premise: StudioPremise;
  /** AI 产出的书名候选，不持久化 */
  titleCandidates: string[];
  saving: boolean;
  generating: boolean;
  onTitleChange: (v: string) => void;
  /** 返回 false 表示被 18+ 二次确认拦下，勾选不生效 */
  onBreakLimitChange: (v: boolean) => boolean;
  onPremiseChange: (patch: Partial<StudioPremise>) => void;
  onAiPremise: () => void;
  onAiTitles: () => void;
  onStop: () => void;
  onSave: () => void;
}

/**
 * 立项面板：先说想看什么故事，再由 AI 补全书名 / 类型 / 基调 / 篇幅 / 卖点。
 * 纯受控展示，不发网络请求、不读 AI 设置，生成与保存都交回父页。
 */
export default function StudioPremisePanel({
  title,
  breakLimit,
  premise,
  titleCandidates,
  saving,
  generating,
  onTitleChange,
  onBreakLimitChange,
  onPremiseChange,
  onAiPremise,
  onAiTitles,
  onStop,
  onSave,
}: StudioPremisePanelProps) {
  const autoChapterCount = premise.autoChapterCount ?? true;

  return (
    <div className="space-y-4">
      {/* 灵感区：AI 立项的入口 */}
      <section className="space-y-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--bg-elevated)] p-5">
        <div>
          <h2 className="text-base font-medium text-[var(--text)]">
            你想看一个什么样的故事？
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            用大白话随便说，不用想专业术语。AI 会据此把下面的书名、类型、基调都填好，你再改。
          </p>
        </div>
        <textarea
          value={premise.idea ?? ""}
          onChange={(e) => onPremiseChange({ idea: e.target.value })}
          rows={4}
          placeholder={IDEA_SAMPLES[0]!.text}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--text-muted)]">没头绪？试试：</span>
          {IDEA_SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPremiseChange({ idea: s.text })}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={generating}
            onClick={onAiPremise}
            className="px-4 py-2"
          >
            {generating ? "立项中…" : "AI 帮我立项"}
          </PrimaryButton>
          {generating ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              停止
            </button>
          ) : null}
        </div>
      </section>

      {/* 立项字段 */}
      <section className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">书名</span>
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="还没想好？点右边让 AI 起几个"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              />
            </label>
            <OutlineButton
              disabled={generating}
              onClick={onAiTitles}
              className="px-3 py-2"
            >
              ⟳ 换一批书名
            </OutlineButton>
          </div>
          {titleCandidates.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[var(--text-muted)]">候选：</span>
              {titleCandidates.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTitleChange(t)}
                  className={`rounded-full border px-3 py-1 transition-colors ${
                    t === title
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  }`}
                >
                  《{t}》
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={breakLimit}
            onChange={(e) => onBreakLimitChange(e.target.checked)}
          />
          <span>
            <span className="text-[var(--text)]">破限模式（18+）</span>
            <span className="mt-1 block text-[var(--text-muted)]">
              内置 Gemini 向破限提示：可写露骨成人向虚构，默认细腻文风（避免粗口暴躁流）；禁止未成年人相关。仍依赖你自选的模型。
            </span>
          </span>
        </label>

        <TagPicker
          label="类型"
          hint="题材大类，决定世界观和读者预期。可多选。"
          presets={GENRE_PRESETS}
          value={premise.genre ?? ""}
          onChange={(v) => onPremiseChange({ genre: v })}
        />

        <TagPicker
          label="基调"
          hint="整体情绪，决定读起来是什么感觉。可多选。"
          presets={TONE_PRESETS}
          value={premise.tone ?? ""}
          onChange={(v) => onPremiseChange({ tone: v })}
        />

        <TagRadio
          label="目标篇幅"
          hint="影响分章数量与每章的信息密度。"
          presets={LENGTH_PRESETS}
          value={premise.targetLength ?? ""}
          onChange={(v) => onPremiseChange({ targetLength: v })}
        />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">一句话卖点</span>
          <input
            value={premise.logline ?? ""}
            onChange={(e) => onPremiseChange({ logline: e.target.value })}
            placeholder="例：她只想苟活，儿子却要造反"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
          <span className="text-xs text-[var(--text-muted)]">
            全书最核心的一句钩子，后续每一步生成都会参考它。
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">额外要求</span>
          <textarea
            value={premise.notes ?? ""}
            onChange={(e) => onPremiseChange({ notes: e.target.value })}
            rows={3}
            placeholder="例：主角必须叫林晚；别写重生梗；用第一人称；结局要 HE"
            className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
          />
          <span className="text-xs text-[var(--text-muted)]">
            写硬性约束和你的雷点，AI 在人设、大纲、正文里都会尽量遵守。
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={autoChapterCount}
            onChange={(e) =>
              onPremiseChange({ autoChapterCount: e.target.checked })
            }
          />
          <span>
            <span className="text-[var(--text)]">让 AI 自行决定分章数</span>
            <span className="mt-1 block text-[var(--text-muted)]">
              开启后，细纲生成时 AI 会自行决定合理章数；关闭则固定 10 章。
            </span>
          </span>
        </label>

        <PrimaryButton
          disabled={saving}
          onClick={onSave}
          className="px-4 py-2"
        >
          {saving ? "保存中…" : "保存立项"}
        </PrimaryButton>
      </section>
    </div>
  );
}

/** 「｜」拼接的多值字符串 → 数组 */
function splitValue(value: string): string[] {
  return value
    .split("｜")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 多选标签：预置项之外，已选的表外词也会渲染出来，不会丢 */
function TagPicker({
  label,
  hint,
  presets,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const selected = splitValue(value);
  const extras = selected.filter((s) => !presets.includes(s));

  function toggle(tag: string) {
    const next = selected.includes(tag)
      ? selected.filter((s) => s !== tag)
      : [...selected, tag];
    onChange(next.join("｜"));
  }

  function addCustom() {
    const tag = custom.trim();
    if (tag && !selected.includes(tag)) onChange([...selected, tag].join("｜"));
    setCustom("");
    setCustomOpen(false);
  }

  return (
    <div className="space-y-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {[...presets, ...extras].map((tag) => (
          <Chip
            key={tag}
            label={tag}
            active={selected.includes(tag)}
            onClick={() => toggle(tag)}
          />
        ))}
        {customOpen ? (
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onBlur={addCustom}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
              if (e.key === "Escape") {
                setCustom("");
                setCustomOpen(false);
              }
            }}
            placeholder="自定义…"
            className="w-28 rounded-full border border-[var(--accent)] bg-[var(--bg)] px-3 py-1 text-[var(--text)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            ＋自定义
          </button>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

/** 单选标签：再点一次取消 */
function TagRadio({
  label,
  hint,
  presets,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const extra = value && !presets.includes(value) ? [value] : [];
  return (
    <div className="space-y-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <div className="flex flex-wrap gap-2">
        {[...presets, ...extra].map((tag) => (
          <Chip
            key={tag}
            label={tag}
            active={value === tag}
            onClick={() => onChange(value === tag ? "" : tag)}
          />
        ))}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 transition-colors ${
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--bg)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
    >
      {label}
    </button>
  );
}
