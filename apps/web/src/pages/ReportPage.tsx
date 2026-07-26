import { MIN_REPORT_YEAR } from "@yudu/shared";
import type { AnnualReportResponse } from "@yudu/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ReadingHeatmap from "../components/ReadingHeatmap";
import { getAnnualReport } from "../lib/api";
import { formatDuration } from "../lib/readingStats";

const WEEK_MS = 7 * 86_400_000;
const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

/** 该日期所在周的周一（正午基准，规避夏令时误差） */
function mondayNoon(d: Date): Date {
  const m = new Date(d);
  m.setHours(12, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** 年度热力图参数：终点取该年末与今天的较早者，列数覆盖 1 月 1 日起的所有周 */
function heatmapParamsOf(year: number): {
  endDate: Date;
  weekCount: number;
  rangeStart: string;
} {
  const now = new Date();
  const endDate =
    year === now.getFullYear() ? now : new Date(year, 11, 31, 12);
  const start = new Date(year, 0, 1, 12);
  const weekCount =
    Math.round(
      (mondayNoon(endDate).getTime() - mondayNoon(start).getTime()) / WEEK_MS,
    ) + 1;
  return { endDate, weekCount, rangeStart: `${year}-01-01` };
}

export default function ReportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<AnnualReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAnnualReport(year);
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setError(
            err instanceof Error ? err.message : "加载年度报告失败",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const heatmap = useMemo(() => heatmapParamsOf(year), [year]);

  // 年内无任何动静（读完数为全量口径，不参与判断）
  const empty =
    report != null &&
    report.totalSeconds === 0 &&
    report.booksRead === 0 &&
    report.highlightCount === 0 &&
    report.bookmarkCount === 0;

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold tracking-wide text-[var(--accent)]">
          雨读
        </h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/library"
            className="rounded text-[var(--text)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            书架
          </Link>
        </nav>
      </header>

      <section className="mx-auto mt-8 max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-medium text-[var(--text)]">
              年度阅读报告
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              这一年，与书页和雨声作伴的时光
            </p>
          </div>
          <div className="flex items-center gap-2">
            <YearButton
              label="上一年"
              disabled={year <= MIN_REPORT_YEAR}
              onClick={() => setYear((y) => y - 1)}
            >
              ‹
            </YearButton>
            <span className="min-w-[4.5rem] text-center text-lg font-medium tabular-nums text-[var(--text)]">
              {year} 年
            </span>
            <YearButton
              label="下一年"
              disabled={year >= currentYear}
              onClick={() => setYear((y) => y + 1)}
            >
              ›
            </YearButton>
          </div>
        </div>

        {error ? (
          <p
            className="mb-4 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
            <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
          </div>
        ) : report == null ? null : empty ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-12 text-center">
            <p className="text-lg text-[var(--text)]">
              {year} 年还没有留下阅读足迹
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              翻开一本书读上几分钟，这里就会亮起来。
            </p>
            <Link
              to="/library"
              className="mt-6 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              去书架
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 指标卡片 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="阅读总时长" value={formatDuration(report.totalSeconds)} />
              <MetricCard label="活跃天数" value={`${report.activeDays} 天`} />
              <MetricCard label="最长连续" value={`${report.maxStreakDays} 天`} />
              <MetricCard
                label="最忙的一天"
                value={
                  report.busiestDay
                    ? formatDayLabel(report.busiestDay.date)
                    : "—"
                }
                hint={
                  report.busiestDay
                    ? formatDuration(report.busiestDay.seconds)
                    : undefined
                }
              />
              <MetricCard label="读过的书" value={`${report.booksRead} 本`} />
              <MetricCard label="读完的书" value={`${report.booksFinished} 本`} />
              <MetricCard
                label="标注 / 笔记"
                value={`${report.highlightCount} / ${report.noteCount} 条`}
              />
              <MetricCard label="书签" value={`${report.bookmarkCount} 个`} />
            </div>

            {/* 月度分布：纯 CSS 柱状条 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
              <h3 className="text-sm font-medium text-[var(--text)]">
                月度阅读时长
              </h3>
              <MonthlyBars monthlySeconds={report.monthlySeconds} />
            </div>

            {/* 年度热力图 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4">
              <h3 className="mb-3 text-sm font-medium text-[var(--text)]">
                每日足迹
              </h3>
              <ReadingHeatmap
                days={report.days}
                endDate={heatmap.endDate}
                weekCount={heatmap.weekCount}
                rangeStart={heatmap.rangeStart}
                ariaLabel={`${year} 年每日阅读时长热力图`}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function YearButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 rounded-lg border border-[var(--border)] text-lg leading-none text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text)]"
    >
      {children}
    </button>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-medium tabular-nums text-[var(--text)]">
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/** 12 个月柱状条：高度按当年最大月份归一化；零值月只留基线薄条 */
function MonthlyBars({ monthlySeconds }: { monthlySeconds: number[] }) {
  const max = Math.max(...monthlySeconds, 0);
  return (
    <div className="mt-3 flex items-end gap-1.5 sm:gap-2">
      {MONTH_LABELS.map((label, i) => {
        const seconds = monthlySeconds[i] ?? 0;
        // 非零月份至少 6% 高度，避免小值看不见
        const pct = max > 0 && seconds > 0 ? Math.max((seconds / max) * 100, 6) : 0;
        return (
          <div
            key={label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${label} · ${formatDuration(seconds)}`}
          >
            <div className="flex h-28 w-full items-end">
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: pct > 0 ? `${pct}%` : "2px",
                  background: pct > 0 ? "var(--accent)" : "var(--heat-0)",
                }}
              />
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** '2026-01-06' → '1月6日' */
function formatDayLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}月${Number(d)}日`;
}
