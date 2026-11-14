import {
  For,
  Show,
  createContext,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
} from "solid-js";
import { getKeymapConfig } from "../../lib/tauri/keymap";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import {
  compileKeymap,
  eventKey,
  matchingBindings,
  reachableBindings,
  type EffectiveKeymap,
  type KeymapAction,
  type KeymapBinding,
  type KeymapContext,
} from "./keymap";

export type KeymapActions = Partial<
  Record<KeymapAction, (event: KeyboardEvent) => unknown>
>;
interface Scope {
  readonly context: KeymapContext;
  readonly enabled: Accessor<boolean>;
  readonly identity: Accessor<unknown>;
  readonly accepts: (event: KeyboardEvent, action: KeymapAction) => boolean;
  readonly actions: KeymapActions;
}
interface Pending {
  readonly keys: readonly string[];
  readonly bindings: readonly KeymapBinding[];
  readonly scope: Scope;
  readonly origin: EventTarget | null;
}

export function createKeymapController(loadConfig = true) {
  const [keymap, setKeymap] = createSignal<EffectiveKeymap>(compileKeymap({}));
  const [warning, setWarning] = createSignal<string | null>(null, {
    equals: false,
  });
  const [pending, setPending] = createSignal<Pending | null>(null);
  const scopes: Scope[] = [];
  let disposed = false;
  const cancel = (): void => {
    setPending(null);
  };
  const register = (scope: Scope): void => {
    scopes.push(scope);
    createEffect(
      on(
        () => [scope.enabled(), scope.identity()] as const,
        () => {
          if (pending()?.scope === scope) cancel();
        },
      ),
    );
    onCleanup(() => {
      const index = scopes.indexOf(scope);
      if (index >= 0) scopes.splice(index, 1);
      if (pending()?.scope === scope) cancel();
    });
  };
  const apply = (
    binding: KeymapBinding,
    scope: Scope,
    event: KeyboardEvent,
  ): void => {
    const run = async (): Promise<void> => {
      for (const action of binding.actions) {
        if (disposed) return;
        if (action !== "noop") await scope.actions[action]?.(event);
      }
    };
    void run().catch(() => {
      if (!disposed)
        setWarning("A configured keyboard action could not complete.");
    });
  };
  const consume = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const dispatch = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    if (
      event.target instanceof Element &&
      event.target.closest(".workspace-notification, .pr-diff-retry")
    ) {
      cancel();
      return;
    }
    if (event.isComposing) {
      cancel();
      return;
    }
    let key: string | null;
    try {
      key = eventKey(event);
    } catch {
      cancel();
      return;
    }
    if (key === null) {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) cancel();
      return;
    }
    const editable =
      isEditableKeyboardTarget(event.target) ||
      (event.target instanceof Element &&
        event.target.closest(".directory-search") !== null);
    const modal =
      event.target instanceof Element &&
      event.target.closest('[role="dialog"]') !== null;
    if (modal) {
      cancel();
      return;
    }
    const current = pending();
    if (event.repeat && current !== null) return;
    if (current !== null) {
      if (
        !current.scope.enabled() ||
        (editable && current.scope.context !== "workspace")
      )
        cancel();
      else {
        if (key === "<Esc>") {
          consume(event);
          cancel();
          return;
        }
        const keys = [...current.keys, key];
        const matches = matchingBindings(current.bindings, keys);
        const first = matches[0];
        if (first === undefined) {
          cancel();
          if (!event.ctrlKey && !event.metaKey && !event.altKey) {
            consume(event);
            return;
          }
        } else {
          consume(event);
          if (first.keys.length === keys.length) {
            cancel();
            apply(first, current.scope, event);
          } else setPending({ ...current, keys, bindings: matches });
          return;
        }
      }
    }
    for (const scope of [...scopes].sort(
      (left, right) =>
        Number(left.context === "workspace") -
        Number(right.context === "workspace"),
    )) {
      if (!scope.enabled()) continue;
      const bindings = keymap()[scope.context].filter(
        (binding) =>
          binding.actions.every((action) => scope.accepts(event, action)) &&
          (!editable ||
            (scope.context === "workspace" &&
              (event.ctrlKey || event.metaKey) &&
              binding.actions.every((action) =>
                ["files.open", "document.save", "noop"].includes(action),
              ))),
      );
      const matches = matchingBindings(bindings, [key]);
      const first = matches[0];
      if (first === undefined) continue;
      if (
        event.repeat &&
        (first.keys.length !== 1 ||
          !first.actions.every((action) =>
            [
              "cursor.up",
              "cursor.down",
              "scroll.up",
              "scroll.down",
              "document.previous",
              "document.next",
            ].includes(action),
          ))
      )
        return;
      consume(event);
      if (first.keys.length === 1) apply(first, scope, event);
      else
        setPending({
          keys: [key],
          bindings: matches,
          scope,
          origin: event.target,
        });
      return;
    }
  };
  onMount(() => {
    const focus = (event: FocusEvent): void => {
      if (pending() !== null && event.target !== pending()?.origin) cancel();
    };
    window.addEventListener("keydown", dispatch, true);
    window.addEventListener("focusin", focus);
    window.addEventListener("blur", cancel);
    window.addEventListener("compositionstart", cancel);
    if (loadConfig)
      void getKeymapConfig()
        .then((response) => {
          if (disposed) return;
          if (response.error !== null) {
            setWarning(response.error);
            return;
          }
          const compiled = compileKeymap(response.config);
          cancel();
          setKeymap(compiled);
        })
        .catch(() => {
          if (!disposed) {
            cancel();
            setKeymap(compileKeymap({}));
            setWarning(
              "Keymap configuration could not be loaded or contains unsupported keys/actions. Using default shortcuts. Restart after correcting keymap.toml.",
            );
          }
        });
    onCleanup(() => {
      disposed = true;
      window.removeEventListener("keydown", dispatch, true);
      window.removeEventListener("focusin", focus);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("compositionstart", cancel);
    });
  });
  return { register, keymap, warning, pending, cancel };
}
export type KeymapController = ReturnType<typeof createKeymapController>;
export const KeymapContextProvider = createContext<KeymapController>();
export function useKeymapController(): {
  readonly controller: KeymapController;
  readonly standalone: boolean;
} {
  const shared = useContext(KeymapContextProvider);
  return shared === undefined
    ? { controller: createKeymapController(false), standalone: true }
    : { controller: shared, standalone: false };
}
export function KeymapPopup(props: { readonly controller: KeymapController }) {
  return (
    <Show when={props.controller.pending()}>
      {(state) => (
        <section
          class="file-browser__sequence-popup keymap-popup"
          aria-label={
            state().keys[0] === ","
              ? "Sort shortcuts"
              : "Keybinding continuations"
          }
        >
          <p class="file-browser__sequence-title" role="status">
            {state().keys.join(" then ")}: choose the next key
          </p>
          <dl class="file-browser__sequence-options">
            <For each={reachableBindings(state().bindings, state().keys)}>
              {(binding) => (
                <div class="file-browser__sequence-option">
                  <dt class="file-browser__sequence-key">
                    <kbd>
                      {binding.keys.slice(state().keys.length).join(" then ")}
                    </kbd>
                  </dt>
                  <dd class="file-browser__sequence-action">
                    {binding.description}
                  </dd>
                </div>
              )}
            </For>
          </dl>
          <p class="file-browser__sequence-hint">Escape cancels</p>
        </section>
      )}
    </Show>
  );
}
