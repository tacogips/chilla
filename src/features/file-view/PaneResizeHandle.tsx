import { onCleanup } from "solid-js";
import { computeDraggedPaneWidthPx, type PaneWidthBounds } from "./paneResize";

export interface PaneResizeHandleProps {
  /** Resize bounds for the pane, recomputed at the start of each drag. */
  readonly getBounds: () => PaneWidthBounds;
  /** Called with the next pane width (px) while dragging. */
  readonly onResize: (widthPx: number) => void;
  /** Called once the drag ends (pointer up or cancel). */
  readonly onResizeEnd?: (() => void) | undefined;
  /** Accessible label for the separator. Defaults to "Resize pane". */
  readonly label?: string | undefined;
}

/**
 * Vertical drag handle meant to be rendered as the last child of a
 * `position: relative` pane. It measures the pane's current rendered width
 * from its own parent element, so the host does not need to track that width
 * separately.
 */
export function PaneResizeHandle(props: PaneResizeHandleProps) {
  let handleEl: HTMLDivElement | undefined;
  let startClientX = 0;
  let startWidthPx = 0;
  let activePointerId: number | null = null;

  const stopDragging = (pointerId: number): void => {
    activePointerId = null;
    if (handleEl?.hasPointerCapture(pointerId) === true) {
      handleEl.releasePointerCapture(pointerId);
    }
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (handleEl === undefined || event.button !== 0) {
      return;
    }

    const paneEl = handleEl.parentElement;
    if (paneEl === null) {
      return;
    }

    event.preventDefault();
    startClientX = event.clientX;
    startWidthPx = paneEl.getBoundingClientRect().width;
    activePointerId = event.pointerId;
    handleEl.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    props.onResize(
      computeDraggedPaneWidthPx(
        startWidthPx,
        startClientX,
        event.clientX,
        props.getBounds(),
      ),
    );
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    stopDragging(event.pointerId);
    props.onResizeEnd?.();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (activePointerId === null || event.pointerId !== activePointerId) {
      return;
    }

    stopDragging(event.pointerId);
    props.onResizeEnd?.();
  };

  onCleanup(() => {
    if (activePointerId !== null) {
      stopDragging(activePointerId);
    }
  });

  return (
    <div
      ref={(element) => {
        handleEl = element;
      }}
      class="pane-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label ?? "Resize pane"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}
