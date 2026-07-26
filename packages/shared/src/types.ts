import type { BookFormat, HighlightColor } from "./constants";

export type BookStatus = "processing" | "ready" | "failed";
export type ThemeId = "night" | "paper";

export interface UserPublic {
  id: string;
  email: string;
  displayName: string | null;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  coverUrl: string | null;
  status: BookStatus;
  errorMessage: string | null;
  chapterCount: number;
  progressPercent: number | null;
  updatedAt: number;
}

export interface ChapterMeta {
  index: number;
  title: string;
  charCount: number;
}

export interface BookDetail {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  status: BookStatus;
  chapters: ChapterMeta[];
}

export interface ChapterContent {
  index: number;
  title: string;
  /**
   * 章节正文。
   * - txt / epub：纯文本
   * - md：Markdown 子集源文（阅读器按 format=md 渲染）
   */
  text: string;
}

export interface ReadingProgress {
  bookId: string;
  chapterIndex: number;
  charOffset: number;
  pageInChapter: number | null;
  updatedAt: number;
}

/** 云端书签；锚点为章内近似字符偏移（与进度同步同款换算） */
export interface BookmarkDto {
  id: string;
  chapterIndex: number;
  charOffset: number;
  label: string;
  createdAt: number;
}

/**
 * 云端文本高亮；锚点为章内「渲染后纯文本」字符偏移区间 [startOffset, endOffset)
 * （md 书以渲染 DOM 文本为准，与书签/进度同一近似家族）
 */
export interface HighlightDto {
  id: string;
  chapterIndex: number;
  startOffset: number;
  /** 开区间终点，恒大于 startOffset */
  endOffset: number;
  color: HighlightColor;
  /** 摘录文本（列表展示用，服务端截断存储） */
  excerpt: string;
  createdAt: number;
}

export interface UserPreferences {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  pageMargin: "compact" | "normal" | "relaxed";
}

/** 书内全文搜索：单条命中 */
export interface BookSearchMatch {
  chapterIndex: number;
  chapterTitle: string;
  /**
   * 命中点在该章的字符索引；与章节 charCount 同坐标系
   * （md 书为渲染近似纯文本口径，其余为源文口径）
   */
  charOffset: number;
  /** 上下文摘录（命中点前后各约 30 字符，空白折叠为空格） */
  excerpt: string;
  /** 关键词在 excerpt 中的起始索引（前端高亮用） */
  keywordStart: number;
}

/** 书内全文搜索：响应 */
export interface BookSearchResult {
  query: string;
  matches: BookSearchMatch[];
  /** 是否因全书命中上限截断 */
  truncated: boolean;
}

/** 单日阅读时长；date 为用户本地日期 YYYY-MM-DD */
export interface DailyReadingStat {
  date: string;
  seconds: number;
}

/** 阅读统计查询响应：仅含非零记录（稀疏，前端自行补零） */
export interface ReadingStatsResponse {
  days: DailyReadingStat[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
