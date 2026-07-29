import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AiClientError, listAiModels } from "../lib/aiClient";
import {
  getCachedModelsForSettings,
  isAiSettingsReady,
  loadAiSettings,
  saveAiModelsCache,
  saveAiSettings,
  setAiModel,
  type AiSettings,
} from "../lib/aiSettings";

interface StudioModelPickerProps {
  /** 紧凑条（页眉）或块级 */
  compact?: boolean;
  className?: string;
  /** 模型变更后通知父级（可选） */
  onModelChange?: (model: string, settings: AiSettings) => void;
}

/**
 * 创作台模型切换：读/写 localStorage 中的当前模型与缓存列表。
 * 可一键重新拉取并持久化列表。
 */
export default function StudioModelPicker({
  compact = true,
  className = "",
  onModelChange,
}: StudioModelPickerProps) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [models, setModels] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [filter, setFilter] = useState("");
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => {
    const s = loadAiSettings();
    setSettings(s);
    const c = getCachedModelsForSettings(s);
    setModels(c.models);
    setStale(c.stale);
    setFetchedAt(c.fetchedAt);
  }, []);

  useEffect(() => {
    reload();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "yudu_ai_settings" ||
        e.key === "yudu_ai_models_cache" ||
        e.key == null
      ) {
        reload();
      }
    };
    window.addEventListener("storage", onStorage);
    // 同页其它组件改模型时：监听自定义事件
    const onLocal = () => reload();
    window.addEventListener("yudu-ai-settings-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("yudu-ai-settings-changed", onLocal);
    };
  }, [reload]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((id) => id.toLowerCase().includes(q));
  }, [models, filter]);

  const readyCreds = Boolean(settings.baseUrl && settings.apiKey);
  const ready = isAiSettingsReady(settings);

  function notify(next: AiSettings) {
    window.dispatchEvent(new Event("yudu-ai-settings-changed"));
    onModelChange?.(next.model, next);
  }

  function onSelectModel(model: string) {
    if (!model) return;
    const next = setAiModel(model);
    setSettings(next);
    setErr(null);
    setMsg(`已切换：${model}`);
    notify(next);
  }

  async function onRefreshModels() {
    setErr(null);
    setMsg(null);
    if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
      setErr("请先在设置中填写 API 地址与密钥");
      return;
    }
    setFetching(true);
    try {
      const ids = await listAiModels({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
      });
      if (!ids.length) {
        setErr("中转返回空列表");
        return;
      }
      const cache = saveAiModelsCache(ids, settings.baseUrl);
      setModels(cache.models);
      setStale(false);
      setFetchedAt(cache.fetchedAt);
      let next = loadAiSettings();
      if (!next.model || !ids.includes(next.model)) {
        next = { ...next, model: ids[0]! };
        saveAiSettings(next);
      }
      setSettings(next);
      setMsg(`已更新 ${ids.length} 个模型并保存到本机`);
      notify(next);
    } catch (e) {
      setErr(
        e instanceof AiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "拉取失败",
      );
    } finally {
      setFetching(false);
    }
  }

  const selectOptions = useMemo(() => {
    const set = new Set(filtered);
    // 当前模型不在筛选结果里也要能显示
    if (settings.model && models.includes(settings.model) && !set.has(settings.model)) {
      return [settings.model, ...filtered];
    }
    if (settings.model && !models.includes(settings.model)) {
      return [settings.model, ...filtered];
    }
    return filtered;
  }, [filtered, models, settings.model]);

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-2 text-sm ${className}`}
        title="当前生成使用的模型（保存在本机）"
      >
        <span className="shrink-0 text-[var(--text-muted)]">模型</span>
        {!readyCreds ? (
          <Link
            to="/settings"
            className="text-[var(--accent)] hover:underline"
          >
            先配置 API
          </Link>
        ) : (
          <>
            <select
              value={settings.model}
              onChange={(e) => onSelectModel(e.target.value)}
              className="max-w-[min(100%,14rem)] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:max-w-[18rem]"
              aria-label="切换模型"
            >
              {!settings.model ? (
                <option value="" disabled>
                  未选择
                </option>
              ) : null}
              {selectOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
              {models.length === 0 && settings.model ? null : null}
              {models.length === 0 && !settings.model ? (
                <option value="" disabled>
                  无缓存，请拉取
                </option>
              ) : null}
            </select>
            <button
              type="button"
              disabled={fetching}
              onClick={() => void onRefreshModels()}
              className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              {fetching ? "拉取…" : models.length ? "刷新列表" : "获取列表"}
            </button>
            {stale ? (
              <span className="text-xs text-amber-400">地址已变，建议刷新</span>
            ) : null}
            {!ready && settings.model === "" ? (
              <span className="text-xs text-amber-400">请选择模型</span>
            ) : null}
          </>
        )}
        {err ? (
          <span className="w-full text-xs text-red-400 sm:w-auto" role="alert">
            {err}
          </span>
        ) : msg ? (
          <span className="hidden text-xs text-[var(--text-muted)] md:inline">
            {msg}
          </span>
        ) : null}
      </div>
    );
  }

  // 块级（列表页可用）
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm text-[var(--text-muted)]">生成模型</h2>
        <Link to="/settings" className="text-xs text-[var(--accent)] hover:underline">
          API 设置
        </Link>
      </div>
      {!readyCreds ? (
        <p className="text-sm text-[var(--text-muted)]">
          尚未配置 new-api，请先到设置填写地址与密钥。
        </p>
      ) : (
        <>
          {models.length > 6 ? (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="筛选模型…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
            />
          ) : null}
          <select
            value={settings.model}
            onChange={(e) => onSelectModel(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
            size={Math.min(8, Math.max(3, selectOptions.length || 3))}
          >
            {selectOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={fetching}
              onClick={() => void onRefreshModels()}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {fetching ? "拉取中…" : "刷新并保存模型列表"}
            </button>
            {fetchedAt ? (
              <span className="text-xs text-[var(--text-muted)]">
                缓存于 {new Date(fetchedAt).toLocaleString()}
                {stale ? " · 与当前地址不一致" : ""}
              </span>
            ) : null}
          </div>
        </>
      )}
      {err ? (
        <p className="text-xs text-red-400" role="alert">
          {err}
        </p>
      ) : msg ? (
        <p className="text-xs text-emerald-400">{msg}</p>
      ) : null}
    </div>
  );
}
