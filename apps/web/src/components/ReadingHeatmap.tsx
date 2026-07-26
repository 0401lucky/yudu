import type { DailyReadingStat } from "@yudu/shared";
import { useEffect, useMemo, useRef } from "react";
import {
  buildHeatmapGrid,
  formatDuration,
  HEATMAP_WEEKS,
  toSecondsMap,
} from "../lib/readingStats";

/** 格子边长 / 间距（px）；列宽 = CELL + GAP */
const CELL = 11;
const GAP = 2;
const COL_W = CELL + GAP;
/** 左侧周几参考轴宽度（含与网格的间距） */
const WEEKDAY_W = 26;

/** 五档背景：0 档中性灰 + 1–4 档 accent 色阶（变量见 index.css，双主题各自调档） */
const LEVEL_BG = [
  "var(--heat-0)",
  "var(--heat-1)",
  "var(--heat-2)",
  "var(--heat-3)",
  "var(--heat-4)",
] as const;

/** 周几缩写只标三行：周一 / 周四 / 周日 */
const WEEKDAY_LABELS: Record<number, string> = { 0: "一", 3: "四", 6: "日" };

function cellTitle(date: string, seconds: number): string {
  const [y, m, d] = date.split("-");
  const dateText = `${y}年${Number(m)}月${Number(d)}日`;
  return seconds > 0
    ? `${dateText} · ${formatDuration(seconds)}`
    : `${dateText} · 未阅读`;
}

interface ReadingHeatmapProps {
  days: DailyReadingStat[];
  /** 网格终点日期，默认今天；年度报告传该年末（或今天，取较早者） */
  endDate?: Date;
  /** 周列数，默认 HEATMAP_WEEKS（52） */
  weekCount?: number;
  /** 起始下界 YYYY-MM-DD，早于它的格子渲染为空白占位（裁掉上一年尾巴） */
  rangeStart?: string;
  /** 无障碍描述，默认「过去 N 周…」 */
  ariaLabel?: string;
}

/**
 * GitHub 风格阅读热力图：列 = 周（左往右时间递增），行 = 周一…周日。
 * 窄屏横向滚动，默认停在最近一周；悬停格子显示日期与时长。
 */
export default function ReadingHeatmap({
  days,
  endDate,
  weekCount = HEATMAP_WEEKS,
  rangeStart,
  ariaLabel,
}: ReadingHeatmapProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { weeks, monthLabels } = useMemo(
    () =>
      buildHeatmapGrid(
        toSecondsMap(days),
        endDate ?? new Date(),
        weekCount,
        rangeStart,
      ),
    [days, endDate, weekCount, rangeStart],
  );
  const empty = !days.some((d) => d.seconds > 0);

  // 移动端容器放不下整年时，默认滚到最右（最近）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <div>
      <div ref={scrollRef} className="heat-scroll overflow-x-auto pb-1">
        <div
          // pr 给最后一列的月份标签留溢出余量（absolute 定位不计入 w-max 宽度）
          className="w-max pr-4"
          role="img"
          aria-label={ariaLabel ?? `过去 ${weekCount} 周的每日阅读时长热力图`}
        >
          {/* 月份参考轴 */}
          <div
            className="relative h-4 text-[11px] leading-4 text-[var(--text-muted)]"
            style={{ marginLeft: WEEKDAY_W }}
          >
            {monthLabels.map((m) => (
              <span
                key={m.col}
                className="absolute"
                style={{ left: m.col * COL_W }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex">
            {/* 周几参考轴 */}
            <div
              className="grid shrink-0 pr-1.5 text-right text-[10px] text-[var(--text-muted)]"
              style={{
                width: WEEKDAY_W,
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                rowGap: GAP,
              }}
            >
              {Array.from({ length: 7 }, (_, row) => (
                <span key={row} className="leading-[11px]">
                  {WEEKDAY_LABELS[row] ?? ""}
                </span>
              ))}
            </div>
            {/* 网格：grid 列优先填充，与 weeks[col][row] 展开顺序一致 */}
            <div
              className="grid"
              style={{
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoFlow: "column",
                gridAutoColumns: `${CELL}px`,
                gap: GAP,
              }}
            >
              {weeks.flat().map((cell) =>
                cell.inFuture || cell.outOfRange ? (
                  <div key={cell.date} style={{ width: CELL, height: CELL }} />
                ) : (
                  <div
                    key={cell.date}
                    className="heat-cell rounded-sm"
                    style={{
                      width: CELL,
                      height: CELL,
                      background: LEVEL_BG[cell.level],
                    }}
                    title={cellTitle(cell.date, cell.seconds)}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      {/* 空态文案与强度图例 */}
      <div className="mt-2 flex items-center justify-between gap-3">
        {empty ? (
          <p className="text-xs text-[var(--text-muted)]">
            开始阅读，点亮你的第一格
          </p>
        ) : (
          <span />
        )}
        <div
          className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-muted)]"
          aria-hidden
        >
          <span className="mr-0.5">少</span>
          {LEVEL_BG.map((bg) => (
            <span
              key={bg}
              className="rounded-sm"
              style={{ width: CELL, height: CELL, background: bg }}
            />
          ))}
          <span className="ml-0.5">多</span>
        </div>
      </div>
    </div>
  );
}
