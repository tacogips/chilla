import type { DocumentSnapshot } from "../../lib/tauri/document";

export interface WorkspaceViewState {
  readonly isDirty: boolean;
  readonly isPreviewOpen: boolean;
  readonly isTocOpen: boolean;
  readonly activeSnapshot: DocumentSnapshot | null;
  readonly conflictSnapshot: DocumentSnapshot | null;
}

export interface WorkspaceSelection {
  readonly anchorId: string | null;
  readonly lineStart: number | null;
}

export function lineStartToOffset(
  sourceText: string,
  lineStart: number | null,
): number {
  if (lineStart === null || lineStart <= 1) {
    return 0;
  }

  let currentLine = 1;

  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === "\n") {
      currentLine += 1;

      if (currentLine === lineStart) {
        return index + 1;
      }
    }
  }

  return sourceText.length;
}
