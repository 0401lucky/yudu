-- 创作台每本书独立记住生成模型 id（仅模型名，非密钥；密钥仍只存浏览器本地）
-- 旧行：studio_model=NULL，生成时回退到浏览器全局默认模型

ALTER TABLE books ADD COLUMN studio_model TEXT;
