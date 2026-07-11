export type Env = {
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
  SESSION_SECRET: string;
  /** 前端源，用于 CORS（分域部署时）；同源 Worker+Assets 可不设 */
  WEB_ORIGIN?: string;
  /** 静态前端（Workers Assets） */
  ASSETS?: Fetcher;
};
