import { FONT_STACK } from "../components/readerTypography";
import type { MeasureFn } from "./quoteCardLayout";
import { layoutText, QUOTE_MAX_CHARS, truncateToWidth } from "./quoteCardLayout";

/** 卡片模板：雨夜深色 / 纸页浅色 */
export type QuoteCardTemplate = "night" | "paper";

/** 卡片内容（与入口页面的数据形状对齐；作者可缺省） */
export interface QuoteCardData {
  excerpt: string;
  note: string | null;
  bookTitle: string;
  bookAuthor: string | null;
  /** 标注创建时间（毫秒时间戳） */
  createdAt: number;
}

/** 模板色板：取自 index.css 双主题 CSS 变量的实际值（Canvas 无法读取 CSS 变量） */
const PALETTES: Record<
  QuoteCardTemplate,
  { bg: string; text: string; muted: string; accent: string; border: string }
> = {
  night: {
    bg: "#0e1311",
    text: "#e6e2d6",
    muted: "#8a918c",
    accent: "#c4a574",
    border: "#24302a",
  },
  paper: {
    bg: "#f7f2e8",
    text: "#1c1916",
    muted: "#6b6560",
    accent: "#8b6914",
    border: "#e0d6c6",
  },
};

// ---- 逻辑尺寸（固定宽 750，导出按 2x 缩放）----
const WIDTH = 750;
const SCALE = 2;
const PAD_X = 64;
const CONTENT_W = WIDTH - PAD_X * 2;
/** 内描边与画布边缘的间距 */
const FRAME_INSET = 20;

const QUOTE_MARK_FONT = `96px ${FONT_STACK.serif}`;
const QUOTE_FONT = `32px ${FONT_STACK.serif}`;
const QUOTE_LINE_H = 54;
const NOTE_FONT = `24px ${FONT_STACK.sans}`;
const NOTE_LINE_H = 40;
/** 笔记块左侧竖线 + 缩进（视觉上与摘录区分） */
const NOTE_INDENT = 24;
const META_FONT = `24px ${FONT_STACK.sans}`;
const DATE_FONT = `20px ${FONT_STACK.sans}`;
const BRAND_FONT = `26px ${FONT_STACK.serif}`;

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/**
 * 绘制书摘卡片：引号装饰 + 摘录、笔记（有则显示）、书名·作者、日期、「雨读」落款。
 * 高度随内容自适应；返回 2x 像素的 canvas（逻辑宽 750 → 实际 1500）。
 */
export function renderQuoteCard(
  data: QuoteCardData,
  template: QuoteCardTemplate,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境不支持 Canvas 绘图");
  const palette = PALETTES[template];

  // 指定字体下的测量函数（每次调用前设置 font，避免段落间串味）
  const measureWith = (font: string): MeasureFn => (s) => {
    ctx.font = font;
    return ctx.measureText(s).width;
  };

  // ---- 第一遍：排版计算（canvas 改尺寸会重置状态，先算好再绘制）----
  const quoteLayout = layoutText(data.excerpt.trim() || "（无摘录）", {
    maxWidth: CONTENT_W,
    lineHeight: QUOTE_LINE_H,
    measure: measureWith(QUOTE_FONT),
    maxChars: QUOTE_MAX_CHARS,
  });
  const note = data.note?.trim() ?? "";
  const noteLayout = note
    ? layoutText(note, {
        maxWidth: CONTENT_W - NOTE_INDENT,
        lineHeight: NOTE_LINE_H,
        measure: measureWith(NOTE_FONT),
      })
    : null;
  const metaLine = truncateToWidth(
    `《${data.bookTitle}》${data.bookAuthor ? ` · ${data.bookAuthor}` : ""}`,
    CONTENT_W,
    measureWith(META_FONT),
  );

  // ---- 纵向布局（textBaseline 统一用 top）----
  const markTop = 64; // 引号装饰顶部
  const quoteTop = markTop + 76; // 装饰引号约占 76 高
  let y = quoteTop + quoteLayout.totalHeight;
  const noteTop = y + 40;
  if (noteLayout) y = noteTop + noteLayout.totalHeight;
  const metaTop = y + 56;
  const dateTop = metaTop + 40;
  const dividerY = dateTop + 28 + 36;
  const brandTop = dividerY + 26;
  const height = brandTop + 34 + 48; // 落款高 + 底部留白

  canvas.width = WIDTH * SCALE;
  canvas.height = Math.round(height * SCALE);
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // 背景 + 内描边（安静的画框感）
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    FRAME_INSET + 0.5,
    FRAME_INSET + 0.5,
    WIDTH - FRAME_INSET * 2 - 1,
    height - FRAME_INSET * 2 - 1,
  );

  // 引号装饰
  ctx.fillStyle = palette.accent;
  ctx.font = QUOTE_MARK_FONT;
  ctx.fillText("“", PAD_X - 10, markTop);

  // 摘录
  ctx.fillStyle = palette.text;
  ctx.font = QUOTE_FONT;
  quoteLayout.lines.forEach((line, i) => {
    ctx.fillText(line, PAD_X, quoteTop + i * QUOTE_LINE_H);
  });

  // 笔记：左侧强调色竖线 + 缩进 + 次级文字
  if (noteLayout) {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(PAD_X, noteTop + 4, 3, Math.max(0, noteLayout.totalHeight - 12));
    ctx.fillStyle = palette.muted;
    ctx.font = NOTE_FONT;
    noteLayout.lines.forEach((line, i) => {
      ctx.fillText(line, PAD_X + NOTE_INDENT, noteTop + i * NOTE_LINE_H);
    });
  }

  // 书名 · 作者
  ctx.fillStyle = palette.text;
  ctx.font = META_FONT;
  ctx.fillText(metaLine, PAD_X, metaTop);

  // 日期
  ctx.fillStyle = palette.muted;
  ctx.font = DATE_FONT;
  ctx.fillText(formatDate(data.createdAt), PAD_X, dateTop);

  // 分隔线 + 「雨读」落款（居中）
  ctx.strokeStyle = palette.border;
  ctx.beginPath();
  ctx.moveTo(PAD_X, dividerY + 0.5);
  ctx.lineTo(WIDTH - PAD_X, dividerY + 0.5);
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.font = BRAND_FONT;
  ctx.textAlign = "center";
  ctx.fillText("雨 读", WIDTH / 2, brandTop);
  ctx.textAlign = "left";

  return canvas;
}

/** 导出 PNG Blob（失败时 reject，交由调用方提示） */
export function quoteCardToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成图片失败"));
    }, "image/png");
  });
}
