import type { DocumentSnapshot } from "../../lib/tauri/document";

export type MarkdownDocumentRefreshDecision =
  | { readonly kind: "ignore" }
  | { readonly kind: "apply"; readonly snapshot: DocumentSnapshot }
  | { readonly kind: "conflict"; readonly snapshot: DocumentSnapshot };

/**
 * `reload_document` refreshes snapshots for preview HTML / presentation. Skip when the
 * buffer has diverged so theme toggles cannot clobber unpersisted edits.
 */
export function canReloadMarkdownSnapshotForPresentationRefresh(
  doc: DocumentSnapshot | null,
  editorBuffer: string,
): boolean {
  return doc !== null && editorBuffer === doc.source_text;
}

/**
 * When `document_refreshed` delivers a new disk snapshot for a path, either
 * adopt it (clean buffer), surface explicit conflict (dirty buffer), or ignore
 * (event targets a different open document).
 */
export function decideMarkdownDocumentRefresh(
  current: DocumentSnapshot | null,
  editorBuffer: string,
  refreshed: DocumentSnapshot,
): MarkdownDocumentRefreshDecision {
  if (current === null || current.path !== refreshed.path) {
    return { kind: "ignore" };
  }

  if (editorBuffer !== current.source_text) {
    return { kind: "conflict", snapshot: refreshed };
  }

  return { kind: "apply", snapshot: refreshed };
}
