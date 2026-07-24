import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchBookSource } from "../lib/api";

// pdf.js worker：Vite 静态资源方案（?url 产出 asset 路径，无 CDN 依赖）。
// 本组件经 React.lazy 按需加载，此配置随 pdfjs chunk 首次加载时执行一次。
GlobalWorkerOptions.workerSrc = workerUrl;

/** 与 ReaderViewport 相同的滑动翻页阈值 */
const SWIPE_THRESHOLD = 48;

interface PdfReaderViewProps {
  bookId: string;
  /** 当前页（0-based；pdf.js 页码 1-based，内部换算） */
  pageIndex: number;
  /** 文档解析成功后上报总页数（复用 ReaderPage 的恢复落位与夹取） */
  onPageCount: (count: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
}

type Phase = "loading" | "error" | "ready";

/**
 * PDF 阅读视图：后端只透传原始文件，本组件用 pdf.js 在 canvas 上
 * 原样逐页渲染（fit-width + devicePixelRatio 适配高分屏）。
 * 翻页交互与 ReaderViewport 同约定：点击三分区 / 横向滑动；
 * 键盘方向键复用 ReaderPage 的全局监听（含文本输入豁免），此处不重复绑定。
 */
export default function PdfReaderView({
  bookId,
  pageIndex,
  onPageCount,
  onPrev,
  onNext,
  onToggleChrome,
}: PdfReaderViewProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  // dpr 入 state：跨屏拖动窗口时 CSS 宽度可能不变（ResizeObserver 不触发），
  // 需单独监听 devicePixelRatio 变化重渲染，避免旧位图被缩放发糊
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  // 首页渲染完成前 canvas 是 0 尺寸，先叠一层加载指示避免空白
  const [renderedOnce, setRenderedOnce] = useState(false);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  // v6 起文档销毁走 loadingTask.destroy()（含中止加载与终止 worker）
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderSeqRef = useRef(0);
  const lastRenderedPageRef = useRef<number | null>(null);
  // onPageCount 存 ref：回调身份变化不应触发整份 PDF 重新拉取
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;

  // 手势状态（轴锁定，参照 ReaderViewport）
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);
  const axisLocked = useRef<"h" | "v" | null>(null);

