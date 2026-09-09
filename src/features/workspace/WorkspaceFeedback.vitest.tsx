import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { WorkspaceErrorBanner } from "./WorkspaceFeedback";

describe("transient workspace notifications", () => {
  let dispose: (() => void) | undefined;
  let update: (message: string | null) => void;
  const card = () =>
    document.querySelector<HTMLElement>(".workspace-notification");
  const close = () =>
    document.querySelector<HTMLButtonElement>(
      '[aria-label="Close notification"]',
    );
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<input id="editor"><div id="root"></div>';
    document.querySelector<HTMLInputElement>("#editor")?.focus();
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing root");
    dispose = render(() => {
      const [message, setMessage] = createSignal<string | null>(null, {
        equals: false,
      });
      update = (next) => {
        setMessage(next);
      };
      return <WorkspaceErrorBanner message={message()} />;
    }, root);
  });
  afterEach(() => {
    dispose?.();
    vi.useRealTimers();
  });

  it("announces escaped text without focus theft, dismisses and cleans its timer", () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    update("<script>not a repository</script>");
    expect(card()?.getAttribute("role")).toBe("alert");
    expect(card()?.querySelector("script")).toBeNull();
    expect(document.activeElement?.id).toBe("editor");
    close()?.click();
    expect(card()).toBeNull();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
  it("expires after eight seconds, renews identical occurrences, and revives dismissed messages", () => {
    update("not a repository");
    vi.advanceTimersByTime(7_000);
    update("not a repository");
    vi.advanceTimersByTime(7_999);
    expect(card()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(card()).toBeNull();
    update("not a repository");
    expect(card()).not.toBeNull();
    close()?.click();
    update("not a repository");
    expect(card()).not.toBeNull();
  });
  it("replacement cancels the old deadline and clearing/unmount clean timers", () => {
    update("first");
    vi.advanceTimersByTime(7_000);
    update("replacement");
    vi.advanceTimersByTime(1_000);
    expect(card()?.textContent).toContain("replacement");
    expect(vi.getTimerCount()).toBe(1);
    update(null);
    expect(vi.getTimerCount()).toBe(0);
    update("last");
    dispose?.();
    dispose = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("pauses for both hover and focus, resuming only after both leave", () => {
    update("read me");
    vi.advanceTimersByTime(3_000);
    card()?.dispatchEvent(new MouseEvent("mouseenter"));
    close()?.focus();
    vi.advanceTimersByTime(20_000);
    card()?.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(20_000);
    expect(card()).not.toBeNull();
    document.querySelector<HTMLInputElement>("#editor")?.focus();
    vi.advanceTimersByTime(4_999);
    expect(card()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(card()).toBeNull();
  });
});
