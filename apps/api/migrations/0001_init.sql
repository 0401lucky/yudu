CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

CREATE TABLE books (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  format TEXT NOT NULL,
  cover_r2_key TEXT,
  source_r2_key TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_books_user ON books(user_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  UNIQUE(book_id, idx)
);

CREATE TABLE reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  char_offset INTEGER NOT NULL,
  page_in_chapter INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_id)
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'night',
  font_size INTEGER NOT NULL DEFAULT 18,
  line_height REAL NOT NULL DEFAULT 1.75,
  page_margin TEXT NOT NULL DEFAULT 'normal',
  updated_at INTEGER NOT NULL
);
