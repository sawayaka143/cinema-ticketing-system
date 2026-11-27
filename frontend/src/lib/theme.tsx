import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

export type ColorMode = "light" | "dark";

const STORAGE_KEY = "color-mode";

export function readColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // storage blocked
  }
  return "light";
}

export function applyColorMode(mode: ColorMode) {
  document.documentElement.dataset.colorMode = mode;
}

type ThemeContextValue = {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(readColorMode);

  useEffect(() => {
    applyColorMode(mode);
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    applyColorMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
