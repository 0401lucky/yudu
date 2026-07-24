import { useEffect, useRef } from "react";
import { postReadingTime } from "../lib/api";
import { localDateStr } from "../lib/readingStats";

/** 累计到该秒数即上报一次 */
const FLUSH_THRESHOLD_SECONDS = 60;

/**
 * 有效阅读计时（挂在阅读页，格式无关）：
 * 仅页面可见（visibilityState === 'visible'）时每秒累计；
 * 满 60s / 页面隐藏 / pagehide / 卸载时上报增量。
 * date 取 flush 当下的本地日期；上报失败静默丢弃，不重试不打断阅读。
 */
export function useReadingClock() {
  const pendingRef = useRef(0);

  useEffect(() => {
    const flush = () => {
      const seconds = pendingRef.current;
      pendingRef.current = 0;
      if (seconds <= 0) return;
      postReadingTime({ date: localDateStr(new Date()), seconds }).catch(() => {
        // 统计非关键数据：失败丢弃即可
      });
    };

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pendingRef.current += 1;
      if (pendingRef.current >= FLUSH_THRESHOLD_SECONDS) flush();
    }, 1000);

    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => {
      flush();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, []);
}
