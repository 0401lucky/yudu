import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AiClientError, listAiModels } from "../lib/aiClient";
import {
  getCachedModelsForSettings,
  loadAiSettings,
  saveAiModelsCache,
  setAiModel,
  type AiSettings,
} from "../lib/aiSettings";

interface StudioModelPickerProps {
  /** 紧凑条（页眉）或块级卡片（列表页） */
  compact?: boolean;
  className?: string;
  /** 受控当前模型（如本书模型）；不传即读写全局默认（localStorage） */
  value?: string;
  /** 选中模型回调；受控模式下由父级负责持久化（如 patch 到书） */
  onSelect?: (model: string) => void;
  /** 变更后通知（settings 已刷新） */
  onModelChange?: (model: string, settings: AiSettings) => void;
  /** 字段标签（compact 左侧 / 块级标题） */
  label?: string;
}

/**
 * 创作台模型选择：可搜索、当前项高亮的 combobox。
 * - 非受控：读写 localStorage 全局默认模型（列表页）。
 * - 受控（传 value + onSelect）：显示/切换某本书的模型，持久化交给父级（工作页）。
 * 模型列表始终来自 baseUrl 级的本机缓存，可一键刷新。
 */
export default function StudioModelPicker({
  compact = true,
  className = "",
  value,
  onSelect,
  onModelChange,
  label = "模型",
}: StudioModelPickerProps) {
  const controlled = value !== undefined;
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [models, setModels] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const reload = () => {
      const s = loadAiSettings();
      setSettings(s);
      const c = getCachedModelsForSettings(s);
      setModels(c.models);
      setStale(c.stale);
      setFetchedAt(c.fetchedAt);
    };
    reload();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "yudu_ai_settings" ||
        e.key === "yudu_ai_models_cache" ||
        e.key == null
      )
        reload();
    };
    const onLocal = () => reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener("yudu-ai-settings-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("yudu-ai-settings-changed", onLocal);
    };
  }, []);

  const currentModel = controlled ? value ?? "" : settings.model;
  const readyCreds = Boolean(settings.baseUrl && settings.apiKey);

  function choose(model: string) {
    if (!model) return;
    if (controlled) {
      onSelect?.(model);
    } else {
      const next = setAiModel(model);
      setSettings(next);
      onSelect?.(model);
    }
    window.dispatchEvent(new Event("yudu-ai-settings-changed"));
    onModelChange?.(model, loadAiSettings());
    setErr(null);
  }

  async function refresh() {
    setErr(null);
    const s = loadAiSettings();
    if (!s.baseUrl.trim() || !s.apiKey.trim()) {
      setErr("请先在设置中填写 API 地址与密钥");
      return;
    }
    setFetching(true);
    try {
      const ids = await listAiModels({ baseUrl: s.baseUrl, apiKey: s.apiKey });
      if (!ids.length) {
        setErr("中转返回空列表");
        return;
      }
      const cache = saveAiModelsCache(ids, s.baseUrl);
      setModels(cache.models);
      setStale(false);
      setFetchedAt(cache.fetchedAt);
      // 非受控且全局模型缺失/失效：默认选第一个，避免创作台无模型可用
      if (!controlled) {
        const cur = loadAiSettings();
        if (!cur.model || !ids.includes(cur.model)) {
          const next = setAiModel(ids[0]!);
          setSettings(next);
          onModelChange?.(next.model, next);
        }
      }
      window.dispatchEvent(new Event("yudu-ai-settings-changed"));
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

  // 无凭证：引导去设置页
  if (!readyCreds) {
    if (compact) {
      return (
        <div className={`flex items-center gap-2 text-sm ${className}`}>
          <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
          <Link
            to="/settings"
            className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
          >
            先配置 API →
          </Link>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 ${className}`}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--text)]">{label}</h2>
          <Link to="/settings" className="text-xs text-[var(--accent)] hover:underline">
            去设置
          </Link>
        </div>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          尚未配置 new-api，填写地址与密钥后即可选择模型。
        </p>
      </div>
    );
  }

  const combo = (
    <ModelCombobox
      compact={compact}
      currentModel={currentModel}
      models={models}
      fetching={fetching}
      stale={stale}
      fetchedAt={fetchedAt}
      onChoose={choose}
      onRefresh={() => void refresh()}
    />
  );

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
        {combo}
        {err ? (
          <span className="text-xs text-red-400" role="alert">
            {err}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--text)]">{label}</h2>
        <Link to="/settings" className="text-xs text-[var(--accent)] hover:underline">
          API 设置
        </Link>
      </div>
      {combo}
      {err ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function ModelCombobox({
  compact,
  currentModel,
  models,
  fetching,
  stale,
  fetchedAt,
  onChoose,
  onRefresh,
}: {
  compact: boolean;
  currentModel: string;
  models: string[];
  fetching: boolean;
  stale: boolean;
  fetchedAt: number;
  onChoose: (m: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const idx = models.indexOf(currentModel);
    setActive(idx >= 0 ? idx : 0);
  }, [open, models, currentModel]);

  // 键盘移动高亮时滚动到可视
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(m: string | undefined) {
    if (!m) return;
    onChoose(m);
    setOpen(false);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(filtered[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${compact ? "" : "w-full"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center justify-between gap-2 rounded-lg border bg-[var(--bg)] text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          compact
            ? "min-w-[9rem] max-w-[15rem] px-2.5 py-1.5 text-sm sm:max-w-[20rem]"
            : "w-full px-3 py-2.5"
        } ${open ? "border-[var(--accent)]" : "border-[var(--border)] hover:border-[var(--accent)]"}`}
      >
        <span
          className={`truncate font-mono ${currentModel ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}
        >
          {currentModel || "选择模型…"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {stale ? (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-400"
              title="地址已变，建议刷新列表"
            />
          ) : null}
          <ChevronIcon open={open} />
        </span>
      </button>

      {open ? (
        <div
          className={`yudu-pop-in absolute z-30 mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl shadow-black/40 ${
            compact ? "left-0 w-[min(22rem,82vw)]" : "left-0 right-0"
          }`}
        >
          <div className="border-b border-[var(--border)] p-2">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5">
              <SearchIcon />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={`搜索 ${models.length} 个模型…`}
                className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>
          </div>

          {filtered.length ? (
            <ul
              ref={listRef}
              role="listbox"
              className="yudu-thin-scroll max-h-64 overflow-y-auto p-1"
            >
              {filtered.map((m, i) => {
                const selected = m === currentModel;
                const isActive = i === active;
                return (
                  <li key={m} role="option" aria-selected={selected} data-active={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(m)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--accent)]/15 text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-[var(--accent)]">
                        {selected ? <CheckIcon /> : null}
                      </span>
                      <span className="truncate">{m}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              {models.length ? "无匹配模型" : "本机暂无模型缓存"}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-2.5 py-2">
            <span className="truncate text-xs text-[var(--text-muted)]">
              {fetchedAt
                ? `缓存于 ${new Date(fetchedAt).toLocaleDateString()}${stale ? " · 地址已变" : ""}`
                : "尚未拉取列表"}
            </span>
            <button
              type="button"
              disabled={fetching}
              onClick={onRefresh}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              <RefreshIcon spinning={fetching} />
              {fetching ? "拉取中" : models.length ? "刷新" : "获取列表"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[var(--text-muted)]"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? "animate-spin" : ""}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
