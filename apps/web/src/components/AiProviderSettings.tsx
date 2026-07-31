import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AiClientError, listAiModels, PROTOCOL_DEFAULT_BASE_URLS } from "../lib/aiClient";
import { ApiError } from "../lib/api";
import {
  AI_PROTOCOL_LABELS,
  AI_SETTINGS_CHANGED_EVENT,
  addProvider,
  discardLegacyProviders,
  fetchAiSettings,
  getCachedAiSettings,
  getPendingLegacyCount,
  getProviderKey,
  hasCredentials,
  importLegacyProviders,
  removeProvider,
  setDefaultModel,
  updateProvider,
  type AiProtocol,
  type AiProviderMeta,
  type AiSettings,
} from "../lib/aiSettings";

/** 编辑草稿：列表态没有明文密钥，`apiKey` 是用户本次新输入的，空串表示不改动 */
type Draft = AiProviderMeta & { apiKey: string };

/** 列表视图，或某个提供商的详情视图（草稿在视图里，取消即丢弃） */
type View = { mode: "list" } | { mode: "form"; draft: Draft; isNew: boolean };

const PROTOCOLS: AiProtocol[] = ["openai", "gemini", "anthropic"];

function emptyDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    name: "",
    protocol: "openai",
    baseUrl: "",
    keyMask: "",
    apiKey: "",
    models: [],
    modelsFetchedAt: 0,
  };
}

/**
 * 设置页的 AI 提供商面板：列表 / 详情二级切换。
 * 配置跟随账号存服务端，密钥加密存储；本机残留的旧配置在顶部提示手动导入。
 */
