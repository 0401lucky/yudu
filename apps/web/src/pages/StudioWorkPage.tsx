import type {
  ChapterContent,
  StudioAssets,
  StudioBookDetail,
  StudioCharacter,
  StudioChapterOutline,
  StudioPremise,
} from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StudioModelPicker from "../components/StudioModelPicker";
import StudioChaptersPanel from "../components/StudioChaptersPanel";
import StudioCharacterPanel from "../components/StudioCharacterPanel";
import StudioOutlinePanel from "../components/StudioOutlinePanel";
import StudioPremisePanel from "../components/StudioPremisePanel";
import {
  ApiError,
  getChapter,
  getStudioBook,
  patchStudioBook,
  putStudioAssets,
  putStudioChapter,
  setStudioShelf,
} from "../lib/api";
import { AiClientError, streamChatCompletion } from "../lib/aiClient";
import {
  AI_PROTOCOL_LABELS,
  isAdultConfirmed,
  loadAiSettings,
  resolveProvider,
  setAdultConfirmed,
  type AiProvider,
} from "../lib/aiSettings";
import {
  buildChapterBodyMessages,
  buildChapterOutlinesMessages,
  buildCharactersMessages,
  buildOutlineMessages,
  buildPremiseMessages,
  buildTitlesMessages,
  parseChapterOutlinesFromAi,
  parseCharactersFromAi,
  parseOutlineDetailFromAi,
  parsePremiseFromAi,
  parseTitlesFromAi,
} from "../lib/studioPrompts";

type StepId = "premise" | "characters" | "outline" | "chapters" | "body";

const STEPS: { id: StepId; label: string }[] = [
  { id: "premise", label: "立项" },
  { id: "characters", label: "人设" },
  { id: "outline", label: "总大纲" },
  { id: "chapters", label: "分章细纲" },
  { id: "body", label: "正文" },
];

