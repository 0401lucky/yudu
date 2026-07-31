import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AiClientError, listAiModels } from "../lib/aiClient";
import { ChevronIcon, SearchIcon } from "../lib/icons";
import { OutlineButton } from "./buttons";
import {
  AI_SETTINGS_CHANGED_EVENT,
  fetchAiSettings,
  getCachedAiSettings,
  getProviderKey,
  hasCredentials,
  resolveProvider,
  setDefaultModel,
  setProviderModels,
  type AiSettings,
} from "../lib/aiSettings";

/** 摊平后的一项：某个提供商下的某个模型 */
interface ModelOption {
  providerId: string;
  providerName: string;
  model: string;
}

interface StudioModelPickerProps {
  /** 紧凑条（页眉）或块级卡片（列表页） */
  compact?: boolean;
  className?: string;
  /** 受控当前绑定（如本书的提供商+模型）；不传即读写全局默认 */
  value?: { providerId?: string; model?: string };
  /** 选中回调；受控模式下由父级负责持久化（如 patch 到书） */
  onSelect?: (providerId: string, model: string) => void;
  /** 变更后通知（settings 已刷新） */
  onModelChange?: (settings: AiSettings) => void;
  /** 字段标签（compact 左侧 / 块级标题） */
  label?: string;
}

