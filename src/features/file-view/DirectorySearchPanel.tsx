import {
  For,
  Show,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import {
  searchDirectory,
  type DirectorySearchKind,
  type DirectorySearchResult,
} from "../../lib/tauri/directory-search";
import type { DirectoryEntry } from "../../lib/tauri/document";

/** Explicit recursive search keeps result navigation separate from the directory cursor. */
export function DirectorySearchPanel(props: {
  readonly root: string;
  readonly kind: DirectorySearchKind;
  readonly hideGitIgnored: boolean;
  readonly initialQuery?: string;
  readonly onQueryChange?: (query: string) => void;
  readonly onClose: VoidFunction;
  readonly onOpen: (entry: DirectoryEntry) => void;
  readonly onReveal: (entry: DirectoryEntry) => void;
  readonly onPreview: (entry: DirectoryEntry) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [result, setResult] = createSignal<DirectorySearchResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [selected, setSelected] = createSignal(-1);
  let section: HTMLElement | undefined;
  let input: HTMLInputElement | undefined;
  let generation = 0;
  let inFlight: number | null = null;
  let mounted = true;
  const invalidate = (): void => {
    generation += 1;
    setResult(null);
    setError(null);
    setSelected(-1);
    setBusy(false);
  };
  createEffect(
    on(
      () => [props.root, props.kind, props.hideGitIgnored] as const,
      () => {
        invalidate();
        setQuery(props.initialQuery ?? "");
        queueMicrotask(() => {
          if (mounted) input?.focus();
        });
      },
    ),
  );
  onMount(() => input?.focus());
  onCleanup(() => {
    mounted = false;
    generation += 1;
  });
  const submit = async (): Promise<void> => {
    if (query().trim() === "" || inFlight === generation) return;
    if (result() !== null) {
      focusFirstResult();
      return;
    }
    invalidate();
    const request = generation;
    inFlight = request;
    setBusy(true);
    try {
      const next = await searchDirectory({
        path: props.root,
        query: query(),
        kind: props.kind,
        hideGitIgnored: props.hideGitIgnored,
      });
      if (mounted && request === generation) {
        setResult(next);
        queueMicrotask(() => {
          if (mounted && request === generation) focusFirstResult();
        });
      }
    } catch (cause: unknown) {
      if (mounted && request === generation) {
        input?.focus();
        setError(
          cause instanceof Error
            ? cause.message
            : typeof cause === "string"
              ? cause
              : "Directory search failed",
        );
      }
    } finally {
      if (inFlight === request) inFlight = null;
      if (mounted && request === generation) setBusy(false);
    }
  };
  const focusFirstResult = (): void => {
    const first = section?.querySelector<HTMLButtonElement>(
      ".directory-search__result",
    );
    (first ?? input)?.focus();
  };
  const move = (direction: -1 | 1): void => {
    const count = result()?.matches.length ?? 0;
    if (count === 0) return;
    const index =
      document.activeElement === input || selected() < 0
        ? direction === 1
          ? 0
          : count - 1
        : Math.max(0, Math.min(count - 1, selected() + direction));
    setSelected(index);
    section
      ?.querySelectorAll<HTMLButtonElement>(".directory-search__result")
      .item(index)
      ?.focus();
  };
  return (
    <section
      class="directory-search"
      aria-label={
        props.kind === "content" ? "Search file contents" : "Find files"
      }
      ref={(element) => {
        section = element;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.isComposing || event.metaKey || event.altKey) return;
        if (
          event.target === input &&
          !event.shiftKey &&
          ((!event.ctrlKey && event.key === "Enter") ||
            (event.ctrlKey && event.key.toLowerCase() === "m"))
        ) {
          event.preventDefault();
          void submit();
          return;
        }
        if (event.ctrlKey) return;
        const inResults =
          event.target instanceof Element &&
          event.target.closest(".directory-search__results") !== null;
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose();
        } else if (
          !event.shiftKey &&
          (event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            (inResults && (event.key === "j" || event.key === "k")))
        ) {
          event.preventDefault();
          move(event.key === "ArrowDown" || event.key === "j" ? 1 : -1);
        } else if (inResults && event.key === "l" && !event.shiftKey) {
          const match = result()?.matches[selected()];
          if (match !== undefined) {
            event.preventDefault();
            props.onReveal(match.entry);
          }
        }
      }}
    >
      <form
        class="directory-search__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          class="directory-search__input"
          type="search"
          aria-label={
            props.kind === "content"
              ? "Search file contents query"
              : "Find files query"
          }
          placeholder={
            props.kind === "content"
              ? "Literal text, case-sensitive..."
              : "Filename or relative path..."
          }
          value={query()}
          ref={(element) => {
            input = element;
          }}
          onInput={(event) => {
            invalidate();
            setQuery(event.currentTarget.value);
            props.onQueryChange?.(event.currentTarget.value);
          }}
        />
        <button
          type="submit"
          class="directory-search__submit"
          disabled={busy() || query().trim() === ""}
        >
          Search
        </button>
        <button
          type="button"
          class="directory-search__close"
          aria-label="Close directory search"
          onClick={props.onClose}
        >
          Close
        </button>
      </form>
      <p class="directory-search__summary">
        {props.kind === "content" ? "Search contents" : "Find filenames"} under{" "}
        {props.root}
      </p>
      <div class="directory-search__status" role="status" aria-live="polite">
        <Show when={busy()}>Searching...</Show>
        <Show when={!busy() && result() === null && error() === null}>
          Enter a query and press Enter or Ctrl+M to search and focus the first
          result.
        </Show>
        <Show when={result()}>
          {(value) => (
            <>
              {value().matches.length} matches; {value().scanned_files} files
              scanned.{" "}
              <Show when={value().truncated}>
                Partial results: search limit reached.{" "}
              </Show>
              <Show when={value().skipped_count > 0}>
                {value().skipped_count} entries skipped.
              </Show>
              <Show when={value().matches.length === 0}>
                {" "}
                No matches found.
              </Show>
            </>
          )}
        </Show>
      </div>
      <Show when={error()}>
        {(message) => (
          <p class="directory-search__status" role="alert">
            {message()}
          </p>
        )}
      </Show>
      <ul
        class="directory-search__results"
        aria-label="Directory search results"
        aria-busy={busy()}
      >
        <For each={result()?.matches ?? []}>
          {(match, index) => (
            <li class="directory-search__row">
              <button
                type="button"
                class="directory-search__result"
                aria-label={`${match.relative_path}${match.line_number === null ? "" : `, line ${match.line_number}`}`}
                aria-current={selected() === index() ? "true" : undefined}
                onFocus={() => {
                  setSelected(index());
                  props.onPreview(match.entry);
                }}
                onClick={() => props.onOpen(match.entry)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.isComposing &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    if (event.shiftKey) props.onReveal(match.entry);
                    else props.onOpen(match.entry);
                  }
                }}
              >
                <span class="directory-search__path">
                  {match.relative_path}
                  <Show when={match.line_number !== null}>
                    <span class="directory-search__line">
                      :{match.line_number}
                    </span>
                  </Show>
                </span>
                <Show when={match.line_text !== null}>
                  <span class="directory-search__snippet">
                    {match.line_text}
                  </span>
                </Show>
              </button>
              <button
                type="button"
                class="directory-search__jump"
                aria-label={`Show ${match.relative_path} in containing directory`}
                title="Show in containing directory (l; Shift+Enter)"
                onFocus={() => {
                  setSelected(index());
                  props.onPreview(match.entry);
                }}
                onClick={() => props.onReveal(match.entry)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.isComposing &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    props.onReveal(match.entry);
                  }
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 12h16m-6-6 6 6-6 6" />
                </svg>
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
