import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitTtsChunks } from "../lib/ttsChunks";

/**
 * TTS 听书（Web SpeechSynthesis）：
 * - 状态机 idle/playing/paused；按段落逐段、段内按块逐块朗读
 * - 段落取自正文 DOM（[data-hl-chapter] 容器，与高亮/textAnchor 同一
 *   「渲染后纯文本」口径），偏移可直接给 offsetsToRange 做段落高亮
 * - 章读完自动请求下一章（onRequestChapter），轮询等新章 DOM 就绪后继续
 * - 语速/音色偏好存 localStorage；卸载与停止时 speechSynthesis.cancel()
 */

export type TtsState = "idle" | "playing" | "paused";

/** 可选语速档位 */
export const TTS_RATES: readonly number[] = [0.75, 1, 1.25, 1.5, 2];

/** 当前朗读段（偏移为章内渲染纯文本口径，供 CSS 高亮与视口跟随） */
export interface TtsParagraph {
  chapterIndex: number;
  start: number;
  end: number;
}

interface UseTtsParams {
  chapterCount: number;
  /** 朗读段变化：宿主据此注册高亮并跟随视口 */
  onParagraph: (para: TtsParagraph) => void;
  /** 跨章继续：请求宿主跳到该章（章首），DOM 就绪后自动续播 */
  onRequestChapter: (chapterIndex: number) => void;
}

export interface UseTtsReturn {
  /** 浏览器不支持 SpeechSynthesis 时为 false（隐藏入口） */
  supported: boolean;
  state: TtsState;
  rate: number;
  setRate: (rate: number) => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  setVoiceURI: (uri: string | null) => void;
  /** 从指定章的 charOffset 所在段开始朗读（进行中则重新开始） */
  start: (chapterIndex: number, charOffset: number) => void;
  /** 播放/暂停切换（暂停恢复后从当前块重读） */
  toggle: () => void;
  /** 停止并退出听书 */
  stop: () => void;
}

const RATE_KEY = "yudu:tts-rate";
const VOICE_KEY = "yudu:tts-voice";
/** 跨章等待 DOM 就绪的轮询间隔与上限（约 15s 超时停止） */
const POLL_MS = 250;
const POLL_MAX = 60;

/** 段落文本 + 章内偏移（TreeWalker 口径，与 textAnchor 一致） */
interface ParaText {
  start: number;
  end: number;
  text: string;
}

/** 播放位置：当前章段落列表 + 段/块游标 */
interface PlayPos {
  chapter: number;
  list: ParaText[];
  paraIdx: number;
  chunks: string[];
  chunkIdx: number;
}

/** 段落边界判定用的块级标签（md 渲染 DOM；plain 模式正文直接挂在容器上） */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "SECTION",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "TR",
  "TABLE",
]);

/** 找文本节点的最近块级祖先（不越过容器）；无则归容器 */
function blockOf(node: Node, container: HTMLElement): Node {
  let cur: Node | null = node.parentNode;
  while (cur && cur !== container) {
    if (cur instanceof HTMLElement && BLOCK_TAGS.has(cur.tagName)) return cur;
    cur = cur.parentNode;
  }
  return container;
}

/** 去掉首尾空白后压入段落（记录偏移随之内缩）；纯空白段丢弃 */
function pushTrimmed(out: ParaText[], text: string, start: number): void {
  let s = 0;
  let e = text.length;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  if (e <= s) return;
  out.push({ start: start + s, end: start + e, text: text.slice(s, e) });
}

/**
 * 收集容器内的朗读段落：TreeWalker 按文档序累计偏移（与 textAnchor 同口径），
 * 以「最近块级祖先」变化为段落边界，块内再按换行拆分（plain 模式整章单文本节点）。
 */
export function collectTtsParagraphs(container: HTMLElement): ParaText[] {
  const doc = container.ownerDocument;
  if (!doc) return [];
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const paras: ParaText[] = [];
  let acc = 0;
  let curBlock: Node | null = null;
  let buf = "";
  let bufStart = 0;

  const flush = () => {
    if (!buf) return;
    let i = 0;
    while (i < buf.length) {
      let j = buf.indexOf("\n", i);
      if (j === -1) j = buf.length;
      pushTrimmed(paras, buf.slice(i, j), bufStart + i);
      i = j + 1;
    }
    buf = "";
  };

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n as Text).data;
    const block = blockOf(n, container);
    if (block !== curBlock) {
      flush();
      curBlock = block;
      bufStart = acc;
      buf = text;
    } else {
      buf += text;
    }
    acc += text.length;
  }
  flush();
  return paras;
}

