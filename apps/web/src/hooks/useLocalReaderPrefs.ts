import { useCallback, useEffect, useState } from "react";

/** 阅读页内的本地偏好——不走后端云同步，避免改 D1 迁移 */

export type FontFamilyId = "serif" | "sans";

/** 阅读模式：page=横向翻页；scroll=连续上下滚动 */
export type ReadingModeId = "page" | "scroll";

export interface LocalReaderPrefs {
  /** 字体族 */
  fontFamily: FontFamilyId;
  /** 屏幕亮度蒙层强度，0.4–1；1 = 不压暗 */
  brightness: number;
  /** 阅读模式，默认翻页（老用户体验不变） */
  readingMode: ReadingModeId;
}

const DEFAULTS: LocalReaderPrefs = {
  fontFamily: "serif",
  brightness: 1,
  readingMode: "page",
};

const KEY = "yudu.reader.local";

function read(): LocalReaderPrefs {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<LocalReaderPrefs>;
    return {
      fontFamily:
        parsed.fontFamily === "sans" || parsed.fontFamily === "serif"
          ? parsed.fontFamily
          : DEFAULTS.fontFamily,
      brightness:
        typeof parsed.brightness === "number" &&
        parsed.brightness >= 0.4 &&
        parsed.brightness <= 1
          ? parsed.brightness
          : DEFAULTS.brightness,
      readingMode:
        parsed.readingMode === "scroll" || parsed.readingMode === "page"
          ? parsed.readingMode
          : DEFAULTS.readingMode,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useLocalReaderPrefs() {
  const [prefs, setPrefsState] = useState<LocalReaderPrefs>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // 隐私模式等写入失败时静默
    }
  }, [prefs]);

  const setLocalPrefs = useCallback((partial: Partial<LocalReaderPrefs>) => {
    setPrefsState((prev) => ({ ...prev, ...partial }));
  }, []);

  return { localPrefs: prefs, setLocalPrefs };
}