  // 拉取并解析文档
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setErrorText(null);
    setRenderedOnce(false);
    lastRenderedPageRef.current = null;
    (async () => {
      try {
        const data = await fetchBookSource(bookId);
        if (cancelled) return;
        // pdf.js 核心渲染只在 canvas 绘制，不执行 PDF 文档脚本
        //（eval 编译路径已在 pdf.js v5 起整体移除）
        const loadingTask = getDocument({ data });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        pdfRef.current = doc;
        setPhase("ready");
        onPageCountRef.current(doc.numPages);
      } catch (err) {
        if (cancelled) return;
        setErrorText(loadErrorText(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      pdfRef.current = null;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [bookId]);

  // 版心宽度测量：窗口/容器尺寸变化时重渲染当前页
  useEffect(() => {
    if (phase !== "ready") return;
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = Math.floor(
        entries[0]?.contentRect.width ?? el.clientWidth,
      );
      if (width > 0) setContainerWidth(width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // 监听当前 dpr 档位失效（matchMedia change 只触发一次，需随 dpr 重挂）
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [dpr]);

  // 渲染当前页：fit-width + dpr；离屏渲染完成后一次性拷贝到可见 canvas，
  // 翻页/缩放期间保留旧页内容，避免闪白
  useEffect(() => {
    const doc = pdfRef.current;
    if (phase !== "ready" || !doc || containerWidth <= 0) return;
    let cancelled = false;
    const seq = ++renderSeqRef.current;
    (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled || seq !== renderSeqRef.current) return;

        const base = page.getViewport({ scale: 1 });
        const scale = containerWidth / base.width;
        const viewport = page.getViewport({ scale });

        const off = document.createElement("canvas");
        off.width = Math.max(1, Math.floor(viewport.width * dpr));
        off.height = Math.max(1, Math.floor(viewport.height * dpr));

        // 新渲染启动前取消进行中的任务，防止竞态花屏
        renderTaskRef.current?.cancel();
        const task = page.render({
          canvas: off,
          viewport,
          ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {}),
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled || seq !== renderSeqRef.current) return;

        const visible = canvasRef.current;
        if (!visible) return;
        visible.width = off.width;
        visible.height = off.height;
        visible.style.width = `${Math.floor(viewport.width)}px`;
        visible.style.height = `${Math.floor(viewport.height)}px`;
        visible.getContext("2d")?.drawImage(off, 0, 0);
        setRenderedOnce(true);

        // 翻页后回到页顶；resize 重渲染保持滚动位置
        if (lastRenderedPageRef.current !== pageIndex) {
          lastRenderedPageRef.current = pageIndex;
          frameRef.current?.scrollTo({ top: 0 });
        }
      } catch (err) {
        // 渲染被新任务取消属正常流转，静默放过
        if (err instanceof Error && err.name === "RenderingCancelledException") {
          return;
        }
        if (cancelled || seq !== renderSeqRef.current) return;
        setErrorText("PDF 页面渲染失败，文件可能已损坏");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      // 依赖变化/卸载时立即取消进行中的渲染，而非等新任务启动后再取消
      renderTaskRef.current?.cancel();
    };
  }, [phase, pageIndex, containerWidth, dpr]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragging.current = true;
    axisLocked.current = null;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || startX.current == null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - (startY.current ?? e.clientY);
    if (axisLocked.current == null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
    }
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || startX.current == null) return;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - (startY.current ?? e.clientY);
      const wasHorizontal = axisLocked.current === "h";
      dragging.current = false;
      startX.current = null;
      startY.current = null;
      axisLocked.current = null;

      // 横向滑动翻页（纵向已锁定给原生滚动）
      if (wasHorizontal && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0) onNext();
        else onPrev();
        return;
      }

      // 未构成滑动：按点击位置三分区（两侧翻页，中间唤出工具栏）
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const frame = frameRef.current;
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        if (ratio < 0.3) onPrev();
        else if (ratio > 0.7) onNext();
        else onToggleChrome();
      }
    },
    [onNext, onPrev, onToggleChrome],
  );

  if (phase === "loading") {
    return (
      <div
        role="status"
        className="flex h-full w-full flex-col items-center justify-center gap-3"
      >
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
        />
        <p className="text-sm text-[var(--text-muted)]">正在打开 PDF…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto p-6">
        <div
          role="alert"
          className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-8 text-center shadow-lg shadow-black/10"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]">
            <FileWarnIcon />
          </div>
          <p className="mt-4 text-base font-medium text-[var(--text)]">
            无法打开这份 PDF
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            {errorText ?? "PDF 加载失败"}
          </p>
          <Link
            to="/library"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] px-5 text-sm text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            返回书架
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={frameRef}
        // overflow-y-scroll（非 auto）：滚动条常驻，避免长页「出现滚动条→
        // 宽度变窄→重渲染→滚动条消失」的 fit-width 震荡循环
        className="h-full w-full touch-pan-y select-none overflow-y-scroll overflow-x-hidden overscroll-contain"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 版心：限宽居中，页面四周留呼吸空间 */}
        <div className="mx-auto w-full max-w-[52rem] px-3 py-4 sm:px-8 sm:py-8">
          <div ref={measureRef} className="w-full">
            {/* 页面容器：细边框 + 柔和阴影（纸页主题轻托感，夜间融入深底由 ring 提供页缘） */}
            <div className="mx-auto w-fit overflow-hidden rounded-md shadow-lg shadow-black/15 ring-1 ring-[var(--border)]">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
        </div>
      </div>

      {/* 首页渲染完成前的占位（文档已解析，正在画第一页） */}
      {!renderedOnce ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
        >
          <span
            aria-hidden
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]"
          />
          <p className="text-sm text-[var(--text-muted)]">正在打开 PDF…</p>
        </div>
      ) : null}
    </div>
  );
}

/** 按 pdf.js 异常类型给出可读的简体中文文案 */
function loadErrorText(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "PasswordException") {
    return "该 PDF 设有密码保护，暂不支持打开加密文件";
  }
  if (name === "InvalidPDFException") {
    return "文件已损坏或不是有效的 PDF";
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "PDF 加载失败，请稍后重试";
}

function FileWarnIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v4" />
      <path d="M12 18h.01" />
    </svg>
  );
}
