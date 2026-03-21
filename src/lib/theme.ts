import { invoke } from "@tauri-apps/api/core";

export type ColorScheme = "light" | "dark";

const STORAGE_KEY = "marky-color-scheme";

function isColorScheme(value: string | null): value is ColorScheme {
  return value === "light" || value === "dark";
}

/** Read stored preference (default: dark). */
export function getColorScheme(): ColorScheme {
  if (typeof localStorage === "undefined") {
    return "dark";
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  return isColorScheme(stored) ? stored : "dark";
}

/** Apply to `<html>`, persist, and sync syntect theme in the Tauri backend. */
export async function applyColorScheme(scheme: ColorScheme): Promise<void> {
  document.documentElement.setAttribute("data-theme", scheme);

  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    // Private mode or blocked storage
  }

  try {
    await invoke("set_syntax_ui_theme", { scheme });
  } catch {
    // Not running inside Tauri (e.g. Vite in browser)
  }
}

/** Call before first paint so CSS variables match storage. */
export function initColorScheme(): ColorScheme {
  const scheme = getColorScheme();
  document.documentElement.setAttribute("data-theme", scheme);
  return scheme;
}

/** Align backend syntect theme with `localStorage` (call once after init in Tauri). */
export async function syncSyntaxUiThemeToBackend(): Promise<void> {
  try {
    await invoke("set_syntax_ui_theme", { scheme: getColorScheme() });
  } catch {
    // Not running inside Tauri
  }
}
