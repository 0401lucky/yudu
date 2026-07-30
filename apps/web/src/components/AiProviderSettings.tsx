import { useState } from "react";
import { Link } from "react-router-dom";
import { AiClientError, listAiModels } from "../lib/aiClient";
import {
  AI_PROTOCOL_LABELS,
  addProvider,
  loadAiSettings,
  removeProvider,
  setDefaultModel,
  updateProvider,
  type AiProtocol,
  type AiProvider,
  type AiSettings,
} from "../lib/aiSettings";

/** 列表视图，或某个提供商的详情视图（草稿在视图里，取消即丢弃） */
type View =
  | { mode: "list" }
  | { mode: "form"; draft: AiProvider; isNew: boolean };

const PROTOCOLS: AiProtocol[] = ["openai", "gemini", "anthropic"];

function emptyProvider(): AiProvider {
  return {
    id: crypto.randomUUID(),
    name: "",
    protocol: "openai",
    baseUrl: "",
    apiKey: "",
    models: [],
    modelsFetchedAt: 0,
  };
}

/**
 * 设置页的 AI 提供商面板：列表 / 详情二级切换。
 * 所有配置只写浏览器 localStorage，不上传雨读服务器。
 */
export default function AiProviderSettings() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [view, setView] = useState<View>({ mode: "list" });
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  /** 落盘结果同步到本地 state，并广播给创作台的模型选择器 */
  function commit(next: AiSettings) {
    setSettings(next);
    window.dispatchEvent(new Event("yudu-ai-settings-changed"));
  }

  function patchDraft(patch: Partial<AiProvider>) {
    setView((v) =>
      v.mode === "form" ? { ...v, draft: { ...v.draft, ...patch } } : v,
    );
  }

  function openForm(provider?: AiProvider) {
    setError(null);
    setHint(null);
    setView({
      mode: "form",
      draft: provider ? { ...provider } : emptyProvider(),
      isNew: !provider,
    });
  }

  function backToList() {
    setError(null);
    setHint(null);
    setView({ mode: "list" });
  }

  function onSaveDraft(draft: AiProvider, isNew: boolean) {
    const name = draft.name.trim();
    if (!name) {
      setError("请填写提供商名称");
      return;
    }
    const next = { ...draft, name };
    commit(isNew ? addProvider(next, settings) : updateProvider(next.id, next, settings));
    backToList();
  }

  function onDelete(provider: AiProvider) {
    const ok = window.confirm(
      `确定删除提供商「${provider.name}」？地址、密钥与模型列表都会从本机移除。`,
    );
    if (!ok) return;
    commit(removeProvider(provider.id, settings));
  }

  /** 设为默认；原默认模型不属于新提供商时，改用它的第一个模型 */
  function onSetDefault(provider: AiProvider) {
    const model =
      settings.defaultModel && provider.models.includes(settings.defaultModel)
        ? settings.defaultModel
        : (provider.models[0] ?? "");
    commit(setDefaultModel(provider.id, model, settings));
  }

  async function onFetchModels(draft: AiProvider) {
    setError(null);
    setHint(null);
    if (draft.protocol !== "openai") {
      setError(
        `${AI_PROTOCOL_LABELS[draft.protocol]} 协议将在下一阶段支持，暂时无法获取模型列表`,
      );
      return;
    }
    if (!draft.baseUrl.trim() || !draft.apiKey.trim()) {
      setError("请先填写 API 地址与密钥");
      return;
    }
    setFetching(true);
    try {
      const ids = await listAiModels({ provider: draft });
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
      {view.mode === "list" ? (
        <ProviderList
          settings={settings}
          onCreate={() => openForm()}
          onEdit={openForm}
          onDelete={onDelete}
          onSetDefault={onSetDefault}
        />
      ) : (
        <ProviderForm
          draft={view.draft}
          isNew={view.isNew}
          fetching={fetching}
          onPatch={patchDraft}
          onBack={backToList}
          onSave={() => onSaveDraft(view.draft, view.isNew)}
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

function ProviderList({
  settings,
  onCreate,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  settings: AiSettings;
  onCreate: () => void;
  onEdit: (p: AiProvider) => void;
  onDelete: (p: AiProvider) => void;
  onSetDefault: (p: AiProvider) => void;
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
        地址与密钥只保存在本浏览器，不会上传到雨读服务器。可添加多套配置（自建中转 /
        官方 API），每套记住自己的模型列表。
      </p>

      {settings.providers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          还没有提供商，添加一个后即可在创作台选择模型。
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
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-muted)]">
                    {p.models.length ? `${p.models.length} 个模型` : "尚未获取模型"}
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    {isDefault ? null : (
                      <button
                        type="button"
                        onClick={() => onSetDefault(p)}
                        className="text-[var(--accent)] hover:underline"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(p)}
                      className="text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      className="text-red-400 hover:underline"
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
        onClick={onCreate}
        className="w-full rounded-lg border border-dashed border-[var(--border)] py-2.5 text-sm text-[var(--accent)] hover:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
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
  onPatch,
  onBack,
  onSave,
  onFetchModels,
}: {
  draft: AiProvider;
  isNew: boolean;
  fetching: boolean;
  onPatch: (patch: Partial<AiProvider>) => void;
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
              {p === "openai" ? "" : "（下一阶段支持）"}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">API Base URL</span>
        <input
          value={draft.baseUrl}
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
          placeholder="https://your-new-api.example.com"
          className={inputClass}
          autoComplete="off"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">API Key</span>
        <input
          type="password"
          value={draft.apiKey}
          onChange={(e) => onPatch({ apiKey: e.target.value })}
          placeholder="sk-…"
          className={inputClass}
          autoComplete="off"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={fetching}
          onClick={onFetchModels}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {fetching ? "拉取中…" : "获取模型列表"}
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {draft.models.length
            ? `本机已存 ${draft.models.length} 个模型${
                draft.modelsFetchedAt
                  ? `（${new Date(draft.modelsFetchedAt).toLocaleDateString()}）`
                  : ""
              }`
            : "尚未获取模型"}
        </span>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        保存到本机
      </button>
    </>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
