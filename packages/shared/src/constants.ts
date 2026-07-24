export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
/** 当前可导入格式（通用阅读器）。`pdf` 见 BookFormat 预留，解析未实现。 */
export const SUPPORTED_FORMATS = ["txt", "md", "epub"] as const;
/** 作品格式；含规划中的 pdf */
export type BookFormat = (typeof SUPPORTED_FORMATS)[number] | "pdf";
export const SESSION_COOKIE = "yudu_session";
export const SESSION_DAYS = 30;
/** 书签标签最大长度（前后端共用校验口径） */
export const MAX_BOOKMARK_LABEL_CHARS = 100;
