import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type RevisionToken = string;

export interface HeadingNode {
  readonly level: number;
  readonly title: string;
  readonly anchor_id: string;
  readonly line_start: number;
  readonly children: readonly HeadingNode[];
}

export interface DocumentSnapshot {
  readonly path: string;
  readonly file_name: string;
  readonly source_text: string;
  readonly html: string;
  readonly headings: readonly HeadingNode[];
  readonly revision_token: RevisionToken;
  readonly last_modified: string;
}

export const DOCUMENT_REFRESHED_EVENT = "document_refreshed";
export const DOCUMENT_CONFLICT_EVENT = "document_conflict";

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Tauri error";
}

export async function getStartupDocumentPath(): Promise<string> {
  return invoke<string>("get_startup_document_path");
}

export async function openDocument(path: string): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("open_document", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function saveDocument(
  path: string,
  sourceText: string,
): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("save_document", {
      path,
      sourceText,
    });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function reloadDocument(path: string): Promise<DocumentSnapshot> {
  try {
    return await invoke<DocumentSnapshot>("reload_document", { path });
  } catch (error: unknown) {
    throw new Error(toErrorMessage(error));
  }
}

export async function listenDocumentRefreshed(
  onRefresh: (snapshot: DocumentSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<DocumentSnapshot>(DOCUMENT_REFRESHED_EVENT, (event) => {
    onRefresh(event.payload);
  });
}
