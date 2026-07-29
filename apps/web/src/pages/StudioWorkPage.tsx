import type {
  ChapterContent,
  StudioAssets,
  StudioBookDetail,
  StudioCharacter,
  StudioChapterOutline,
} from "@yudu/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  isAdultConfirmed,
  isAiSettingsReady,
  loadAiSettings,
  setAdultConfirmed,
} from "../lib/aiSettings";
import {
  buildChapterBodyMessages,
  buildChapterOutlinesMessages,
  buildCharactersMessages,
  buildOutlineMessages,
  parseChapterOutlinesFromAi,
  parseCharactersFromAi,
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
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");
  const [targetLength, setTargetLength] = useState("");
  const [notes, setNotes] = useState("");

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
    setGenre(d.assets.premise.genre ?? "");
    setTone(d.assets.premise.tone ?? "");
    setTargetLength(d.assets.premise.targetLength ?? "");
    setNotes(d.assets.premise.notes ?? "");
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

  function requireAi(): boolean {
    if (!isAiSettingsReady()) {
      setError("请先在「设置」中配置 new-api 的 Base URL、API Key 与模型");
      return false;
    }
    return true;
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
          genre: genre.trim() || undefined,
          tone: tone.trim() || undefined,
          targetLength: targetLength.trim() || undefined,
          notes: notes.trim() || undefined,
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
    if (!requireAi()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGenerating(true);
    setError(null);
    setStatus("生成中…");
    let acc = "";
    try {
      await streamChatCompletion({
        settings: loadAiSettings(),
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

  async function genOutline() {
    if (!assets || !detail) return;
    let draft = "";
    await runStream(
      () => buildOutlineMessages(breakLimit, title || detail.title, assets),
      async (text) => {
        await saveAssets({
          ...assets,
          outline: text.trim(),
          updatedAt: Date.now(),
        });
      },
      (partial) => {
        draft = partial;
        setAssets((prev) => (prev ? { ...prev, outline: draft } : prev));
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

  function updateCharacter(i: number, patch: Partial<StudioCharacter>) {
    if (!assets) return;
    const characters = assets.characters.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    setAssets({ ...assets, characters });
  }

  function addCharacter() {
    if (!assets) return;
    setAssets({
      ...assets,
      characters: [
        ...assets.characters,
        {
          id: crypto.randomUUID(),
          name: "",
          role: "",
          description: "",
        },
      ],
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
    setAssets({
      ...assets,
      chapterOutlines: [
        ...assets.chapterOutlines,
        { index: i, title: `第 ${i + 1} 章`, summary: "" },
      ],
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

  return (
    <main className="min-h-full p-4 md:p-8">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="min-w-0">
          <p className="text-xs text-[var(--text-muted)]">
            <Link to="/studio" className="hover:text-[var(--accent)]">
              创作台
            </Link>
            {" / "}
            {detail.title}
            {detail.breakLimit ? (
              <span className="ml-2 text-rose-300">破限</span>
            ) : null}
          </p>
          <h1 className="truncate text-xl font-semibold text-[var(--text)]">
            {title || detail.title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {detail.onShelf ? (
            <Link
              to={`/read/${detail.id}`}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)]"
            >
              去阅读
            </Link>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleShelf()}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 hover:border-[var(--accent)] disabled:opacity-60"
          >
            {detail.onShelf ? "下架" : "上架到书架"}
          </button>
          <Link
            to="/library"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5"
          >
            书架
          </Link>
        </div>
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
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">书名</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={breakLimit}
                onChange={(e) => {
                  const v = e.target.checked;
                  if (v && !confirmBreakLimitIfNeeded(true)) return;
                  setBreakLimit(v);
                }}
              />
              <span>
                <span className="text-[var(--text)]">破限模式（18+）</span>
                <span className="mt-1 block text-[var(--text-muted)]">
                  内置 Gemini 向破限提示：可写露骨成人向虚构，默认细腻文风（避免粗口暴躁流）；禁止未成年人相关。仍依赖你自选的模型。
                </span>
              </span>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="类型" value={genre} onChange={setGenre} />
              <Field label="基调" value={tone} onChange={setTone} />
              <Field
                label="目标篇幅"
                value={targetLength}
                onChange={setTargetLength}
              />
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-muted)]">备注</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void savePremise()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--bg)] disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存立项"}
            </button>
          </div>
        ) : null}

        {step === "characters" ? (
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={generating}
                onClick={() => void genCharacters()}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
              >
                {generating ? "生成中…" : "AI 生成人设"}
              </button>
              <button
                type="button"
                onClick={addCharacter}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                添加角色
              </button>
              <button
                type="button"
                disabled={saving || generating}
                onClick={() => void saveAssets(assets)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-60"
              >
                保存人设
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
            {assets.characters.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">暂无人设</p>
            ) : (
              <ul className="space-y-3">
                {assets.characters.map((c, i) => (
                  <li
                    key={c.id}
                    className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-3"
                  >
                    <input
                      placeholder="姓名"
                      value={c.name}
                      onChange={(e) =>
                        updateCharacter(i, { name: e.target.value })
                      }
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                    />
                    <input
                      placeholder="身份"
                      value={c.role}
                      onChange={(e) =>
                        updateCharacter(i, { role: e.target.value })
                      }
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                    />
                    <textarea
                      placeholder="描述"
                      value={c.description}
                      onChange={(e) =>
                        updateCharacter(i, { description: e.target.value })
                      }
                      rows={2}
                      className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm md:col-span-3"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {step === "outline" ? (
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={generating}
                onClick={() => void genOutline()}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
              >
                {generating ? "生成中…" : "AI 生成总大纲"}
              </button>
              <button
                type="button"
                disabled={saving || generating}
                onClick={() =>
                  void saveAssets({
                    ...assets,
                    outline: assets.outline,
                    updatedAt: Date.now(),
                  })
                }
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                保存大纲
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
            <textarea
              value={assets.outline}
              onChange={(e) =>
                setAssets({ ...assets, outline: e.target.value })
              }
              rows={16}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-serif text-[var(--text)] leading-relaxed"
              placeholder="总大纲…"
            />
          </div>
        ) : null}

        {step === "chapters" ? (
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={generating}
                onClick={() => void genChapterOutlines()}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
              >
                {generating ? "生成中…" : "AI 生成细纲（约10章）"}
              </button>
              <button
                type="button"
                onClick={addChapterOutline}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                加一章细纲
              </button>
              <button
                type="button"
                disabled={saving || generating}
                onClick={() => void saveAssets(assets)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                保存细纲
              </button>
            </div>
            <ul className="space-y-3">
              {assets.chapterOutlines.map((ch, i) => (
                <li key={i} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                  <input
                    value={ch.title}
                    onChange={(e) =>
                      updateChapterOutline(i, { title: e.target.value })
                    }
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm font-medium"
                  />
                  <textarea
                    value={ch.summary}
                    onChange={(e) =>
                      updateChapterOutline(i, { summary: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                    placeholder="节拍 / 冲突 / 钩子"
                  />
                </li>
              ))}
            </ul>
          </div>
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={generating || chapterLoading}
                  onClick={() => void genChapterBody()}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)] disabled:opacity-60"
                >
                  {generating ? "生成中…" : "AI 生成/重生成本章"}
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)]"
      />
    </label>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof AiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
