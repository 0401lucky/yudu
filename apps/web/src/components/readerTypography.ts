import type { FontFamilyId } from "../hooks/useLocalReaderPrefs";

/** 阅读版心排版常量：翻页视口与滚动视口共用，保证两种模式观感一致 */

export type PageMarginId = "compact" | "normal" | "relaxed";

export const VERTICAL_PAD: Record<PageMarginId, string> = {
  compact: "0.75rem",
  normal: "1rem",
  relaxed: "1.25rem",
};

/** 栏内左右内边距（版心已限宽，大屏不再用巨大 padding「硬挤」） */
export const HORIZONTAL_PAD: Record<PageMarginId, string> = {
  compact: "0.85rem",
  normal: "1.15rem",
  relaxed: "1.5rem",
};

/**
 * 桌面端版心最大宽度（相对字号的 em），避免整屏拉行导致难读。
 * 中文约 32～40 字/行更舒适；边距档位略调宽窄。
 */
export const MEASURE_EM: Record<PageMarginId, number> = {
  compact: 34,
  normal: 38,
  relaxed: 42,
};

/**
 * 字体栈：serif 引用 index.css 的 --font-serif（单一来源，供 style.fontFamily 消费）；
 * sans 保留字面量——阅读用 sans 栈（Noto Sans SC 系）与 UI 的 --font-sans（system-ui 系）不同源。
 */
export const FONT_STACK: Record<FontFamilyId, string> = {
  serif: "var(--font-serif)",
  sans: '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
};
