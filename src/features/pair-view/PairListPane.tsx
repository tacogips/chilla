import { For, Show, createEffect, on, type JSX } from "solid-js";
import type { FilePairPaths } from "../../lib/tauri/document";
import { KeymapPopup, useKeymapController } from "../keymap/KeymapProvider";
import { CollapsePaneButton } from "../workspace/CollapsePaneButton";
import "./PairListPane.css";

export interface PairListPaneProps {
  readonly pairs: readonly FilePairPaths[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onCollapse: () => void;
}

/** A controlled, command-line-ordered list of comparison pairs. */
export function PairListPane(props: PairListPaneProps): JSX.Element {
  const { controller, standalone } = useKeymapController();
  let section: HTMLElement | undefined;
  const move = (delta: number): void => {
    const next = props.selectedIndex + delta;
    if (next >= 0 && next < props.pairs.length) props.onSelect(next);
  };
  controller.register({
    context: "file",
    enabled: () => true,
    identity: () => "pair-list",
    accepts: (_event, action) =>
      ["cursor.down", "cursor.up", "open", "enter"].includes(action),
    actions: {
      "cursor.down": () => move(1),
      "cursor.up": () => move(-1),
      open: () => props.onSelect(props.selectedIndex),
      enter: () => props.onSelect(props.selectedIndex),
    },
  });
  createEffect(
    on(
      () => props.selectedIndex,
      (index) => {
        if (!section?.contains(document.activeElement)) return;
        const button = section.querySelector<HTMLButtonElement>(
          `[data-pair-index="${index}"]`,
        );
        button?.focus({ preventScroll: true });
        button?.scrollIntoView?.({ block: "nearest" });
      },
    ),
  );
  const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;
  return (
    <section class="pane pair-list" aria-label="Comparison pairs" ref={section}>
      <header class="pane__header">
        <span class="pane__header-lead">
          <CollapsePaneButton onCollapse={props.onCollapse} />
          <span class="pane__title">Pairs</span>
        </span>
        <span>
          {props.pairs.length} {props.pairs.length === 1 ? "pair" : "pairs"}
        </span>
      </header>
      <div class="pane__body">
        <Show when={standalone}>
          <KeymapPopup controller={controller} />
        </Show>
        <ul
          {...{ role: "listbox" }}
          aria-label="Comparison pairs"
          class="pair-list__items"
        >
          <For each={props.pairs}>
            {(pair, index) => (
              <li>
                <button
                  type="button"
                  role="option"
                  class="pair-list__button"
                  classList={{
                    "pair-list__button--selected":
                      index() === props.selectedIndex,
                  }}
                  data-pair-index={index()}
                  title={`${pair.left_file_path} <-> ${pair.right_file_path}`}
                  aria-selected={index() === props.selectedIndex}
                  tabIndex={index() === props.selectedIndex ? 0 : -1}
                  onClick={() => props.onSelect(index())}
                >
                  {basename(pair.left_file_path)} &lt;-&gt;{" "}
                  {basename(pair.right_file_path)}
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}
