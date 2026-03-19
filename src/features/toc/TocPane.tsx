import { For, Show } from "solid-js";
import type { HeadingNode } from "../../lib/tauri/document";

interface TocPaneProps {
  readonly headings: readonly HeadingNode[];
  readonly visible: boolean;
  readonly activeAnchorId: string | null;
  readonly onSelectHeading: (heading: HeadingNode) => void;
}

interface HeadingBranchProps {
  readonly headings: readonly HeadingNode[];
  readonly activeAnchorId: string | null;
  readonly onSelectHeading: (heading: HeadingNode) => void;
}

function HeadingBranch(props: HeadingBranchProps) {
  return (
    <ul class="toc__list">
      <For each={props.headings}>
        {(heading) => (
          <li>
            <button
              class={`toc__button${
                props.activeAnchorId === heading.anchor_id
                  ? " toc__button--active"
                  : ""
              }`}
              type="button"
              onClick={() => props.onSelectHeading(heading)}
            >
              {heading.title}
              <span class="toc__meta">L{heading.line_start}</span>
            </button>
            <Show when={heading.children.length > 0}>
              <div class="toc__children">
                <HeadingBranch
                  activeAnchorId={props.activeAnchorId}
                  headings={heading.children}
                  onSelectHeading={props.onSelectHeading}
                />
              </div>
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}

export function TocPane(props: TocPaneProps) {
  return (
    <section class={`pane${props.visible ? "" : " pane--hidden"}`}>
      <header class="pane__header">
        <span class="pane__title">Table of Contents</span>
        <span>{props.headings.length} headings</span>
      </header>
      <div class="pane__body toc">
        <Show
          when={props.headings.length > 0}
          fallback={<div class="empty">No headings found.</div>}
        >
          <HeadingBranch
            activeAnchorId={props.activeAnchorId}
            headings={props.headings}
            onSelectHeading={props.onSelectHeading}
          />
        </Show>
      </div>
    </section>
  );
}
