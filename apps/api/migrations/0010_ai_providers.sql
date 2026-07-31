-- AI 提供商配置跟随账号：密钥经 AES-GCM 加密后存 api_key_enc（格式 v1.<iv>.<密文>，均 base64url）
-- 主密钥来自 Worker Secret AI_KEY_SECRET；明文密钥不入库
-- 新表无旧行；老用户浏览器里的本地配置由前端在首台设备登录时上传迁移（保留原 id，
-- 因为 books.studio_provider_id 引用着它们）

CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT NOT NULL,
  -- 写入时算好的展示掩码（如 sk-…a1b2）。存起来是为了让列表接口零解密：
  -- 拉配置是高频操作，不该为了显示掩码就把每个密钥解一遍明文
  api_key_mask TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  models_fetched_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_providers_user ON ai_providers(user_id);

-- 全局默认提供商与模型。default_provider_id 刻意不设外键：
-- 提供商删除后允许悬空，由前端 resolveProvider 回退，与 books.studio_provider_id 行为一致
CREATE TABLE user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_provider_id TEXT,
  default_model TEXT,
  updated_at INTEGER NOT NULL
);
