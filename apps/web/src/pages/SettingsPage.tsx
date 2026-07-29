import type { UserPreferences } from "@yudu/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useThemePrefs } from "../components/ThemeProvider";
import { ApiError } from "../lib/api";
import { AiClientError, listAiModels } from "../lib/aiClient";
import {
  getCachedModelsForSettings,
  loadAiSettings,
  saveAiModelsCache,
  saveAiSettings,
  type AiSettings,
} from "../lib/aiSettings";
import { useAuth } from "../lib/auth";

function initialModelsState(): {
  models: string[];
  hint: string | null;
} {
  const s = loadAiSettings();
  const c = getCachedModelsForSettings(s);
  if (!c.models.length) return { models: [], hint: null };
  const when = c.fetchedAt
    ? new Date(c.fetchedAt).toLocaleString()
    : "未知时间";
  return {
    models: c.models,
    hint: c.stale
      ? `已从本机恢复 ${c.models.length} 个模型（缓存于 ${when}，与当前地址可能不一致，建议重新获取）`
      : `已从本机恢复 ${c.models.length} 个模型（缓存于 ${when}）`,
  };
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { prefs, setPrefs, loading } = useThemePrefs();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings());
  const [aiSaved, setAiSaved] = useState(false);
  const initialModels = initialModelsState();
  const [models, setModels] = useState<string[]>(() => initialModels.models);
  const [modelFilter, setModelFilter] = useState("");
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelHint, setModelHint] = useState<string | null>(
    () => initialModels.hint,
  );
  /** 列表拉取后仍允许手填（列表没有或自定义 id） */
  const [manualModel, setManualModel] = useState(
    () => initialModels.models.length === 0,
  );

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((id) => id.toLowerCase().includes(q));
  }, [models, modelFilter]);

  const canFetchModels = Boolean(ai.baseUrl.trim() && ai.apiKey.trim());

  async function onLogout() {
    setError(null);
    setSubmitting(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(errMessage(err, "登出失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function update(partial: Partial<UserPreferences>) {
    setError(null);
    setSaving(true);
    try {
      await setPrefs(partial);
    } catch (err) {
      setError(errMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  async function onFetchModels() {
    setError(null);
    setModelHint(null);
    if (!canFetchModels) {
      setError("请先填写 API Base URL 与 API Key");
      return;
    }
    setFetchingModels(true);
    try {
      const ids = await listAiModels({
        baseUrl: ai.baseUrl,
        apiKey: ai.apiKey,
      });
      if (!ids.length) {
        setModels([]);
        setManualModel(true);
        setModelHint("中转返回了空列表，请手动填写模型 id");
        return;
      }
      const cache = saveAiModelsCache(ids, ai.baseUrl);
      setModels(cache.models);
      setManualModel(false);
      setModelHint(
        `已获取并保存 ${cache.models.length} 个模型到本机，创作台可直接切换`,
      );
      // 当前未选或已不在列表中：默认选第一个；已在列表中则保留
      setAi((s) => {
        if (s.model && ids.includes(s.model)) return s;
        return { ...s, model: ids[0]! };
      });
      setAiSaved(false);
      window.dispatchEvent(new Event("yudu-ai-settings-changed"));
    } catch (err) {
      setModels([]);
      setManualModel(true);
      setError(errMessage(err, "拉取模型失败"));
    } finally {
      setFetchingModels(false);
    }
  }

  return (
    <main className="min-h-full p-6 md:p-10">
      <header className="mx-auto flex max-w-lg items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <h1 className="text-xl font-semibold text-[var(--text)]">设置</h1>
        <Link
          to="/library"
          className="rounded text-sm text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          返回书架
        </Link>
      </header>

      <section className="mx-auto mt-8 max-w-lg space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
          <h2 className="text-sm text-[var(--text-muted)]">账号</h2>
          <p className="mt-2 text-[var(--text)]">{user?.email ?? "—"}</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
          <h2 className="text-sm text-[var(--text-muted)]">阅读偏好</h2>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">加载中…</p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">主题</span>
                <select
                  value={prefs.theme}
                  disabled={saving}
                  onChange={(e) =>
                    void update({
                      theme: e.target.value as UserPreferences["theme"],
                    })
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <option value="night">雨夜（深色）</option>
                  <option value="paper">纸页（浅色）</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  字号：{prefs.fontSize}px
                </span>
                <input
                  type="range"
                  min={14}
                  max={28}
                  value={prefs.fontSize}
                  disabled={saving}
                  onChange={(e) =>
                    void update({ fontSize: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  行距：{prefs.lineHeight.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={1.4}
                  max={2.2}
                  step={0.05}
                  value={prefs.lineHeight}
                  disabled={saving}
                  onChange={(e) =>
                    void update({ lineHeight: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">页边距</span>
                <select
                  value={prefs.pageMargin}
                  disabled={saving}
                  onChange={(e) =>
                    void update({
                      pageMargin: e.target
                        .value as UserPreferences["pageMargin"],
                    })
                  }
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <option value="compact">紧凑</option>
                  <option value="normal">适中</option>
                  <option value="relaxed">宽松</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
          <h2 className="text-sm text-[var(--text-muted)]">AI 创作（new-api）</h2>
          <p className="text-xs text-[var(--text-muted)]">
            仅保存在本浏览器，不会上传到雨读服务器。请使用 OpenAI 兼容中转，并配置
            CORS 允许本站来源。密钥请自行保管。
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">API Base URL</span>
            <input
              value={ai.baseUrl}
              onChange={(e) => {
                setAiSaved(false);
                setModelHint(null);
                setAi((s) => ({ ...s, baseUrl: e.target.value }));
              }}
              placeholder="https://your-new-api.example.com"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">API Key</span>
            <input
              type="password"
              value={ai.apiKey}
              onChange={(e) => {
                setAiSaved(false);
                setModelHint(null);
                setAi((s) => ({ ...s, apiKey: e.target.value }));
              }}
              placeholder="sk-…"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              autoComplete="off"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canFetchModels || fetchingModels}
              onClick={() => void onFetchModels()}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {fetchingModels ? "拉取中…" : "获取模型列表"}
            </button>
            {models.length > 0 ? (
              <button
                type="button"
                onClick={() => setManualModel((v) => !v)}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                {manualModel ? "改用下拉选择" : "手动输入模型 id"}
              </button>
            ) : null}
          </div>
          {modelHint ? (
            <p className="text-xs text-[var(--text-muted)]">{modelHint}</p>
          ) : null}

          {models.length > 0 && !manualModel ? (
            <div className="space-y-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">
                  筛选模型（共 {models.length}）
                </span>
                <input
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  placeholder="输入关键字过滤…"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  autoComplete="off"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-muted)]">选择模型</span>
                <select
                  value={
                    filteredModels.includes(ai.model)
                      ? ai.model
                      : models.includes(ai.model)
                        ? ai.model
                        : ""
                  }
                  onChange={(e) => {
                    setAiSaved(false);
                    setAi((s) => ({ ...s, model: e.target.value }));
                  }}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  size={Math.min(10, Math.max(4, filteredModels.length || 4))}
                >
                  {!ai.model ||
                  (!filteredModels.includes(ai.model) &&
                    !models.includes(ai.model)) ? (
                    <option value="" disabled>
                      请选择…
                    </option>
                  ) : null}
                  {/* 当前模型被筛掉时仍保留可见 */}
                  {ai.model &&
                  models.includes(ai.model) &&
                  !filteredModels.includes(ai.model) ? (
                    <option value={ai.model}>{ai.model}（当前）</option>
                  ) : null}
                  {filteredModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              {filteredModels.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  无匹配项，可清空筛选或改用手动输入
                </p>
              ) : null}
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">模型名</span>
              <input
                value={ai.model}
                onChange={(e) => {
                  setAiSaved(false);
                  setAi((s) => ({ ...s, model: e.target.value }));
                }}
                placeholder="点击上方「获取模型列表」，或手动填写 id"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                autoComplete="off"
                list={models.length ? "yudu-ai-models" : undefined}
              />
              {models.length > 0 ? (
                <datalist id="yudu-ai-models">
                  {models.map((id) => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
              ) : null}
            </label>
          )}

          <button
            type="button"
            onClick={() => {
              saveAiSettings(ai);
              // 若当前已有列表，同步绑定到新 baseUrl，避免创作台提示 stale
              if (models.length) {
                saveAiModelsCache(models, ai.baseUrl);
              }
              setAi(loadAiSettings());
              setAiSaved(true);
              window.dispatchEvent(new Event("yudu-ai-settings-changed"));
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            保存到本机
          </button>
          {aiSaved ? (
            <p className="text-xs text-emerald-400">
              已保存配置与模型列表缓存（仅本浏览器）
            </p>
          ) : null}
          <Link
            to="/studio"
            className="inline-block text-sm text-[var(--accent)] hover:underline"
          >
            打开创作台 →
          </Link>
        </div>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onLogout}
          disabled={submitting}
          className="w-full rounded-lg border border-[var(--border)] py-2.5 text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {submitting ? "退出中…" : "退出登录"}
        </button>
      </section>
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
