-- 每日阅读时长统计：date 为前端上报的用户本地日期（YYYY-MM-DD），服务端不做时区换算
CREATE TABLE reading_stats_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
