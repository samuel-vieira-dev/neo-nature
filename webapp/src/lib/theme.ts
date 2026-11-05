"use client";

import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_KEY, resolveTheme, type Theme, type ThemePreference } from "@/lib/theme-script";

// Keeps <html data-theme> in sync after the inline head script: toggles, OS changes, other tabs.
const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");
let fallback: ThemePreference = "system"; // used when localStorage is blocked (private mode)

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : value === null ? fallback : "system";
  } catch {
    return fallback;
  }
}

/** Re-applies the stored theme (also after React re-creates the document on a hydration error). */
export function applyStoredTheme() {
  const theme = resolveTheme(readPreference(), media().matches);
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLORS[theme]));
  listeners.forEach((l) => l());
}
const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) applyStoredTheme(); };

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    media().addEventListener("change", applyStoredTheme);
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      media().removeEventListener("change", applyStoredTheme);
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function setThemePreference(preference: ThemePreference) {
  fallback = preference;
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage blocked: `fallback` keeps the choice for this page view.
  }
  applyStoredTheme();
}

const snapshot = () => `${readPreference()}:${document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"}`;

/** Current preference and the theme actually shown. The server render assumes system/light. */
export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [preference, theme] = value.split(":") as [ThemePreference, Theme];
  return { preference, theme, setPreference: setThemePreference };
}
