import { getCurrentWindow } from "@tauri-apps/api/window";

export function resolveCurrentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}