export default function StudioWorkPage() {
  const { bookId = "" } = useParams();
  const [detail, setDetail] = useState<StudioBookDetail | null>(null);
  const [assets, setAssets] = useState<StudioAssets | null>(null);
  const [step, setStep] = useState<StepId>("premise");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 立项本地草稿
  const [title, setTitle] = useState("");
  const [breakLimit, setBreakLimit] = useState(false);
  const [premiseDraft, setPremiseDraft] = useState<StudioPremise>({});
  /** AI 产出的书名候选，一次性结果，不持久化 */
  const [titleCandidates, setTitleCandidates] = useState<string[]>([]);
  /** 刚手动新增的角色 id，用于让该卡默认展开 */
  const [newCharacterId, setNewCharacterId] = useState<string | null>(null);
  /** 刚手动新增的细纲章序号，用于让该卡默认展开 */
  const [newChapterIndex, setNewChapterIndex] = useState<number | null>(null);

  // 正文编辑
  const [activeChapter, setActiveChapter] = useState(0);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterText, setChapterText] = useState("");
  const [chapterLoading, setChapterLoading] = useState(false);

  const load = useCallback(async () => {
    if (!bookId) return;
    const d = await getStudioBook(bookId);
    setDetail(d);
    setAssets(d.assets);
    setTitle(d.title);
    setBreakLimit(d.breakLimit);
    setPremiseDraft(d.assets.premise);
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(errMessage(err, "加载作品失败"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [load]);

  const loadChapterBody = useCallback(
    async (idx: number, d: StudioBookDetail, a: StudioAssets) => {
      setChapterLoading(true);
      setError(null);
      try {
        const outline = a.chapterOutlines[idx];
        setChapterTitle(outline?.title ?? `第 ${idx + 1} 章`);
        const existing = d.chapters.find((c) => c.index === idx);
        if (existing) {
          const content: ChapterContent = await getChapter(bookId, idx);
          setChapterText(content.text);
          setChapterTitle(content.title || outline?.title || `第 ${idx + 1} 章`);
        } else {
          setChapterText("");
        }
      } catch (err) {
        // 章不存在时当空章
        if (err instanceof ApiError && err.status === 404) {
          setChapterText("");
        } else {
          setError(errMessage(err, "加载章节失败"));
        }
      } finally {
        setChapterLoading(false);
      }
    },
    [bookId],
  );

  useEffect(() => {
    if (!detail || !assets || step !== "body") return;
    void loadChapterBody(activeChapter, detail, assets);
  }, [detail, assets, step, activeChapter, loadChapterBody]);

  /** 解析本书实际要用的提供商与模型；不可用时给出可读提示并返回 null */
  function requireAi(): { provider: AiProvider; model: string } | null {
    const resolved = resolveProvider(
      loadAiSettings(),
      detail?.providerId,
      detail?.model,
    );
    if (!resolved) {
      setError("请先在「设置」添加 AI 提供商，并在上方选择本书模型");
      return null;
    }
    if (resolved.provider.protocol !== "openai") {
      setError(
        `「${resolved.provider.name}」的 ${AI_PROTOCOL_LABELS[resolved.provider.protocol]} 协议将在下一阶段支持，请暂时改用 OpenAI 兼容的提供商`,
      );
      return null;
    }
    return resolved;
  }

  function confirmBreakLimitIfNeeded(next: boolean): boolean {
    if (!next) return true;
    if (isAdultConfirmed()) return true;
    const ok = window.confirm(
      "破限模式面向成年用户，允许生成成人向（18+）虚构内容。\n\n严禁任何涉及未成年人的性内容。\n\n确认你已满 18 岁并继续？",
    );
    if (!ok) return false;
    setAdultConfirmed(true);
    return true;
  }

  /** 空串一律存 undefined，保持与旧数据同构 */
  function trimmedOrUndefined(v: string | undefined): string | undefined {
    const t = v?.trim();
    return t ? t : undefined;
  }

  async function savePremise() {
    if (!bookId || !assets) return;
    if (breakLimit && !confirmBreakLimitIfNeeded(true)) {
      setBreakLimit(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchStudioBook(bookId, { title, breakLimit });
      const next: StudioAssets = {
        ...assets,
        premise: {
          idea: trimmedOrUndefined(premiseDraft.idea),
          genre: trimmedOrUndefined(premiseDraft.genre),
          tone: trimmedOrUndefined(premiseDraft.tone),
          targetLength: trimmedOrUndefined(premiseDraft.targetLength),
          logline: trimmedOrUndefined(premiseDraft.logline),
          notes: trimmedOrUndefined(premiseDraft.notes),
          autoChapterCount: premiseDraft.autoChapterCount ?? true,
        },
        updatedAt: Date.now(),
      };
      const saved = await putStudioAssets(bookId, next);
      setAssets(saved);
      await load();
      setStatus("立项已保存");
    } catch (err) {
      setError(errMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  async function saveAssets(next: StudioAssets) {
    if (!bookId) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await putStudioAssets(bookId, next);
      setAssets(saved);
      setStatus("已保存");
    } catch (err) {
      setError(errMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  async function runStream(
    buildMessages: () => ReturnType<typeof buildOutlineMessages>,
    onFull: (text: string) => void | Promise<void>,
    onPartial?: (text: string) => void,
  ) {
    const ai = requireAi();
    if (!ai) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    setError(null);
    setStatus("生成中…");
    let acc = "";
    try {
      await streamChatCompletion({
        provider: ai.provider,
        model: ai.model,
        messages: buildMessages(),
        signal: ac.signal,
        onDelta: (t) => {
          acc += t;
          onPartial?.(acc);
        },
      });
      await onFull(acc);
      setStatus("生成完成");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("已停止生成");
      } else {
        setError(errMessage(err, "生成失败"));
      }
    } finally {
      setGenerating(false);
    }
  }

  /**
   * AI 一次生成整套立项方案。
   * 只在流式结束后一次性回填（半截文本解析出的字段会闪烁），
   * 且逐项「有值才覆盖」，解析全空时不动用户已填的内容。
   */
  async function genPremise() {
    await runStream(
      () => buildPremiseMessages(breakLimit, premiseDraft.idea ?? ""),
      (text) => {
        const p = parsePremiseFromAi(text);
        const empty =
          !p.titles.length &&
          !p.genre &&
          !p.tone &&
          !p.targetLength &&
          !p.logline;
        if (empty) {
          setError("未能解析立项方案，请重试或手动填写");
          return;
        }
        if (p.titles.length) {
          setTitle(p.titles[0]!);
          setTitleCandidates(p.titles);
        }
        setPremiseDraft((prev) => ({
          ...prev,
          ...(p.genre ? { genre: p.genre } : {}),
          ...(p.tone ? { tone: p.tone } : {}),
          ...(p.targetLength ? { targetLength: p.targetLength } : {}),
          ...(p.logline ? { logline: p.logline } : {}),
        }));
        setStatus("立项方案已填入，确认后点「保存立项」");
      },
    );
  }

  /** 只重新生成书名候选，不动其它字段 */
  async function genTitles() {
    await runStream(
      () => buildTitlesMessages(breakLimit, premiseDraft.idea ?? "", premiseDraft),
      (text) => {
        const titles = parseTitlesFromAi(text);
        if (!titles.length) {
          setError("未能解析书名，请重试");
          return;
        }
        setTitle(titles[0]!);
        setTitleCandidates(titles);
      },
    );
  }

  async function genCharacters() {
    if (!assets || !detail) return;
    await runStream(
      () => buildCharactersMessages(breakLimit, title || detail.title, assets),
      async (text) => {
        const parsed = parseCharactersFromAi(text);
        if (!parsed.length) {
          setError("未能解析人设，请重试或手写");
          return;
        }
        await saveAssets({
          ...assets,
          characters: parsed,
          updatedAt: Date.now(),
        });
      },
    );
  }

  /**
   * 生成总大纲。解析出结构化字段就写 outlineDetail；
   * 模型回散文时退化为把整段塞进旧的 outline 字符串（即改造前行为）。
   * 不做流式局部回填——半截文本解析出的字段会闪烁。
   */
  async function genOutline() {
    if (!assets || !detail) return;
    await runStream(
      () => buildOutlineMessages(breakLimit, title || detail.title, assets),
      async (text) => {
        const detailed = parseOutlineDetailFromAi(text);
        if (detailed) {
          await saveAssets({
            ...assets,
            outlineDetail: detailed,
            updatedAt: Date.now(),
          });
          return;
        }
        const trimmed = text.trim();
        if (!trimmed) {
          setError("未能解析总大纲，请重试");
          return;
        }
        await saveAssets({
          ...assets,
          outline: trimmed,
          updatedAt: Date.now(),
        });
      },
    );
  }

  async function genChapterOutlines() {
    if (!assets || !detail) return;
    await runStream(
      () =>
        buildChapterOutlinesMessages(
          breakLimit,
          title || detail.title,
          assets,
          10,
          assets.premise.autoChapterCount ?? true,
        ),
      async (text) => {
        const parsed = parseChapterOutlinesFromAi(text);
        if (!parsed.length) {
          setError("未能解析细纲");
          return;
        }
        await saveAssets({
          ...assets,
          chapterOutlines: parsed,
          updatedAt: Date.now(),
        });
      },
    );
  }

  async function genChapterBody() {
    if (!assets || !detail) return;
    const outline: StudioChapterOutline = assets.chapterOutlines[
      activeChapter
    ] ?? {
      index: activeChapter,
      title: chapterTitle || `第 ${activeChapter + 1} 章`,
      summary: "",
    };
    setChapterText("");
    await runStream(
      () =>
        buildChapterBodyMessages(
          breakLimit,
          title || detail.title,
          assets,
          outline,
          activeChapter,
        ),
      async (text) => {
        setChapterText(text);
        setChapterTitle(outline.title);
        await putStudioChapter(bookId, activeChapter, {
          title: outline.title,
          text,
        });
        await load();
      },
      (partial) => setChapterText(partial),
    );
  }

  async function saveChapterBody() {
    if (!bookId) return;
    setSaving(true);
    setError(null);
    try {
      await putStudioChapter(bookId, activeChapter, {
        title: chapterTitle || `第 ${activeChapter + 1} 章`,
        text: chapterText,
      });
      await load();
      setStatus("章节已保存");
    } catch (err) {
      setError(errMessage(err, "保存章节失败"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleShelf() {
    if (!detail || !bookId) return;
    setSaving(true);
    setError(null);
    try {
      const next = !detail.onShelf;
      await setStudioShelf(bookId, next);
      await load();
      setStatus(next ? "已上架到书架" : "已从书架下架（内容仍保留）");
    } catch (err) {
      setError(errMessage(err, "上架操作失败"));
    } finally {
      setSaving(false);
    }
  }

  /** 切换本书使用的模型：乐观更新并持久化到该书 */
  /** 本书绑定的提供商与模型一起切换，两者必须同步落库 */
  async function selectBookModel(providerId: string, model: string) {
    if (!detail || !bookId) return;
    if (providerId === detail.providerId && model === detail.model) return;
    const prev = { providerId: detail.providerId, model: detail.model };
    setDetail({ ...detail, providerId, model });
    setError(null);
    try {
      await patchStudioBook(bookId, { providerId, model });
      setStatus(`本书模型已切换：${model}`);
    } catch (err) {
      setDetail((d) => (d ? { ...d, ...prev } : d));
      setError(errMessage(err, "切换模型失败"));
    }
  }

  function updateCharacter(i: number, patch: Partial<StudioCharacter>) {
    if (!assets) return;
    const characters = assets.characters.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    setAssets({ ...assets, characters });
  }

  function addCharacter() {
    if (!assets) return;
    const id = crypto.randomUUID();
    setNewCharacterId(id);
    setAssets({
      ...assets,
      characters: [
        ...assets.characters,
        {
          id,
          name: "",
          role: "",
          description: "",
        },
      ],
    });
  }

  function removeCharacter(i: number) {
    if (!assets) return;
    const target = assets.characters[i];
    if (!target) return;
    const ok = window.confirm(
      `删除角色「${target.name || "未命名角色"}」？记得随后点「保存人设」。`,
    );
    if (!ok) return;
    setAssets({
      ...assets,
      characters: assets.characters.filter((_, idx) => idx !== i),
    });
  }

  function updateChapterOutline(i: number, patch: Partial<StudioChapterOutline>) {
    if (!assets) return;
    const chapterOutlines = assets.chapterOutlines.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    setAssets({ ...assets, chapterOutlines });
  }

  function addChapterOutline() {
    if (!assets) return;
    const i = assets.chapterOutlines.length;
    setNewChapterIndex(i);
    setAssets({
      ...assets,
      chapterOutlines: [
        ...assets.chapterOutlines,
        { index: i, title: `第 ${i + 1} 章`, summary: "" },
      ],
    });
  }

  function removeChapterOutline(i: number) {
    if (!assets) return;
    const target = assets.chapterOutlines[i];
    if (!target) return;
    const ok = window.confirm(
      `删除第 ${i + 1} 章「${target.title || "未命名"}」的细纲？记得随后点「保存细纲」。`,
    );
    if (!ok) return;
    setNewChapterIndex(null);
    setAssets({
      ...assets,
      chapterOutlines: assets.chapterOutlines
        .filter((_, idx) => idx !== i)
        .map((c, idx) => ({ ...c, index: idx })),
    });
  }

  if (loading) {
    return (
      <main className="min-h-full flex items-center justify-center p-8">
        <p className="text-[var(--text-muted)]">加载中…</p>
      </main>
    );
  }

  if (!detail || !assets) {
    return (
      <main className="min-h-full p-8">
        <p className="text-red-400">{error ?? "作品不存在"}</p>
        <Link to="/studio" className="mt-4 inline-block text-[var(--accent)]">
          返回创作台
        </Link>
      </main>
    );
  }

  const bodyChapterCount = Math.max(
    assets.chapterOutlines.length,
    detail.chapters.length,
    1,
  );

  /** 与后端 char_count 一致：按 Unicode 码点计「字」 */
  const chapterCharCount = [...chapterText].length;
  const bookCharTotal = (() => {
    const byIdx = new Map(
      detail.chapters.map((c) => [c.index, c.charCount] as const),
    );
    byIdx.set(activeChapter, chapterCharCount);
    let sum = 0;
    for (const n of byIdx.values()) sum += n;
    return sum;
  })();

  return (
    <main className="min-h-full p-4 md:p-8">
      <header className="mx-auto flex max-w-5xl flex-col gap-4 border-b border-[var(--border)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-muted)]">
              <Link
                to="/studio"
                className="transition-colors hover:text-[var(--accent)]"
              >
                创作台
              </Link>
              <span className="mx-1.5 opacity-50">/</span>
              <span className="text-[var(--text)]">{detail.title}</span>
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--text)]">
                {title || detail.title}
              </h1>
              {detail.breakLimit ? (
                <span className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-300">
                  18+
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {detail.onShelf ? (
              <Link
                to={`/read/${detail.id}`}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                去阅读
              </Link>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void toggleShelf()}
              className={`rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60 ${
                detail.onShelf
                  ? "border border-[var(--border)] hover:border-[var(--accent)]"
                  : "bg-[var(--accent)] text-[var(--bg)] hover:opacity-90"
              }`}
            >
              {detail.onShelf ? "下架" : "上架到书架"}
            </button>
            <Link
              to="/library"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              书架
            </Link>
          </div>
        </div>
        <StudioModelPicker
          compact
          label="本书模型"
          value={{ providerId: detail.providerId, model: detail.model }}
          onSelect={(providerId, model) => void selectBookModel(providerId, model)}
        />
      </header>

      <nav className="mx-auto mt-4 flex max-w-5xl flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              step === s.id
                ? "bg-[var(--accent)] text-[var(--bg)]"
                : "border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <section className="mx-auto mt-6 max-w-5xl space-y-4">
        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="text-sm text-[var(--text-muted)]">{status}</p>
        ) : null}

        {step === "premise" ? (
          <StudioPremisePanel
            title={title}
            breakLimit={breakLimit}
            premise={premiseDraft}
            titleCandidates={titleCandidates}
            saving={saving}
            generating={generating}
            onTitleChange={setTitle}
            onBreakLimitChange={(v) => {
              if (v && !confirmBreakLimitIfNeeded(true)) return false;
              setBreakLimit(v);
              return true;
            }}
            onPremiseChange={(patch) =>
              setPremiseDraft((prev) => ({ ...prev, ...patch }))
            }
            onAiPremise={() => void genPremise()}
            onAiTitles={() => void genTitles()}
            onStop={() => abortRef.current?.abort()}
            onSave={() => void savePremise()}
          />
        ) : null}

        {step === "characters" ? (
          <StudioCharacterPanel
            characters={assets.characters}
            newlyAddedId={newCharacterId}
            saving={saving}
            generating={generating}
            onChange={updateCharacter}
            onAdd={addCharacter}
            onRemove={removeCharacter}
            onGenerate={() => void genCharacters()}
            onSave={() => void saveAssets(assets)}
            onStop={() => abortRef.current?.abort()}
          />
        ) : null}

        {step === "outline" ? (
          <StudioOutlinePanel
            outline={assets.outline}
            outlineDetail={assets.outlineDetail ?? {}}
            saving={saving}
            generating={generating}
            onDetailChange={(patch) =>
              setAssets({
                ...assets,
                outlineDetail: { ...assets.outlineDetail, ...patch },
              })
            }
            onOutlineChange={(v) => setAssets({ ...assets, outline: v })}
            onGenerate={() => void genOutline()}
            onSave={() => void saveAssets({ ...assets, updatedAt: Date.now() })}
            onStop={() => abortRef.current?.abort()}
          />
        ) : null}

        {step === "chapters" ? (
          <StudioChaptersPanel
            chapters={assets.chapterOutlines}
            newlyAddedIndex={newChapterIndex}
            autoChapterCount={assets.premise.autoChapterCount ?? true}
            saving={saving}
            generating={generating}
            onChange={updateChapterOutline}
            onAdd={addChapterOutline}
            onRemove={removeChapterOutline}
            onGenerate={() => void genChapterOutlines()}
            onSave={() => void saveAssets(assets)}
            onStop={() => abortRef.current?.abort()}
          />
        ) : null}

        {step === "body" ? (
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <p className="mb-2 text-xs text-[var(--text-muted)]">章节</p>
              <ul className="max-h-[60vh] space-y-1 overflow-y-auto text-sm">
                {Array.from({ length: bodyChapterCount }, (_, i) => {
                  const label =
                    assets.chapterOutlines[i]?.title ??
                    detail.chapters.find((c) => c.index === i)?.title ??
                    `第 ${i + 1} 章`;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setActiveChapter(i)}
                        className={`w-full rounded px-2 py-1.5 text-left ${
                          activeChapter === i
                            ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                            : "hover:bg-[var(--bg)]"
                        }`}
                      >
                        {i + 1}. {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="mt-2 w-full rounded border border-[var(--border)] py-1.5 text-xs"
                onClick={() => {
                  addChapterOutline();
                  setActiveChapter(assets.chapterOutlines.length);
                }}
              >
                + 新章
              </button>
            </aside>
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p>
                    <span className="text-[var(--text-muted)]">本章</span>
                    <span
                      className="ml-2 font-mono text-base font-semibold tabular-nums text-[var(--accent)]"
                      aria-live="polite"
                    >
                      {chapterCharCount.toLocaleString("zh-CN")}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]">字</span>
                    {generating ? (
                      <span className="ml-2 text-xs text-amber-400">生成中</span>
                    ) : null}
                  </p>
                  <p>
                    <span className="text-[var(--text-muted)]">全书（含本章）</span>
                    <span className="ml-2 font-mono tabular-nums text-[var(--text)]">
                      {bookCharTotal.toLocaleString("zh-CN")}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]">字</span>
                  </p>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  按字符计（与入库一致）
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={generating || chapterLoading}
                  onClick={() => void genChapterBody()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
                >
                  {generating
                    ? `生成中… ${chapterCharCount.toLocaleString("zh-CN")} 字`
                    : "AI 生成/重生成本章"}
                </button>
                <button
                  type="button"
                  disabled={saving || generating}
                  onClick={() => void saveChapterBody()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
                >
                  保存本章
                </button>
                {generating ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300"
                  >
                    停止
                  </button>
                ) : null}
              </div>
              <input
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-medium"
                placeholder="章标题"
              />
              {chapterLoading ? (
                <p className="text-sm text-[var(--text-muted)]">加载章节…</p>
              ) : (
                <textarea
                  value={chapterText}
                  onChange={(e) => setChapterText(e.target.value)}
                  rows={22}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-serif text-[15px] leading-relaxed text-[var(--text)]"
                  placeholder="正文纯文本…"
                />
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
