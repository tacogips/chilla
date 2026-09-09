import { invoke } from "@tauri-apps/api/core";
import type { DirectoryEntry } from "./document";

export type DirectorySearchKind = "name" | "content";
export interface DirectorySearchMatch {
  readonly entry: DirectoryEntry;
  readonly relative_path: string;
  readonly line_number: number | null;
  readonly line_text: string | null;
}
export interface DirectorySearchResult {
  readonly root_path: string;
  readonly matches: readonly DirectorySearchMatch[];
  readonly truncated: boolean;
  readonly skipped_count: number;
  readonly scanned_files: number;
}

/** Requests an explicitly submitted recursive search rooted at the browser directory. */
export function searchDirectory(input: {
  readonly path: string;
  readonly query: string;
  readonly kind: DirectorySearchKind;
  readonly hideGitIgnored: boolean;
}): Promise<DirectorySearchResult> {
  return invoke<DirectorySearchResult>("search_directory", { input });
}
