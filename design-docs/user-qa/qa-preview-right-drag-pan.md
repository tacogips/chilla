# Preview Right-Drag Pan Questions

These questions relate to the "Shared Preview Pan And Zoom Gestures" section
of `design-docs/specs/architecture.md` (formerly "Shared Preview Right-Drag
Pan"). Middle-button drag pans with the same momentum and does not depend on
the context menu, so it stays available on macOS and Linux whatever is decided
here. They do not block implementation. The
default planning assumption below applies unless the user decides otherwise.

## Questions

1. On macOS WebKit (the Tauri WKWebView) and on WebKitGTK, the `contextmenu`
   event normally fires at right-button press, before any movement. Under the
   requested rule (suppress the menu only after the pointer moved more than
   about 4px), a press there can open the native menu before a pan can start.
   If the supervising GUI check confirms this, which behavior should chilla
   use on those platforms?
   - Option A: keep the requested rule. A plain right-click keeps the native
     menu everywhere. Right-drag pan may not work on macOS and Linux.
   - Option B: inside the preview targets only, suppress `contextmenu` at press
     on macOS and Linux. Right-drag pan works, but the native menu (for example
     Reload or Inspect Element) is no longer available over previews on those
     platforms.
   - Option C: keep Option A and add a modifier or a different trigger for
     panning on macOS and Linux.

## Decision (resolved, session-718)

- The supervising GUI check on the macOS debug app (PDF preview, CGEvent
  right-drag) confirmed that Option A (commit 30f411a) opens the native menu
  and does not pan.
- The user chose a variant of Option B, following the nodetto-cloud
  native-menu guard: on preview pan targets, `contextmenu` is prevented at
  event time on every platform (no macOS/Linux-only branch), except when the
  window has a non-empty text selection or the target is inside `input`,
  `textarea` or a non-`false` `[contenteditable]`. A plain right-click over a
  preview therefore no longer shows Reload or Inspect Element. See
  "Pan Gesture Contract" and "Platform Event Order" in
  `design-docs/specs/architecture.md`.
- Follow-up (macOS GUI re-check of 77c1236): the selection exemption now uses
  the selection state recorded at right-button press time, because WebKit
  selects the word under the pointer before `contextmenu`. Only a selection
  that existed before the press keeps the native menu. This refines the
  decision above and opens no new question.
- Option C is not pursued. No open question remains for this topic.
