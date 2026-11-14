import { For, Show } from "solid-js";

interface TocPaneProps {
  readonly items: readonly TocItem[];
  readonly visible: boolean;
  readonly activeAnchorId: string | null;
  readonly emptyLabel?: string;
  readonly summaryLabel?: string;
  readonly onSelectItem: (item: TocItem) => void;
}

export interface TocItem {
  readonly title: string;
  readonly anchorId: string | null;
  readonly children: readonly TocItem[];
  readonly metaLabel?: string;
}

interface TocBranchProps {
  readonly items: readonly TocItem[];
  readonly activeAnchorId: string | null;
  readonly onSelectItem: (item: TocItem) => void;
}

function TocBranch(props: TocBranchProps) {
  return (
    <ul class="toc__list">
      <For each={props.items}>
        {(item) => (
          <li>
            <button
              class={`toc__button${
                props.activeAnchorId === item.anchorId && item.anchorId !== null
                  ? " toc__button--active"
                  : ""
              }`}
              type="button"
              disabled={item.anchorId === null}
              onClick={() => props.onSelectItem(item)}
            >
              {item.title}
              <Show when={item.metaLabel !== undefined}>
                <span class="toc__meta">{item.metaLabel}</span>
              </Show>
            </button>
            <Show when={item.children.length > 0}>
              <div class="toc__children">
                <TocBranch
                  activeAnchorId={props.activeAnchorId}
                  items={item.children}
                  onSelectItem={props.onSelectItem}
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
        <span>{props.summaryLabel ?? `${props.items.length} items`}</span>
      </header>
      <div class="pane__body toc">
        <Show
          when={props.items.length > 0}
          fallback={
            <div class="empty">{props.emptyLabel ?? "No items found."}</div>
          }
        >
          <TocBranch
            activeAnchorId={props.activeAnchorId}
            items={props.items}
            onSelectItem={props.onSelectItem}
          />
        </Show>
      </div>
    </section>
  );
}