export default function AiProviderSettings() {
  const [settings, setSettings] = useState<AiSettings>(() => getCachedAiSettings());
  const [view, setView] = useState<View>({ mode: "list" });
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [legacyCount, setLegacyCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchAiSettings();
        if (cancelled) return;
        setSettings(next);
        setLegacyCount(getPendingLegacyCount());
      } catch (err) {
        if (!cancelled) setError(errMessage(err, "加载 AI 配置失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const reload = () => setSettings(getCachedAiSettings());
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, reload);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, reload);
    };
  }, []);

  /** 统一包裹写操作：置忙、清提示、失败转文案 */
  async function run(action: () => Promise<AiSettings>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      setSettings(await action());
      return true;
    } catch (err) {
      setError(errMessage(err, "操作失败"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function patchDraft(patch: Partial<Draft>) {
    setView((v) => (v.mode === "form" ? { ...v, draft: { ...v.draft, ...patch } } : v));
  }

  function openForm(provider?: AiProviderMeta) {
    setError(null);
    setHint(null);
    setView({
      mode: "form",
      // 编辑时密钥留空：服务端只回掩码，留空即表示保留原密钥
      draft: provider ? { ...provider, apiKey: "" } : emptyDraft(),
      isNew: !provider,
    });
  }

  function backToList() {
    setError(null);
    setHint(null);
    setView({ mode: "list" });
  }

  async function onSaveDraft(draft: Draft, isNew: boolean) {
    const name = draft.name.trim();
    if (!name) {
      setError("请填写提供商名称");
      return;
    }

    const ok = await run(() =>
      isNew
        ? addProvider({
            id: draft.id,
            name,
            protocol: draft.protocol,
            baseUrl: draft.baseUrl,
            apiKey: draft.apiKey.trim(),
            models: draft.models,
            modelsFetchedAt: draft.modelsFetchedAt,
          })
        : updateProvider(draft.id, {
            name,
            protocol: draft.protocol,
            baseUrl: draft.baseUrl,
            // 留空表示不改动已存密钥
            ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
            models: draft.models,
            modelsFetchedAt: draft.modelsFetchedAt,
          }),
    );
    if (ok) backToList();
  }

  async function onDelete(provider: AiProviderMeta) {
    const ok = window.confirm(
      `确定删除提供商「${provider.name}」？地址、密钥与模型列表都会从账号中删除。`,
    );
    if (!ok) return;
    await run(() => removeProvider(provider.id));
  }

  /** 设为默认；原默认模型不属于新提供商时，改用它的第一个模型 */
  async function onSetDefault(provider: AiProviderMeta) {
    const model =
      settings.defaultModel && provider.models.includes(settings.defaultModel)
        ? settings.defaultModel
        : (provider.models[0] ?? "");
    await run(() => setDefaultModel(provider.id, model));
  }

  async function onImportLegacy() {
    setHint(null);
    const ok = await run(() => importLegacyProviders());
    setLegacyCount(getPendingLegacyCount());
    if (ok) setHint("本机旧配置已导入账号");
  }

  function onDiscardLegacy() {
    if (!window.confirm("确定丢弃本机残留的旧配置？该操作不可撤销。")) return;
    discardLegacyProviders();
    setLegacyCount(0);
  }

  async function onFetchModels(draft: Draft) {
    setError(null);
    setHint(null);

    // 新建时用刚输入的密钥；编辑时留空则回服务端取回明文
    let apiKey = draft.apiKey.trim();
    if (!apiKey && draft.keyMask) {
      try {
        apiKey = await getProviderKey(draft.id);
      } catch (err) {
        setError(errMessage(err, "读取密钥失败"));
        return;
      }
    }
    if (!apiKey || (draft.protocol === "openai" && !draft.baseUrl.trim())) {
      setError(
        draft.protocol === "openai" ? "请先填写 API 地址与密钥" : "请先填写 API 密钥",
      );
      return;
    }

    setFetching(true);
    try {
      const ids = await listAiModels({ provider: { ...draft, apiKey } });
      if (!ids.length) {
        setHint("中转返回了空列表，请确认密钥权限");
        return;
      }
      patchDraft({ models: ids, modelsFetchedAt: Date.now() });
      setHint(`已获取 ${ids.length} 个模型，点「保存」后生效`);
    } catch (err) {
      setError(errMessage(err, "拉取模型失败"));
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 space-y-4">
      {legacyCount > 0 ? (
        <LegacyNotice
          count={legacyCount}
          busy={busy}
          onImport={() => void onImportLegacy()}
          onDiscard={onDiscardLegacy}
        />
      ) : null}

      {view.mode === "list" ? (
        <ProviderList
          settings={settings}
          loading={loading}
          busy={busy}
          onCreate={() => openForm()}
          onEdit={openForm}
          onDelete={(p) => void onDelete(p)}
          onSetDefault={(p) => void onSetDefault(p)}
        />
      ) : (
        <ProviderForm
          draft={view.draft}
          isNew={view.isNew}
          fetching={fetching}
          busy={busy}
          onPatch={patchDraft}
          onBack={backToList}
          onSave={() => void onSaveDraft(view.draft, view.isNew)}
          onFetchModels={() => void onFetchModels(view.draft)}
        />
      )}

      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 云端已有配置、本机还留着旧数据时的提示条 */
function LegacyNotice({
  count,
  busy,
  onImport,
  onDiscard,
}: {
  count: number;
  busy: boolean;
  onImport: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2">
      <span className="text-xs text-[var(--text)]">
        本机还有 {count} 个未同步的旧配置
      </span>
      <span className="flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onImport}
          className="text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          导入到账号
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
        >
          丢弃
        </button>
      </span>
    </div>
  );
}

function ProviderList({
  settings,
  loading,
  busy,
  onCreate,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  settings: AiSettings;
  loading: boolean;
  busy: boolean;
  onCreate: () => void;
  onEdit: (p: AiProviderMeta) => void;
  onDelete: (p: AiProviderMeta) => void;
  onSetDefault: (p: AiProviderMeta) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm text-[var(--text-muted)]">AI 提供商</h2>
        <Link to="/studio" className="text-sm text-[var(--accent)] hover:underline">
          打开创作台 →
        </Link>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        地址与密钥加密后保存在你的账号下，换设备登录即可直接使用。可添加多套配置（自建中转
        / 官方 API），每套记住自己的模型列表。
      </p>

      {settings.providers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          {loading ? "正在加载…" : "还没有提供商，添加一个后即可在创作台选择模型。"}
        </p>
      ) : (
        <ul className="space-y-2">
          {settings.providers.map((p) => {
            const isDefault = p.id === settings.defaultProviderId;
            return (
              <li
                key={p.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[var(--text)]">{p.name}</span>
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                    {AI_PROTOCOL_LABELS[p.protocol]}
                  </span>
                  {isDefault ? (
                    <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-xs text-[var(--accent)]">
                      默认
                    </span>
                  ) : null}
                  {hasCredentials(p) ? null : (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs text-red-400">
                      未配密钥
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-muted)]">
                    {p.models.length ? `${p.models.length} 个模型` : "尚未获取模型"}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    {isDefault ? null : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSetDefault(p)}
                        className="text-[var(--accent)] hover:underline disabled:opacity-50"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onEdit(p)}
                      className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(p)}
                      className="text-red-400 hover:underline disabled:opacity-50"
                    >
                      删除
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onCreate}
        className="w-full rounded-lg border border-dashed border-[var(--border)] py-2.5 text-sm text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        ＋ 添加提供商
      </button>
    </>
  );
}

function ProviderForm({
  draft,
  isNew,
  fetching,
  busy,
  onPatch,
  onBack,
  onSave,
  onFetchModels,
}: {
  draft: Draft;
  isNew: boolean;
  fetching: boolean;
  busy: boolean;
  onPatch: (patch: Partial<Draft>) => void;
  onBack: () => void;
  onSave: () => void;
  onFetchModels: () => void;
}) {
  const inputClass =
    "rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← 返回列表
        </button>
        <h2 className="text-sm text-[var(--text-muted)]">
          {isNew ? "添加提供商" : "编辑提供商"}
        </h2>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">名称</span>
        <input
          value={draft.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="我的中转"
          className={inputClass}
          autoComplete="off"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">协议</span>
        <select
          value={draft.protocol}
          onChange={(e) => onPatch({ protocol: e.target.value as AiProtocol })}
          className={inputClass}
        >
          {PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {AI_PROTOCOL_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">
          API Base URL
          {draft.protocol === "openai" ? "" : "（留空用官方地址）"}
        </span>
        <input
          value={draft.baseUrl}
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
          placeholder={
            PROTOCOL_DEFAULT_BASE_URLS[draft.protocol] ||
            "https://your-new-api.example.com"
          }
          className={inputClass}
          autoComplete="off"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">
          API Key
          {draft.keyMask ? `（当前 ${draft.keyMask}，留空不修改）` : ""}
        </span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(e) => onPatch({ apiKey: e.target.value })}
          placeholder={draft.keyMask || "sk-…"}
          className={inputClass}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={fetching || busy}
          onClick={onFetchModels}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {fetching ? "拉取中…" : "获取模型列表"}
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {draft.models.length
            ? `已存 ${draft.models.length} 个模型${
                draft.modelsFetchedAt
                  ? `（${new Date(draft.modelsFetchedAt).toLocaleDateString()}）`
                  : ""
              }`
            : "尚未获取模型"}
        </span>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-[var(--bg)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {busy ? "保存中…" : "保存"}
      </button>
    </>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) return "请先登录";
  if (err instanceof AiClientError) return err.message;
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
