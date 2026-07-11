export type Env = {
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
  SESSION_SECRET: string;
  /** 前端源，用于 CORS（生产如 https://yudu.pages.dev） */
  WEB_ORIGIN?: string;
};
