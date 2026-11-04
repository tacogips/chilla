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

## Default Planning Assumption

- Option A, the rule as requested, is implemented and verified with vitest in
  this run. The real-app result on macOS is a GUI check delegated to the
  supervising session. A switch to Option B or C is follow-up work and needs a
  user decision.
