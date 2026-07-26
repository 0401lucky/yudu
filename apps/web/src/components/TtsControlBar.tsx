import type { TtsState } from "../hooks/useTts";
import { TTS_RATES } from "../hooks/useTts";

interface TtsControlBarProps {
  /** playing / paused（idle 时宿主不渲染本组件） */
  state: TtsState;
  rate: number;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onToggle: () => void;
  onStop: () => void;
  onRate: (rate: number) => void;
  onVoice: (uri: string | null) => void;
}

/** 听书控制条：播放/暂停、语速、音色、退出（常驻底部，不随工具栏隐藏） */
export default function TtsControlBar({
  state,
  rate,
  voices,
  voiceURI,
  onToggle,
  onStop,
  onRate,
  onVoice,
}: TtsControlBarProps) {
  const playing = state === "playing";
  // 优先展示中文音色；一个都没有时列出全部并提示
  const zhVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("zh"));
  const shownVoices = zhVoices.length > 0 ? zhVoices : voices;
  const noZhVoice = voices.length > 0 && zhVoices.length === 0;

  const selectClass =
    "h-9 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

  return (
    <div className="reader-chrome shrink-0 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? "暂停朗读" : "继续朗读"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <select
          value={rate}
          onChange={(e) => onRate(Number(e.target.value))}
          aria-label="语速"
          className={`${selectClass} shrink-0`}
        >
          {TTS_RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <select
          value={voiceURI ?? ""}
          onChange={(e) => onVoice(e.target.value || null)}
          aria-label="音色"
          className={`${selectClass} flex-1`}
        >
          <option value="">默认音色</option>
          {shownVoices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name}（{v.lang}）
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onStop}
          className="flex h-10 shrink-0 items-center rounded-lg px-2.5 text-sm text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          退出
        </button>
      </div>
      {noZhVoice ? (
        <p className="mx-auto mt-1 max-w-3xl text-[11px] text-[var(--text-muted)]">
          未检测到中文音色，朗读效果可能欠佳
        </p>
      ) : null}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}
