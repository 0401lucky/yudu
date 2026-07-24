import type { DailyReadingStat } from "@yudu/shared";
import { useMemo, useState } from "react";
import {
  calcStreak,
  formatDuration,
  localDateStr,
  toSecondsMap,
} from "../lib/readingStats";
import ReadingHeatmap from "./ReadingHeatmap";

interface ReadingStatsBarProps {
  /** 近一年稀疏日数据；null 表示加载中（渲染占位骨架） */
  days: DailyReadingStat[] | null;
}

/** 书架顶部阅读统计条：今日时长 + 连续天数，点击展开热力图面板 */
export default function ReadingStatsBar({ days }: ReadingStatsBarProps) {
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    if (!days) return null;
    const map = toSecondsMap(days);
    const now = new Date();
    return {
      todaySeconds: map.get(localDateStr(now)) ?? 0,
      streak: calcStreak(map, now),
    };
  }, [days]);

  if (!days || !summary) {
    return (
      <div
        className="mb-6 h-11 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]"
        aria-hidden
      />
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-[color:color-mix(in_srgb,var(--text)_5%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text)]">
          <span className="flex items-center gap-1.5">
            <ClockIcon />
            <span>
              今日{" "}
              <strong className="font-medium tabular-nums">
                {formatDuration(summary.todaySeconds)}
              </strong>
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <FlameIcon lit={summary.streak > 0} />
            <span>
              连续{" "}
              <strong className="font-medium tabular-nums">
                {summary.streak}
              </strong>{" "}
              天
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)]">
          热力图
          <ChevronIcon open={open} />
        </span>
      </button>
      {/* 展开/收起：grid-rows 0fr↔1fr 平滑过渡（reduced-motion 已由全局规则削弱） */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[var(--border)] px-4 pb-3 pt-3">
            <ReadingHeatmap days={days} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--text-muted)]"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function FlameIcon({ lit }: { lit: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={lit ? "var(--accent)" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={lit ? undefined : "text-[var(--text-muted)]"}
      aria-hidden
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
