-- 高亮附加笔记：NULL 或非空字符串（trim 后为空统一存 NULL，保持「无笔记」单一表示）
ALTER TABLE highlights ADD COLUMN note TEXT;
