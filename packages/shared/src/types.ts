import type { BookFormat } from "./constants";

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

export interface UserPreferences {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  pageMargin: "compact" | "normal" | "relaxed";
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
