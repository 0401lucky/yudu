-- AI 创作台：书籍来源 / 上架可见性 / 破限 / 设定 JSON
-- 旧行：source=import, on_shelf=1, break_limit=0

ALTER TABLE books ADD COLUMN source TEXT NOT NULL DEFAULT 'import';
ALTER TABLE books ADD COLUMN on_shelf INTEGER NOT NULL DEFAULT 1;
ALTER TABLE books ADD COLUMN break_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN studio_assets TEXT;
