export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
/** 当前可导入格式（通用阅读器）。pdf 为非章节化格式：仅存源文件，前端 pdf.js 渲染。 */
export const SUPPORTED_FORMATS = ["txt", "md", "epub", "pdf"] as const;
/** 作品格式（由导入白名单推导） */
export type BookFormat = (typeof SUPPORTED_FORMATS)[number];
export const SESSION_COOKIE = "yudu_session";
export const SESSION_DAYS = 30;
/** 书签标签最大长度（前后端共用校验口径） */
export const MAX_BOOKMARK_LABEL_CHARS = 100;
