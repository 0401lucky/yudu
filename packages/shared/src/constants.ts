export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
/** 当前可导入格式（通用阅读器）。pdf 为非章节化格式：仅存源文件，前端 pdf.js 渲染。 */
export const SUPPORTED_FORMATS = ["txt", "md", "epub", "pdf"] as const;
/** 作品格式（由导入白名单推导） */
export type BookFormat = (typeof SUPPORTED_FORMATS)[number];
export const SESSION_COOKIE = "yudu_session";
export const SESSION_DAYS = 30;
/** 书签标签最大长度（前后端共用校验口径） */
export const MAX_BOOKMARK_LABEL_CHARS = 100;
/** 文本高亮颜色白名单（前后端共用） */
export const HIGHLIGHT_COLORS = ["yellow", "green", "blue"] as const;
/** 高亮颜色（由白名单推导） */
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
/** 单本书高亮条数上限 */
export const MAX_HIGHLIGHTS_PER_BOOK = 500;
/** 单条高亮选区最大字符数（endOffset - startOffset） */
export const MAX_HIGHLIGHT_CHARS = 1000;
/** 高亮摘录最大长度（超出截断存储） */
export const MAX_HIGHLIGHT_EXCERPT_CHARS = 120;
/** 单条高亮笔记最大长度（前后端共用校验口径） */
export const MAX_HIGHLIGHT_NOTE_CHARS = 500;
/** 书架分组名最大长度（trim 后 1–30，前后端共用校验口径） */
export const MAX_BOOK_GROUP_CHARS = 30;
