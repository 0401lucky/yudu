import { describe, expect, it } from "vitest";
import {
  buildHeatmapGrid,
  calcStreak,
  formatDuration,
  levelOf,
  localDateStr,
  quantileThresholds,
  toSecondsMap,
} from "./readingStats";

function mapOf(entries: Array<[string, number]>): Map<string, number> {
  return new Map(entries);
}

describe("localDateStr", () => {
  it("输出本地日期并补零", () => {
    expect(localDateStr(new Date(2026, 6, 24))).toBe("2026-07-24");
    expect(localDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("calcStreak", () => {
  const today = new Date(2026, 6, 24);

  it("今天已读时从今天起算", () => {
    const map = mapOf([
      ["2026-07-24", 60],
      ["2026-07-23", 120],
      ["2026-07-22", 30],
    ]);
    expect(calcStreak(map, today)).toBe(3);
  });

  it("今天还没读时从昨天起算，不打断连续", () => {
    const map = mapOf([
      ["2026-07-23", 120],
      ["2026-07-22", 30],
    ]);
    expect(calcStreak(map, today)).toBe(2);
  });

  it("中断一天后重置", () => {
    const map = mapOf([
      ["2026-07-24", 60],
      ["2026-07-22", 30], // 缺 07-23
    ]);
    expect(calcStreak(map, today)).toBe(1);
  });

  it("无任何记录为 0", () => {
    expect(calcStreak(new Map(), today)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("按分钟与小时分段格式化", () => {
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatDuration(30)).toBe("不足 1 分钟");
    expect(formatDuration(150)).toBe("2 分钟");
    expect(formatDuration(3600)).toBe("1 小时");
    expect(formatDuration(3900)).toBe("1 小时 5 分");
  });
});

describe("quantileThresholds / levelOf", () => {
  it("均匀分布时四档各就其位", () => {
    const t = quantileThresholds([10, 20, 30, 40]);
    expect(t).toEqual([20, 30, 40]);
    expect(levelOf(10, t)).toBe(1);
    expect(levelOf(20, t)).toBe(2);
    expect(levelOf(30, t)).toBe(3);
    expect(levelOf(40, t)).toBe(4);
  });

  it("唯一非零值落最高档", () => {
    const t = quantileThresholds([0, 60]);
    expect(levelOf(60, t)).toBe(4);
  });

  it("零值恒为 0 档", () => {
    expect(levelOf(0, quantileThresholds([60]))).toBe(0);
    expect(levelOf(0, null)).toBe(0);
  });
});

describe("buildHeatmapGrid", () => {
  const today = new Date(2026, 6, 24); // 2026-07-24（周五）
  const map = mapOf([
    ["2026-07-24", 60],
    ["2026-07-20", 300],
  ]);

  it("列数与行序正确：行 0 全为周一", () => {
    const { weeks } = buildHeatmapGrid(map, today, 52);
    expect(weeks).toHaveLength(52);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
      const [y, m, d] = week[0]!.date.split("-").map(Number);
      expect(new Date(y!, m! - 1, d!).getDay()).toBe(1);
    }
  });

  it("最后一列包含今天，晚于今天的格子标记 inFuture", () => {
    const { weeks } = buildHeatmapGrid(map, today, 52);
    const last = weeks[51]!;
    const todayCell = last.find((c) => c.date === "2026-07-24");
    expect(todayCell).toBeDefined();
    expect(todayCell!.inFuture).toBe(false);
    expect(todayCell!.seconds).toBe(60);
    // 周五之后的周六、周日为未来格
    expect(last.filter((c) => c.inFuture).map((c) => c.date)).toEqual([
      "2026-07-25",
      "2026-07-26",
    ]);
  });

  it("月份标签在列首月份变化处出现且不重复", () => {
    const { monthLabels } = buildHeatmapGrid(map, today, 52);
    expect(monthLabels.length).toBeGreaterThanOrEqual(11);
    const cols = monthLabels.map((m) => m.col);
    expect(new Set(cols).size).toBe(cols.length);
    expect(monthLabels.every((m) => m.col > 0)).toBe(true);
  });

  it("空数据时全部为 0 档", () => {
    const { weeks } = buildHeatmapGrid(new Map(), today, 4);
    expect(
      weeks.flat().every((c) => c.level === 0 && c.seconds === 0),
    ).toBe(true);
  });

  it("rangeStart 之前的格子标记 outOfRange，缺省时恒为 false", () => {
    const cells = buildHeatmapGrid(map, today, 4, "2026-07-01").weeks.flat();
    expect(cells.some((c) => c.outOfRange)).toBe(true);
    for (const c of cells) {
      expect(c.outOfRange).toBe(c.date < "2026-07-01");
    }
    // 不传 rangeStart 时行为与原版一致
    const defaults = buildHeatmapGrid(map, today, 4).weeks.flat();
    expect(defaults.every((c) => !c.outOfRange)).toBe(true);
  });
});

describe("toSecondsMap", () => {
  it("稀疏数组转 Map", () => {
    const map = toSecondsMap([
      { date: "2026-07-24", seconds: 60 },
      { date: "2026-07-20", seconds: 30 },
    ]);
    expect(map.get("2026-07-24")).toBe(60);
    expect(map.get("2026-07-21")).toBeUndefined();
  });
});
