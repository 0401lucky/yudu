-- 创作台每本书记住使用哪个 AI 提供商（仅提供商 id，非密钥；密钥仍只存浏览器本地）
-- 旧行：studio_provider_id=NULL，生成时回退到浏览器全局默认提供商

ALTER TABLE books ADD COLUMN studio_provider_id TEXT;
