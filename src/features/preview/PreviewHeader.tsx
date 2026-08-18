import type { JSX } from "solid-js";

interface PreviewHeaderProps {
  readonly fileName: string;
  readonly children: JSX.Element;
}

/** Renders the shared preview identity while preserving pane-specific details. */
export function PreviewHeader(props: PreviewHeaderProps): JSX.Element {
  return (
    <header class="pane__header">
      <span class="preview__header-identity">
        <span class="pane__title">Preview</span>
        <span class="preview__file-name" title={props.fileName}>
          {props.fileName}
        </span>
      </span>
      {props.children}
    </header>
  );
}
