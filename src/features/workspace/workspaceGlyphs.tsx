import type { ParentProps } from "solid-js";

export function SunGlyph() {
  return (
    <svg class="workspace__theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="4"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M6.35 17.65l-1.41 1.41M19.07 4.93l-1.41 1.41"
      />
    </svg>
  );
}

export function MoonGlyph() {
  return (
    <svg class="workspace__theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  );
}

function WorkspaceHeaderIcon(props: ParentProps<{ readonly class?: string }>) {
  return (
    <svg
      class={props.class ?? "workspace__header-action-icon"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export function RawSourceGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M16 18l6-6-6-6M8 6l-6 6 6 6"
      />
    </WorkspaceHeaderIcon>
  );
}

export function PreviewGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </WorkspaceHeaderIcon>
  );
}

export function TocGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
      />
    </WorkspaceHeaderIcon>
  );
}

export function ReloadGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
      />
    </WorkspaceHeaderIcon>
  );
}

export function MinimizeWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
        d="M5 12h14"
      />
    </WorkspaceHeaderIcon>
  );
}

export function MaximizeWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />
    </WorkspaceHeaderIcon>
  );
}

export function CloseWindowGlyph() {
  return (
    <WorkspaceHeaderIcon>
      <path
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M18 6L6 18M6 6l12 12"
      />
    </WorkspaceHeaderIcon>
  );
}
