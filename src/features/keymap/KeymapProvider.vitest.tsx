import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getKeymapConfig,
  type KeymapConfigInput,
  type KeymapConfigResponse,
} from "../../lib/tauri/keymap";
import {
  createKeymapController,
  KeymapPopup,
  type KeymapController,
} from "./KeymapProvider";

vi.mock("../../lib/tauri/keymap", () => ({ getKeymapConfig: vi.fn() }));
let dispose: VoidFunction | undefined;
const response = (config: KeymapConfigInput = {}): KeymapConfigResponse => ({
  path: "keymap.toml",
  config,
  error: null,
});
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
beforeEach(() => {
  vi.mocked(getKeymapConfig).mockResolvedValue(response());
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.resetAllMocks();
});

function setup() {
  const container = document.createElement("div");
  document.body.append(container);
  const [enabled, setEnabled] = createSignal(true);
  const [identity, setIdentity] = createSignal("directory-one");
  const actions = {
    filter: vi.fn(),
    "search.name": vi.fn(),
    "search.content": vi.fn(),
    "view.toggle": vi.fn(),
    "cursor.down": vi.fn(),
    "sort.size.asc": vi.fn(),
  };
  const workspace = {
    "document.save": vi.fn(),
    "files.open": vi.fn(),
    "git.toggle": vi.fn(),
    "theme.toggle": vi.fn(),
    "scroll.down": vi.fn(),
  };
  let controller: KeymapController | undefined;
  dispose = render(() => {
    controller = createKeymapController();
    controller.register({
      context: "file",
      enabled,
      identity,
      accepts: () => true,
      actions,
    });
    controller.register({
      context: "workspace",
      enabled: () => true,
      identity: () => "workspace",
      accepts: () => true,
      actions: workspace,
    });
    return (
      <>
        <button type="button">Browser target</button>
        <input aria-label="Editor" />
        <KeymapPopup controller={controller} />
      </>
    );
  }, container);
  if (controller === undefined) throw new Error("Controller did not mount");
  const button = container.querySelector("button");
  const input = container.querySelector("input");
  if (button === null || input === null)
    throw new Error("Missing keyboard targets");
  button.focus();
  const press = (
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = button,
  ): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  };
  return {
    controller,
    container,
    button,
    input,
    press,
    actions,
    workspace,
    setEnabled,
    setIdentity,
  };
}

