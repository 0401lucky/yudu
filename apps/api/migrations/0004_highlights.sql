-- 文本高亮云同步：按用户 + 书隔离，锚点为章内「渲染后纯文本」字符偏移区间
CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,     -- 开区间终点，须 > start_offset
  color TEXT NOT NULL,             -- 'yellow' | 'green' | 'blue'（服务端白名单）
  excerpt TEXT NOT NULL,           -- 摘录，列表展示用，截断存储
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, book_id, chapter_index, start_offset, end_offset)
);
CREATE INDEX idx_highlights_user_book ON highlights(user_id, book_id);