/**
 * 创作台模型选择：跨提供商可搜索的 combobox，显示「提供商名 / 模型 id」。
 * - 非受控：读写 localStorage 的全局默认提供商与模型（列表页）。
 * - 受控（传 value + onSelect）：显示/切换某本书的绑定，持久化交给父级（工作页）。
 * 每个提供商的模型列表各自缓存在本机，可一键刷新全部。
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
  // 先用本地缓存渲染，避免进创作台闪一下「无配置」；随后再拉服务端刷新
  const [settings, setSettings] = useState<AiSettings>(() => getCachedAiSettings());
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reload = () => setSettings(getCachedAiSettings());

    void (async () => {
      try {
        const next = await fetchAiSettings();
        if (!cancelled) setSettings(next);
      } catch {
        // 拉取失败就继续用缓存；真正发请求时会再报一次具体错误
      }
    })();

    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, reload);
    };
  }, []);

  const options = useMemo<ModelOption[]>(
    () =>
      settings.providers.flatMap((p) =>
        p.models.map((model) => ({
          providerId: p.id,
          providerName: p.name,
          model,
        })),
      ),
    [settings],
  );

  // 受控但本书未绑定时，显示实际会用到的全局默认（与生成时的解析一致）
  const resolved = resolveProvider(
    settings,
    controlled ? value.providerId : undefined,
    controlled ? value.model : undefined,
  );
  const current: ModelOption | null = resolved
    ? {
        providerId: resolved.provider.id,
        providerName: resolved.provider.name,
        model: resolved.model,
      }
    : null;

  const lastFetchedAt = useMemo(
    () => settings.providers.reduce((max, p) => Math.max(max, p.modelsFetchedAt), 0),
    [settings],
  );

  function choose(opt: ModelOption) {
    if (controlled) {
      onSelect?.(opt.providerId, opt.model);
      onModelChange?.(settings);
      setErr(null);
      return;
    }
    void (async () => {
      try {
        const next = await setDefaultModel(opt.providerId, opt.model);
        setSettings(next);
        onSelect?.(opt.providerId, opt.model);
        onModelChange?.(next);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "保存默认模型失败");
      }
    })();
  }

  /** 刷新所有已配凭证的提供商；逐个写回，互不覆盖 */
  async function refresh() {
    setErr(null);
    const targets = getCachedAiSettings().providers.filter(hasCredentials);
    if (!targets.length) {
      setErr("请先在设置中填写提供商的地址与密钥");
      return;
    }
    setFetching(true);
    const failed: string[] = [];
    try {
      for (const p of targets) {
        try {
          // 拉模型列表要真密钥，这里才回服务端取一次明文
          const apiKey = await getProviderKey(p.id);
          const ids = await listAiModels({ provider: { ...p, apiKey } });
          if (ids.length) await setProviderModels(p.id, ids);
          else failed.push(p.name);
        } catch (e) {
          failed.push(
            `${p.name}（${e instanceof AiClientError || e instanceof Error ? e.message : "拉取失败"}）`,
          );
        }
      }
      const next = getCachedAiSettings();
      setSettings(next);
      if (failed.length) setErr(`部分提供商未取到模型：${failed.join("；")}`);
    } finally {
      setFetching(false);
    }
  }

  // 一个提供商都没有：引导去设置页
  if (settings.providers.length === 0) {
    if (compact) {
      return (
        <div className={`flex items-center gap-2 text-sm ${className}`}>
          <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
          <Link
            to="/settings"
            className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
          >
            先添加提供商 →
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
          尚未添加 AI 提供商，填写地址与密钥后即可选择模型。
        </p>
      </div>
    );
  }

  const combo = (
    <ModelCombobox
      compact={compact}
      current={current}
      options={options}
      fetching={fetching}
      fetchedAt={lastFetchedAt}
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
          <span className="text-xs text-[var(--danger)]" role="alert">
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
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}

function optionKey(o: ModelOption): string {
  return `${o.providerId}:${o.model}`;
}

function ModelCombobox({
  compact,
  current,
  options,
  fetching,
  fetchedAt,
  onChoose,
  onRefresh,
}: {
  compact: boolean;
  current: ModelOption | null;
  options: ModelOption[];
  fetching: boolean;
  fetchedAt: number;
  onChoose: (o: ModelOption) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.model.toLowerCase().includes(q) || o.providerName.toLowerCase().includes(q),
    );
  }, [options, query]);

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

  const currentKey = current ? optionKey(current) : "";

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const idx = options.findIndex((o) => optionKey(o) === currentKey);
    setActive(idx >= 0 ? idx : 0);
  }, [open, options, currentKey]);

  // 键盘移动高亮时滚动到可视
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(o: ModelOption | undefined) {
    if (!o) return;
    onChoose(o);
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
          className={`truncate ${current ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}
        >
          {current ? (
            <>
              <span className="text-[var(--text-muted)]">{current.providerName} / </span>
              <span className="font-mono">{current.model}</span>
            </>
          ) : (
            "选择模型…"
          )}
        </span>
        <ChevronIcon
          open={open}
          className="h-3.5 w-3.5 text-[var(--text-muted)]"
        />
      </button>

      {open ? (
        <div
          className={`yudu-pop-in absolute z-30 mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl shadow-black/40 ${
            compact ? "left-0 w-[min(22rem,82vw)]" : "left-0 right-0"
          }`}
        >
          <div className="border-b border-[var(--border)] p-2">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5">
              <SearchIcon className="h-[15px] w-[15px] shrink-0 text-[var(--text-muted)]" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={`搜索 ${options.length} 个模型 / 提供商…`}
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
              {filtered.map((o, i) => {
                const key = optionKey(o);
                const selected = key === currentKey;
                const isActive = i === active;
                return (
                  <li key={key} role="option" aria-selected={selected} data-active={isActive}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => commit(o)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--accent)]/15 text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-[var(--accent)]">
                        {selected ? <CheckIcon /> : null}
                      </span>
                      <span className="truncate">
                        <span className="text-[var(--text-muted)]">{o.providerName} / </span>
                        <span className="font-mono">{o.model}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
              {options.length ? "无匹配模型" : "本机暂无模型缓存"}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-2.5 py-2">
            <span className="truncate text-xs text-[var(--text-muted)]">
              {fetchedAt ? `缓存于 ${new Date(fetchedAt).toLocaleDateString()}` : "尚未拉取列表"}
            </span>
            <OutlineButton
              disabled={fetching}
              onClick={onRefresh}
              className="flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--text-muted)]"
            >
              <RefreshIcon spinning={fetching} />
              {fetching ? "拉取中" : options.length ? "刷新" : "获取列表"}
            </OutlineButton>
          </div>
        </div>
      ) : null}
    </div>
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
