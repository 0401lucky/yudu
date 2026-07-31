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
/** 年度阅读报告可查询的最早年份（前后端共用校验口径） */
export const MIN_REPORT_YEAR = 2020;

/** 书籍来源：导入文件 | AI 创作台 */
export const BOOK_SOURCES = ["import", "studio"] as const;
export type BookSource = (typeof BOOK_SOURCES)[number];

/** 创作台书名最大长度 */
export const MAX_STUDIO_TITLE_CHARS = 80;
/** 创作台总大纲最大字符 */
export const MAX_STUDIO_OUTLINE_CHARS = 50_000;
/** 单章正文最大字符（创作台写入） */
export const MAX_STUDIO_CHAPTER_CHARS = 200_000;
/** 人设卡片数量上限 */
export const MAX_STUDIO_CHARACTERS = 40;
/** 分章细纲条数上限 */
export const MAX_STUDIO_CHAPTER_OUTLINES = 500;
/** 每本创作书独立记忆的模型 id 最大长度 */
export const MAX_STUDIO_MODEL_CHARS = 200;

/** AI 提供商请求协议白名单（前后端共用校验口径） */
export const AI_PROTOCOLS = ["openai", "gemini", "anthropic"] as const;
/** AI 请求协议（由白名单推导） */
export type AiProtocol = (typeof AI_PROTOCOLS)[number];
/** 单账号 AI 提供商数量上限 */
export const MAX_AI_PROVIDERS = 20;
/** 提供商名称最大长度（前后端共用校验口径） */
export const MAX_AI_PROVIDER_NAME_CHARS = 50;
/** API Key 最大长度 */
export const MAX_AI_API_KEY_CHARS = 500;
/** API Base URL 最大长度 */
export const MAX_AI_BASE_URL_CHARS = 300;
/** 单个提供商缓存的模型 id 条数上限 */
export const MAX_AI_MODELS = 500;
