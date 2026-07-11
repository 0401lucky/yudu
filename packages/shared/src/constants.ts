export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const SUPPORTED_FORMATS = ["txt", "md", "epub"] as const;
export type BookFormat = (typeof SUPPORTED_FORMATS)[number] | "pdf";
export const SESSION_COOKIE = "yudu_session";
export const SESSION_DAYS = 30;
