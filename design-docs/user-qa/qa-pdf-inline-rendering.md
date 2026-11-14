# In-App PDF Rendering And Modifier-Wheel Zoom Questions

These questions relate to `design-docs/specs/design-pdf-inline-rendering.md`.
None of them blocks implementation. The default planning assumptions below apply
unless the user decides otherwise.

## Questions

1. The request names `MediaFilePreviewPane.tsx` as the "media/image" target.
   Direct images are rendered by `PreviewPane`, which already has a zoom
   signal. `MediaFilePreviewPane` renders only video and audio, and before this
   change neither had a zoom feature. Should video gain `+`/`-` and
   modifier-wheel zoom, or should only Alt+wheel on images (through
   `PreviewPane`) be in scope?
2. Should PDFs keep a text layer (text selection and copy) and working in-PDF
   links? The original iframe viewer supported both.
3. Should very large PDFs render pages lazily (only near the viewport) instead
   of rendering every page eagerly?

## Default Planning Assumptions

- Video gains a pane-local zoom (50-300%) that responds to `+`/`-` and to
  Alt/Ctrl+wheel. Audio is not a zoom target. On a video preview, `+`/`-` did
  nothing before this change, so the new behavior does not alter any existing
  shortcut.
- PDF pages are rendered to canvas only, with no text layer and no link layer.
- All pages render eagerly, with render-task cancellation on zoom or reload.
