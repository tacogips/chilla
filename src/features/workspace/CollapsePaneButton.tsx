import type { JSX } from "solid-js";

interface CollapsePaneButtonProps {
  /** Folds the left pane; the left-edge strip expands it again. */
  readonly onCollapse: () => void;
}

/** Mouse control in a left pane header that folds the pane. */
export function CollapsePaneButton(
  props: CollapsePaneButtonProps,
): JSX.Element {
  return (
    <button
      type="button"
      class="pane__collapse"
      aria-label="Collapse left pane"
      title="Collapse left pane"
      onClick={() => props.onCollapse()}
    >
      ‹
    </button>
  );
}
