import type { BookFormat, BookSource, HighlightColor } from "./constants";

export type BookStatus = "processing" | "ready" | "failed";
export type ThemeId = "night" | "paper";
export type { BookSource };

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
  /** 导入时间（毫秒时间戳），书架「最近导入」排序用 */
  createdAt: number;
  /** 最近阅读时间（进度 updated_at）；无阅读记录为 null */
  lastReadAt: number | null;
  /** 所属分组名；未分组为 null */
  group: string | null;
  /** 来源：导入或创作台；旧数据缺省按 import */
  source: BookSource;
  /** 是否出现在书架；创作台默认 false，导入默认 true */
  onShelf: boolean;
  /** 创作台破限（18+）模式；导入书恒为 false */
  breakLimit: boolean;
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
  source: BookSource;
  onShelf: boolean;
  breakLimit: boolean;
}

/** 创作台立项补充信息 */
export interface StudioPremise {
  genre?: string;
  tone?: string;
  targetLength?: string;
  notes?: string;
}

/** 创作台人设卡片 */
export interface StudioCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
}

/** 分章细纲一条 */
export interface StudioChapterOutline {
  index: number;
  title: string;
  summary: string;
}

/** 创作台设定资产（人设/大纲/细纲），跟书上云 */
export interface StudioAssets {
  premise: StudioPremise;
  characters: StudioCharacter[];
  outline: string;
  chapterOutlines: StudioChapterOutline[];
  updatedAt: number;
}

/** 创作台作品详情 = 目录 + 设定 */
export interface StudioBookDetail extends BookDetail {
  source: "studio";
  /** 本书生成使用的模型 id；未单独设置时为空，回退到全局默认模型 */
  model?: string;
  assets: StudioAssets;
}

/** 空设定模板 */
export function emptyStudioAssets(now = Date.now()): StudioAssets {
  return {
    premise: {},
    characters: [],
    outline: "",
    chapterOutlines: [],
    updatedAt: now,
  };
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
  /** 附加笔记；无笔记为 null（服务端 trim 后空串也存 null） */
  note: string | null;
  createdAt: number;
}

/** 笔记汇总页条目：高亮 + 章节标题（chapters 缺失时服务端兜底「第 N 章」） */
export type HighlightWithChapter = HighlightDto & { chapterTitle: string };

/** 笔记汇总页响应项：按书分组的全部高亮（含纯高亮与带笔记的） */
export interface NotesBookGroup {
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  highlights: HighlightWithChapter[];
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

/** 年度阅读报告（GET /api/stats/annual?year=YYYY） */
export interface AnnualReportResponse {
  /** 年内阅读总时长（秒） */
  totalSeconds: number;
  /** 有阅读记录的天数 */
  activeDays: number;
  /** 年内最长连续阅读天数 */
  maxStreakDays: number;
  /** 年内有阅读进度更新的书数 */
  booksRead: number;
  /** 进度 ≥98% 的书数（全量口径，不按年过滤） */
  booksFinished: number;
  /** 年内创建的高亮数 */
  highlightCount: number;
  /** 年内创建且带笔记的高亮数 */
  noteCount: number;
  /** 年内创建的书签数 */
  bookmarkCount: number;
  /** 时长最高的一天；全年无阅读为 null */
  busiestDay: DailyReadingStat | null;
  /** 按月聚合的阅读秒数，长度固定 12（下标 0 = 1 月） */
  monthlySeconds: number[];
  /** 该年稀疏日数据（仅非零，升序），热力图用 */
  days: DailyReadingStat[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
