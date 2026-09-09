/** Compact browser toolbar icons share the existing glyph dimensions. */
export function BrowserContentSearchGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 3h8M2 6h5M2 9h3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
      />
      <circle
        cx="9.5"
        cy="9"
        r="3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
      />
      <path d="m12 11.5 2.5 2.5" stroke="currentColor" stroke-width="1.25" />
    </svg>
  );
}

export function BrowserFileSearchGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M7 14H3V2h6l3 3v2M9 2v3h3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
      <circle
        cx="10"
        cy="10.5"
        r="2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
      />
      <path d="m12 12.5 2 2" stroke="currentColor" stroke-width="1.25" />
    </svg>
  );
}

export function BrowserListGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M5 4h9M5 8h9M5 12h9"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
      />
      <path
        d="M2 4h.01M2 8h.01M2 12h.01"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function BrowserTreeGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 3v9h4M3 7h4M7 5h6v4H7zM7 10h6v4H7z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function BrowserFilterGlyph() {
  return (
    <svg class="file-browser__glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 3h12L9 8.5V13l-2-1V8.5z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linejoin="round"
      />
    </svg>
  );
}