/** 取指定章正文容器的段落；容器未挂载返回 null（区别于空章 []） */
function collectChapterParagraphs(chapterIndex: number): ParaText[] | null {
  const el = document.querySelector<HTMLElement>(
    `[data-hl-chapter="${chapterIndex}"]`,
  );
  if (!el) return null;
  return collectTtsParagraphs(el);
}

function loadRate(): number {
  try {
    const v = Number(localStorage.getItem(RATE_KEY));
    if (TTS_RATES.includes(v)) return v;
  } catch {
    // 读取失败静默
  }
  return 1;
}

function loadVoiceURI(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function useTts({
  chapterCount,
  onParagraph,
  onRequestChapter,
}: UseTtsParams): UseTtsReturn {
  const supported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  const [state, setState] = useState<TtsState>("idle");
  const [rate, setRateState] = useState(loadRate);
  const [voiceURI, setVoiceURIState] = useState<string | null>(loadVoiceURI);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // 渲染期同步 ref：utterance 回调链读取最新值，不受闭包陈旧影响
  const stateRef = useRef(state);
  stateRef.current = state;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const voiceURIRef = useRef(voiceURI);
  voiceURIRef.current = voiceURI;
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const chapterCountRef = useRef(chapterCount);
  chapterCountRef.current = chapterCount;
  const onParagraphRef = useRef(onParagraph);
  onParagraphRef.current = onParagraph;
  const onRequestChapterRef = useRef(onRequestChapter);
  onRequestChapterRef.current = onRequestChapter;

  // 会话令牌：cancel/换速/换音色会自增令牌，旧 utterance 的 onend/onerror 不再推进
  const sessionRef = useRef(0);
  const posRef = useRef<PlayPos | null>(null);
  // 轮询目标（pos 建立前）：此阶段被暂停后，恢复播放需据此重新发起轮询
  const pollTargetRef = useRef<{ chapter: number; offset: number } | null>(
    null,
  );
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 持有当前 utterance：Chrome 会 GC 无引用的 utterance 导致事件丢失
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  // 播放引擎：块推进/段推进/跨章轮询互相递归，统一放稳定对象里（只依赖 ref）
  const engine = useMemo(() => {
    const clearPoll = () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    /** 令牌自增 + 取消排队/发声中的 utterance + 清轮询 */
    const cancelAll = () => {
      sessionRef.current += 1;
      clearPoll();
      utterRef.current = null;
      window.speechSynthesis.cancel();
    };

    const stopInternal = () => {
      cancelAll();
      posRef.current = null;
      pollTargetRef.current = null;
      setState("idle");
    };

    const speakChunk = (session: number) => {
      if (session !== sessionRef.current) return;
      const pos = posRef.current;
      if (!pos) return;
      // 跳过纯空白块
      while (
        pos.chunkIdx < pos.chunks.length &&
        !pos.chunks[pos.chunkIdx].trim()
      ) {
        pos.chunkIdx += 1;
      }
      if (pos.chunkIdx >= pos.chunks.length) {
        pos.paraIdx += 1;
        beginParagraph(session);
        return;
      }
      const u = new SpeechSynthesisUtterance(pos.chunks[pos.chunkIdx]);
      u.rate = rateRef.current;
      const voice =
        voicesRef.current.find((v) => v.voiceURI === voiceURIRef.current) ??
        null;
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        // 未选音色：以 lang 提示引擎挑中文语音
        u.lang = "zh-CN";
      }
      const advance = () => {
        if (session !== sessionRef.current) return;
        const p = posRef.current;
        if (!p) return;
        p.chunkIdx += 1;
        speakChunk(session);
      };
      u.onend = advance;
      // 非 cancel 错误也向后推进（cancel 场景由会话令牌拦截），避免卡死
      u.onerror = advance;
      utterRef.current = u;
      window.speechSynthesis.speak(u);
      // Chrome 偶发停在 paused 态的已知问题：speak 后补一次 resume 兜底
      window.speechSynthesis.resume();
    };

    /** 播当前游标指向的段落；越过章尾则请求下一章 */
    const beginParagraph = (session: number) => {
      if (session !== sessionRef.current) return;
      const pos = posRef.current;
      if (!pos) return;
      const para = pos.list[pos.paraIdx];
      if (!para) {
        advanceChapter(session);
        return;
      }
      pos.chunks = splitTtsChunks(para.text);
      pos.chunkIdx = 0;
      onParagraphRef.current({
        chapterIndex: pos.chapter,
        start: para.start,
        end: para.end,
      });
      speakChunk(session);
    };

    const advanceChapter = (session: number) => {
      const pos = posRef.current;
      if (!pos) return;
      const next = pos.chapter + 1;
      if (next >= chapterCountRef.current) {
        // 全书读完
        stopInternal();
        return;
      }
      onRequestChapterRef.current(next);
      pollChapter(next, session, 0);
    };

    /**
     * 等目标章正文 DOM 就绪（含章节加载/渲染），就绪后从 charOffset 所在段续播。
     * 首次调用即同步尝试一次，DOM 已就绪时无额外延迟。
     */
    const pollChapter = (
      chapterIndex: number,
      session: number,
      tries: number,
      charOffset = 0,
    ) => {
      if (session !== sessionRef.current) return;
      pollTargetRef.current = { chapter: chapterIndex, offset: charOffset };
      const list = collectChapterParagraphs(chapterIndex);
      if (list && list.length > 0) {
        pollTargetRef.current = null;
        let paraIdx = list.findIndex((p) => p.end > charOffset);
        // 偏移已越过末段（章尾）：游标越界，beginParagraph 会触发进下一章
        if (paraIdx === -1) paraIdx = list.length;
        posRef.current = {
          chapter: chapterIndex,
          list,
          paraIdx,
          chunks: [],
          chunkIdx: 0,
        };
        beginParagraph(session);
        return;
      }
      if (tries >= POLL_MAX) {
        stopInternal();
        return;
      }
      pollTimerRef.current = setTimeout(
        () => pollChapter(chapterIndex, session, tries + 1, charOffset),
        POLL_MS,
      );
    };

    return { cancelAll, stopInternal, speakChunk, beginParagraph, pollChapter };
  }, []);

  // 语音列表异步就绪：voiceschanged 后刷新
  useEffect(() => {
    if (!supported) return;
    const sync = () => setVoices(window.speechSynthesis.getVoices());
    sync();
    window.speechSynthesis.addEventListener("voiceschanged", sync);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", sync);
  }, [supported]);

  // 卸载清理：停止发声与轮询
  useEffect(() => {
    if (!supported) return;
    return () => {
      sessionRef.current += 1;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const start = useCallback(
    (chapterIndex: number, charOffset: number) => {
      if (!supported) return;
      engine.cancelAll();
      setState("playing");
      // 目标章 DOM 可能未就绪（跳转刚发起/章节加载中）：统一走轮询入口
      engine.pollChapter(chapterIndex, sessionRef.current, 0, charOffset);
    },
    [engine, supported],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    engine.stopInternal();
  }, [engine, supported]);

  const toggle = useCallback(() => {
    if (!supported) return;
    if (stateRef.current === "playing") {
      // 暂停：直接 cancel（原生 pause 在部分平台不可靠），游标留在当前块
      engine.cancelAll();
      setState("paused");
      return;
    }
    if (stateRef.current === "paused") {
      if (posRef.current) {
        sessionRef.current += 1;
        setState("playing");
        engine.speakChunk(sessionRef.current);
      } else if (pollTargetRef.current) {
        // 跨章轮询期被暂停（pos 未建立）：恢复时重新发起轮询
        const t = pollTargetRef.current;
        sessionRef.current += 1;
        setState("playing");
        engine.pollChapter(t.chapter, sessionRef.current, 0, t.offset);
      }
    }
  }, [engine, supported]);

  const setRate = useCallback(
    (next: number) => {
      if (!TTS_RATES.includes(next)) return;
      rateRef.current = next;
      setRateState(next);
      try {
        localStorage.setItem(RATE_KEY, String(next));
      } catch {
        // 写入失败静默
      }
      // 播放中：以新语速重读当前块；pos 未建立（跨章轮询中）时不动会话，
      // 避免令牌自增杀掉进行中的轮询——后续块自然读到新语速
      if (stateRef.current === "playing" && posRef.current) {
        sessionRef.current += 1;
        window.speechSynthesis.cancel();
        engine.speakChunk(sessionRef.current);
      }
    },
    [engine],
  );

  const setVoiceURI = useCallback(
    (uri: string | null) => {
      voiceURIRef.current = uri;
      setVoiceURIState(uri);
      try {
        if (uri) localStorage.setItem(VOICE_KEY, uri);
        else localStorage.removeItem(VOICE_KEY);
      } catch {
        // 写入失败静默
      }
      // 同 setRate：仅在 pos 已建立时重读当前块，轮询期不动会话
      if (stateRef.current === "playing" && posRef.current) {
        sessionRef.current += 1;
        window.speechSynthesis.cancel();
        engine.speakChunk(sessionRef.current);
      }
    },
    [engine],
  );

  return {
    supported,
    state,
    rate,
    setRate,
    voices,
    voiceURI,
    setVoiceURI,
    start,
    toggle,
    stop,
  };
}
