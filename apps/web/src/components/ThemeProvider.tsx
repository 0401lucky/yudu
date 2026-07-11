import type { UserPreferences } from "@yudu/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPreferences, putPreferences } from "../lib/api";
import { useAuth } from "../lib/auth";

interface ThemeContextValue {
  prefs: UserPreferences;
  loading: boolean;
  setPrefs: (partial: Partial<UserPreferences>) => Promise<void>;
  applyLocal: (partial: Partial<UserPreferences>) => void;
}

const defaultPrefs: UserPreferences = {
  theme: "night",
  fontSize: 18,
  lineHeight: 1.75,
  pageMargin: "normal",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyDomTheme(theme: UserPreferences["theme"]) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefsState] = useState<UserPreferences>(defaultPrefs);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setPrefsState(defaultPrefs);
      applyDomTheme("night");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPreferences()
      .then((p) => {
        if (cancelled) return;
        setPrefsState(p);
        applyDomTheme(p.theme);
      })
      .catch(() => {
        if (cancelled) return;
        applyDomTheme("night");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const applyLocal = useCallback((partial: Partial<UserPreferences>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...partial };
      if (partial.theme) applyDomTheme(partial.theme);
      return next;
    });
  }, []);

  const setPrefs = useCallback(async (partial: Partial<UserPreferences>) => {
    applyLocal(partial);
    const next = await putPreferences(partial);
    setPrefsState(next);
    applyDomTheme(next.theme);
  }, [applyLocal]);

  const value = useMemo(
    () => ({ prefs, loading, setPrefs, applyLocal }),
    [prefs, loading, setPrefs, applyLocal],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemePrefs(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemePrefs 须在 ThemeProvider 内使用");
  }
  return ctx;
}
