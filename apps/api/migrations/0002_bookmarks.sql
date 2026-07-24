-- 书签云同步：按用户 + 书隔离，锚点为章内近似字符偏移
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  char_offset INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, book_id, chapter_index, char_offset)
);
CREATE INDEX idx_bookmarks_user_book ON bookmarks(user_id, book_id);
