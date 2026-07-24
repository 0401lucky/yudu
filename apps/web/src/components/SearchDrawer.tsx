import type {
  BookSearchMatch,
  BookSearchResult,
  ChapterMeta,
} from "@yudu/shared";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";

/** 与服务端一致的关键词长度限制 */
const MIN_QUERY_CHARS = 2;
const MAX_QUERY_CHARS = 50;

interface SearchDrawerProps {
  open: boolean;
  chapters: ChapterMeta[];
  onClose: () => void;
  /** 执行搜索（由页面注入，组件不直接调 API） */
  onSearch: (q: string) => Promise<BookSearchResult>;
  /** 点击命中项跳转 */
  onSelectMatch: (match: BookSearchMatch) => void;
}

export default function SearchDrawer({
  open,
  chapters,
  onClose,
  onSearch,
  onSelectMatch,
}: SearchDrawerProps) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BookSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 防止慢响应覆盖新一轮搜索结果
  const searchSeqRef = useRef(0);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape 关闭抽屉（仅打开时监听）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    const q = query.trim();
    if (q.length < MIN_QUERY_CHARS) {
      setHint(`请输入至少 ${MIN_QUERY_CHARS} 个字符`);
      return;
    }
    if (q.length > MAX_QUERY_CHARS) {
      setHint(`关键词最多 ${MAX_QUERY_CHARS} 个字符`);
      return;
    }
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setHint(null);
    try {
      const res = await onSearch(q);
      if (seq !== searchSeqRef.current) return;
      setResult(res);
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      setResult(null);
      setHint(errMessage(err, "搜索失败，请稍后重试"));
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="关闭搜索"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-[min(100%,18rem)] max-w-[85vw] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] pt-[env(safe-area-inset-top)] shadow-xl sm:w-80">
        <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-2">
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索本书内容"
              aria-label="搜索关键词"
              className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex h-10 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50 disabled:hover:bg-transparent"
            >
              搜索
            </button>
          </form>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center rounded px-3 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain py-1 pb-[env(safe-area-inset-bottom)]">
          {hint ? (
            <p
              role="status"
              className="mx-3 mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)] sm:mx-4"
            >
              {hint}
            </p>
          ) : null}

          {loading ? (
            <div
              role="status"
              className="flex flex-col items-center gap-3 px-4 py-12"
            >
              <span
                aria-hidden
                className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
              />
              <p className="text-sm text-[var(--text-muted)]">搜索中…</p>
            </div>
          ) : result ? (
            result.matches.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <SearchGlyph />
                <p className="text-sm text-[var(--text)]">未找到相关内容</p>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  「{result.query}」在本书中没有匹配，换个关键词试试
                </p>
              </div>
            ) : (
              <>
                {result.truncated ? (
                  <p className="mx-3 mb-1 mt-2 rounded-lg bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)] sm:mx-4">
                    结果过多，仅显示前 {result.matches.length} 条，可尝试更精确的关键词
                  </p>
                ) : null}
                <ul>
                  {result.matches.map((match, i) => (
                    <li key={`${match.chapterIndex}-${match.charOffset}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectMatch(match);
                          onClose();
                        }}
                        className="w-full px-3 py-3 text-left text-sm leading-snug text-[var(--text)] transition-colors hover:bg-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:px-4"
                      >
                        <span className="mb-1 flex items-baseline justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                          <span className="truncate">{match.chapterTitle}</span>
                          <span className="shrink-0 tabular-nums">
                            约 {matchPercent(chapters, match)}%
                          </span>
                        </span>
                        <ExcerptWithHighlight
                          excerpt={match.excerpt}
                          keywordStart={match.keywordStart}
                          keywordLength={result.query.length}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : !hint ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <SearchGlyph />
              <p className="text-sm text-[var(--text)]">搜索本书内容</p>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                输入 {MIN_QUERY_CHARS}-{MAX_QUERY_CHARS} 个字符的关键词，
                回车开始搜索
              </p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** 空态引导用的放大镜图标（与顶栏入口同一线型语言） */
function SearchGlyph() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-[var(--text-muted)] opacity-60"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

/** 按 keywordStart 切三段渲染高亮，避免 dangerouslySetInnerHTML */
function ExcerptWithHighlight({
  excerpt,
  keywordStart,
  keywordLength,
}: {
  excerpt: string;
  keywordStart: number;
  keywordLength: number;
}) {
  const before = excerpt.slice(0, keywordStart);
  const keyword = excerpt.slice(keywordStart, keywordStart + keywordLength);
  const after = excerpt.slice(keywordStart + keywordLength);
  return (
    <span className="line-clamp-3 block text-[13px] leading-relaxed text-[var(--text-muted)]">
      {before}
      <mark className="rounded-sm bg-[color:color-mix(in_srgb,var(--accent)_25%,transparent)] px-0.5 font-medium text-[var(--accent)]">
        {keyword}
      </mark>
      {after}
    </span>
  );
}

/** 命中点在章内的近似百分比位置（展示用，与书签同款换算） */
function matchPercent(chapters: ChapterMeta[], match: BookSearchMatch): number {
  const charCount =
    chapters.find((ch) => ch.index === match.chapterIndex)?.charCount ?? 0;
  if (charCount <= 0) return 0;
  return Math.min(100, Math.round((match.charOffset / charCount) * 100));
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}