describe("keymap controller", () => {
  it("keeps search independent from theme with and without an active browser", async () => {
    const test = setup();
    await settle();
    test.press("s");
    test.press("S", { shiftKey: true });
    expect(test.actions["search.name"]).toHaveBeenCalledOnce();
    expect(test.actions["search.content"]).toHaveBeenCalledOnce();
    expect(test.workspace["theme.toggle"]).not.toHaveBeenCalled();
    expect(test.press("D", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(test.workspace["theme.toggle"]).toHaveBeenCalledOnce();
    expect(test.workspace["scroll.down"]).not.toHaveBeenCalled();
    test.press("d", { ctrlKey: true });
    expect(test.workspace["scroll.down"]).toHaveBeenCalledOnce();
    expect(test.workspace["theme.toggle"]).toHaveBeenCalledOnce();
    expect(test.actions["search.content"]).toHaveBeenCalledOnce();

    test.setEnabled(false);
    expect(test.press("S", { shiftKey: true }).defaultPrevented).toBe(false);
    test.press("D", { shiftKey: true });
    expect(test.workspace["theme.toggle"]).toHaveBeenCalledTimes(2);
    test.input.focus();
    expect(
      test.press("D", { shiftKey: true }, test.input).defaultPrevented,
    ).toBe(false);
    expect(test.workspace["theme.toggle"]).toHaveBeenCalledTimes(2);
  });

  it("dispatches configured search shortcuts from results while leaving result navigation and typing alone", async () => {
    vi.mocked(getKeymapConfig).mockResolvedValue(
      response({
        mgr: {
          keymap: [
            { on: "f", run: "search.name" },
            { on: ["g", "s"], run: "search.content" },
          ],
        },
      }),
    );
    const test = setup();
    await settle();
    test.container.classList.add("directory-search");
    expect(test.press("s").defaultPrevented).toBe(false);
    expect(test.press("Enter").defaultPrevented).toBe(false);
    expect(test.press("j").defaultPrevented).toBe(false);
    expect(test.press("f").defaultPrevented).toBe(true);
    expect(test.actions["search.name"]).toHaveBeenCalledOnce();
    test.press("g");
    test.press("s");
    expect(test.actions["search.content"]).toHaveBeenCalledOnce();
    test.input.focus();
    expect(test.press("f", {}, test.input).defaultPrevented).toBe(false);
    expect(test.press("s", {}, test.input).defaultPrevented).toBe(false);
    expect(test.actions["search.name"]).toHaveBeenCalledOnce();
  });

  it("honors explicit empty replacements without leaving browser or global defaults active", async () => {
    vi.mocked(getKeymapConfig).mockResolvedValue(
      response({ mgr: { keymap: [] }, workspace: { keymap: [] } }),
    );
    const test = setup();
    await settle();
    for (const key of ["s", "g", ",", "j"])
      expect(test.press(key).defaultPrevented).toBe(false);
    expect(test.press("s", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
    expect(test.workspace["document.save"]).not.toHaveBeenCalled();
  });

  it("cancels an old prefix when asynchronous configuration replaces the map", async () => {
    let finish: ((value: KeymapConfigResponse) => void) | undefined;
    vi.mocked(getKeymapConfig).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const test = setup();
    test.press(",");
    expect(test.controller.pending()).not.toBeNull();
    finish?.(response({ mgr: { keymap: [{ on: "x", run: "filter" }] } }));
    await settle();
    expect(test.controller.pending()).toBeNull();
    expect(test.press("s").defaultPrevented).toBe(false);
    test.press("x");
    expect(test.actions.filter).toHaveBeenCalledOnce();
  });

  it("dispatches custom multi-key actions and shows literal descriptions and remaining keys", async () => {
    vi.mocked(getKeymapConfig).mockResolvedValue(
      response({
        mgr: {
          keymap: [
            {
              on: ["g", "f", "n"],
              run: ["filter", "view.toggle"],
              desc: "<script>Local files</script>",
            },
            { on: ["g", "s"], run: "search.content", desc: "Search text" },
          ],
        },
      }),
    );
    const test = setup();
    await settle();
    expect(test.press("g").defaultPrevented).toBe(true);
    expect(test.controller.pending()?.keys).toEqual(["g"]);
    expect(test.container.textContent).toContain("f then n");
    expect(test.container.textContent).toContain(
      "<script>Local files</script>",
    );
    expect(test.container.querySelector("script")).toBeNull();
    test.press("f");
    expect(test.controller.pending()?.keys).toEqual(["g", "f"]);
    expect(test.container.textContent).not.toContain("Search text");
    test.press("n");
    await settle();
    expect(test.actions.filter).toHaveBeenCalledOnce();
    expect(test.actions["view.toggle"]).toHaveBeenCalledOnce();
    expect(test.actions.filter.mock.invocationCallOrder[0]).toBeLessThan(
      test.actions["view.toggle"].mock.invocationCallOrder[0] ?? 0,
    );
    expect(test.controller.pending()).toBeNull();
    expect(test.press("s").defaultPrevented).toBe(false);
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
  });

  it("retains a prefix without a timeout, consumes invalid continuations, and cancels on Escape", async () => {
    const test = setup();
    await settle();
    vi.useFakeTimers();
    test.press(",");
    vi.advanceTimersByTime(600_000);
    expect(test.controller.pending()?.keys).toEqual([","]);
    expect(test.press("s").defaultPrevented).toBe(true);
    expect(test.actions["sort.size.asc"]).toHaveBeenCalledOnce();
    test.press(",");
    expect(test.press("s", { shiftKey: false }).defaultPrevented).toBe(true);
    test.press(",");
    expect(test.press("z").defaultPrevented).toBe(true);
    expect(test.controller.pending()).toBeNull();
    test.press(",");
    expect(test.press("Escape").defaultPrevented).toBe(true);
    expect(test.controller.pending()).toBeNull();
  });

  it("cancels prefixes on scope identity, scope availability, focus changes, blur, and IME", async () => {
    const test = setup();
    await settle();
    test.press(",");
    test.setIdentity("directory-two");
    expect(test.controller.pending()).toBeNull();
    test.press(",");
    test.setEnabled(false);
    expect(test.controller.pending()).toBeNull();
    test.setEnabled(true);
    test.press(",");
    test.input.focus();
    expect(test.controller.pending()).toBeNull();
    test.button.focus();
    test.press(",");
    window.dispatchEvent(new Event("blur"));
    expect(test.controller.pending()).toBeNull();
    test.press(",");
    expect(test.press("s", { isComposing: true }).defaultPrevented).toBe(false);
    expect(test.controller.pending()).toBeNull();
    expect(test.actions["sort.size.asc"]).not.toHaveBeenCalled();
  });

  it("allows valid modified continuations before falling back to global save for unmatched modifiers", async () => {
    vi.mocked(getKeymapConfig).mockResolvedValue(
      response({
        mgr: { prepend_keymap: [{ on: ["x", "<C-s>"], run: "filter" }] },
      }),
    );
    const test = setup();
    await settle();
    test.press("x");
    test.press("s", { ctrlKey: true });
    expect(test.actions.filter).toHaveBeenCalledOnce();
    expect(test.workspace["document.save"]).not.toHaveBeenCalled();
    test.press(",");
    test.press("s", { ctrlKey: true });
    expect(test.workspace["document.save"]).toHaveBeenCalledOnce();
    expect(test.controller.pending()).toBeNull();
  });

  it("cancels pending keys for compositionstart and non-key IME events without consuming them", async () => {
    const test = setup();
    await settle();
    test.press(",");
    test.button.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(test.controller.pending()).toBeNull();
    for (const key of ["Dead", "Process", "Unidentified"]) {
      test.press(",");
      expect(test.press(key).defaultPrevented).toBe(false);
      expect(test.controller.pending()).toBeNull();
    }
    expect(test.actions["sort.size.asc"]).not.toHaveBeenCalled();
  });

  it("protects normal text input and modal input while permitting workspace save/open", async () => {
    const test = setup();
    await settle();
    test.input.focus();
    for (const key of ["s", "g", ",", "j", "S"])
      expect(test.press(key, {}, test.input).defaultPrevented).toBe(false);
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
    expect(test.workspace["git.toggle"]).not.toHaveBeenCalled();
    test.press("s", { ctrlKey: true }, test.input);
    test.press("o", { metaKey: true }, test.input);
    expect(test.workspace["document.save"]).toHaveBeenCalledOnce();
    expect(test.workspace["files.open"]).toHaveBeenCalledOnce();
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    test.container.append(modal);
    modal.append(test.input);
    expect(
      test.press("s", { ctrlKey: true }, test.input).defaultPrevented,
    ).toBe(false);
    expect(test.workspace["document.save"]).toHaveBeenCalledOnce();
  });

  it("repeats held navigation but never starts or advances a prefix from repeat events", async () => {
    const test = setup();
    await settle();
    test.press("j");
    test.press("j", { repeat: true });
    expect(test.actions["cursor.down"]).toHaveBeenCalledTimes(2);
    test.press(",", { repeat: true });
    expect(test.controller.pending()).toBeNull();
    test.press(",");
    test.press("s", { repeat: true });
    expect(test.controller.pending()?.keys).toEqual([","]);
    expect(test.actions["sort.size.asc"]).not.toHaveBeenCalled();
    test.press("s");
    expect(test.actions["sort.size.asc"]).toHaveBeenCalledOnce();
    test.press("s", { repeat: true });
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
  });

  it("consumes noop without legacy or workspace fallthrough", async () => {
    vi.mocked(getKeymapConfig).mockResolvedValue(
      response({
        mgr: {
          prepend_keymap: [
            { on: "g", run: "noop" },
            { on: "s", run: "noop" },
          ],
        },
      }),
    );
    const test = setup();
    await settle();
    expect(test.press("g").defaultPrevented).toBe(true);
    expect(test.press("s").defaultPrevented).toBe(true);
    expect(test.workspace["git.toggle"]).not.toHaveBeenCalled();
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
  });

  it.each(["backend", "notation", "action", "rejection"])(
    "keeps defaults after %s configuration failure",
    async (kind) => {
      if (kind === "backend")
        vi.mocked(getKeymapConfig).mockResolvedValue({
          ...response(),
          error: "Invalid keymap file. Using defaults.",
        });
      else if (kind === "rejection")
        vi.mocked(getKeymapConfig).mockRejectedValue(
          new Error("private diagnostic"),
        );
      else
        vi.mocked(getKeymapConfig).mockResolvedValue(
          response({
            mgr: {
              keymap: [
                {
                  on: kind === "notation" ? "invalid-key" : "s",
                  run: kind === "action" ? "shell forbidden" : "noop",
                },
              ],
            },
          }),
        );
      const test = setup();
      await settle();
      expect(test.controller.warning()).not.toBeNull();
      expect(test.controller.warning()).not.toContain("private diagnostic");
      test.press("s");
      expect(test.actions["search.name"]).toHaveBeenCalledOnce();
    },
  );

  it("removes listeners and ignores configuration completion after disposal", async () => {
    let finish: ((value: KeymapConfigResponse) => void) | undefined;
    vi.mocked(getKeymapConfig).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const test = setup();
    dispose?.();
    dispose = undefined;
    finish?.(response({ mgr: { keymap: [] } }));
    await settle();
    expect(test.controller.keymap().file.length).toBeGreaterThan(0);
    expect(test.press("s", {}, window).defaultPrevented).toBe(false);
    expect(test.actions["search.name"]).not.toHaveBeenCalled();
  });
});
