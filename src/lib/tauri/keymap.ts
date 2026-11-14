import { invoke } from "@tauri-apps/api/core";

export interface KeymapBindingInput {
  readonly on: string | readonly string[];
  readonly run: string | readonly string[];
  readonly desc?: string;
}
export interface KeymapSectionInput {
  readonly prepend_keymap?: readonly KeymapBindingInput[];
  readonly keymap?: readonly KeymapBindingInput[];
  readonly append_keymap?: readonly KeymapBindingInput[];
}
export interface KeymapConfigInput {
  readonly mgr?: KeymapSectionInput;
  readonly workspace?: KeymapSectionInput;
}
export interface KeymapConfigResponse {
  readonly path: string | null;
  readonly config: KeymapConfigInput;
  readonly error: string | null;
}
export function getKeymapConfig(): Promise<KeymapConfigResponse> {
  return invoke<KeymapConfigResponse>("get_keymap_config");
}
