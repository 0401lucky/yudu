export type Env = {
  DB: D1Database;
  BOOKS_BUCKET: R2Bucket;
  SESSION_SECRET: string;
  /** AI 提供商密钥的加密主密钥；`wrangler secret put AI_KEY_SECRET` 注入 */
  AI_KEY_SECRET: string;
  /** 前端源，用于 CORS（分域部署时）；同源 Worker+Assets 可不设 */
  WEB_ORIGIN?: string;
  /** 静态前端（Workers Assets） */
  ASSETS?: Fetcher;
};
