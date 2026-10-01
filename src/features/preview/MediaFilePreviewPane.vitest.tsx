import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { MediaFilePreviewPane } from "./MediaFilePreviewPane";

let linuxWebKitDesktop = false;
let macDesktopWebView = false;
const openerMocks = vi.hoisted(() => ({ openPath: vi.fn() }));
const PROTOCOL_MEDIA_URL = "chilla-media://localhost/media/demo-token";
const WINDOWS_MEDIA_URL = "http://chilla-media.localhost/media/demo-token";
const GENERIC_UPPERCASE_MP3_PATH = "/tmp/テスト音声.MP3";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: openerMocks.openPath,
}));

vi.mock("../../lib/platform", () => ({
  isLinuxWebKitDesktop() {
    return linuxWebKitDesktop;
  },
  isMacDesktopWebView() {
    return macDesktopWebView;
  },
}));

describe("MediaFilePreviewPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    openerMocks.openPath.mockReset();
    openerMocks.openPath.mockResolvedValue(undefined);
    linuxWebKitDesktop = false;
    macDesktopWebView = false;
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    linuxWebKitDesktop = false;
    macDesktopWebView = false;
  });

  it("refreshes asset fallback URLs while preserving stream URLs", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    const [generation, setGeneration] = createSignal(0);
    const [streamUrl, setStreamUrl] = createSignal<string | null>(null);
    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path="/tmp/demo.mp3"
          fileName="demo.mp3"
          autoplayRequestId={0}
          localResourceGeneration={generation()}
          streamUrl={streamUrl()}
        />
      ),
      root,
    );
    const media = root.querySelector<HTMLAudioElement>("audio");
    const firstUrl = media?.src;
    setGeneration(1);
    expect(media?.src).not.toBe(firstUrl);
    expect(new URL(media?.src ?? "").searchParams.get("chilla_refresh")).toBe(
      "1",
    );
    setStreamUrl("chilla-media://localhost/media/new-token");
    expect(media?.src).toBe("chilla-media://localhost/media/new-token");
  });

  it.each([
    ["audio", PROTOCOL_MEDIA_URL],
    ["video", PROTOCOL_MEDIA_URL],
    ["audio", WINDOWS_MEDIA_URL],
    ["video", WINDOWS_MEDIA_URL],
  ] as const)(
    "plays and pauses %s and recovers after renewing protocol source %s",
    (kind, initialUrl) => {
      const root = document.getElementById("root");
      if (root === null) throw new Error("missing test root");
      const [streamUrl, setStreamUrl] = createSignal<string>(initialUrl);
      const [generation, setGeneration] = createSignal(0);
      dispose = render(
        () => (
          <MediaFilePreviewPane
            kind={kind}
            path={kind === "audio" ? "/tmp/demo.mp3" : "/tmp/demo.mp4"}
            fileName={kind === "audio" ? "demo.mp3" : "demo.mp4"}
            streamUrl={streamUrl()}
            localResourceGeneration={generation()}
            autoplayRequestId={0}
          />
        ),
        root,
      );
      const media = root.querySelector(kind);
      if (!(media instanceof HTMLMediaElement))
        throw new Error("missing media element");
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", code: "Space" }),
      );
      expect(media.play).toHaveBeenCalledTimes(1);
      media.dispatchEvent(new Event("play"));
      if (kind === "video")
        expect(root.querySelector(".preview-video__overlay")).toBeNull();
      Object.defineProperty(media, "paused", {
        configurable: true,
        value: false,
      });
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", code: "Space" }),
      );
      expect(media.pause).toHaveBeenCalledTimes(1);

      setGeneration(1);
      expect(media.getAttribute("src")).toBe(initialUrl);
      media.dispatchEvent(new Event("error"));
      expect(media.getAttribute("src")).toBeNull();
      expect(root.querySelector(".preview-video__error")).not.toBeNull();

      const renewedUrl = initialUrl.replace("demo-token", "renewed-token");
      setStreamUrl(renewedUrl);
      expect(media.getAttribute("src")).toBe(renewedUrl);
      expect(root.querySelector(".preview-video__error")).toBeNull();
      Object.defineProperty(media, "paused", {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", code: "Space" }),
      );
      expect(media.play).toHaveBeenCalledTimes(2);
    },
  );

  it("seeks video playback with large shortcuts", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          fileName="demo.mp4"
          streamUrl={PROTOCOL_MEDIA_URL}
          autoplayRequestId={0}
        />
      ),
      root,
    );

    expect(root.querySelector(".preview__file-name")?.textContent).toBe(
      "demo.mp4",
    );

    const media = document.querySelector("video");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing video element");
    }

    Object.defineProperty(media, "duration", {
      configurable: true,
      value: 120,
    });
    media.currentTime = 10;

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(25);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "u",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(10);
  });

  it("seeks audio playback with large shortcuts", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path="/tmp/demo.mp3"
          fileName="demo.mp3"
          streamUrl={PROTOCOL_MEDIA_URL}
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("audio");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing audio element");
    }

    Object.defineProperty(media, "duration", {
      configurable: true,
      value: 120,
    });
    media.currentTime = 3;

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(18);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "u",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(3);
  });

  it("accepts physical key codes for media seek shortcuts", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          fileName="demo.mp4"
          streamUrl={PROTOCOL_MEDIA_URL}
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("video");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing video element");
    }

    Object.defineProperty(media, "duration", {
      configurable: true,
      value: 120,
    });
    media.currentTime = 10;

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Process",
        code: "KeyD",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(25);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Process",
        code: "KeyU",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(10);
  });

  it("preloads metadata and attaches the video source eagerly", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          fileName="demo.mp4"
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("video");

    if (!(media instanceof HTMLVideoElement)) {
      throw new Error("missing video element");
    }

    expect(media.getAttribute("preload")).toBe("metadata");
    expect(media.getAttribute("src")).toBe("asset:///tmp/demo.mp4");
  });

  it.each([PROTOCOL_MEDIA_URL, WINDOWS_MEDIA_URL])(
    "attaches the internal media URL %s unchanged and preloads video",
    (streamUrl) => {
      const root = document.getElementById("root");

      if (root === null) {
        throw new Error("missing test root");
      }

      dispose = render(
        () => (
          <MediaFilePreviewPane
            kind="video"
            path="/tmp/demo.mp4"
            streamUrl={streamUrl}
            fileName="demo.mp4"
            autoplayRequestId={0}
          />
        ),
        root,
      );

      const media = document.querySelector("video");

      if (!(media instanceof HTMLVideoElement)) {
        throw new Error("missing video element");
      }

      expect(media.getAttribute("preload")).toBe("auto");
      expect(media.getAttribute("src")).toBe(streamUrl);
    },
  );

  it.each(["video", "audio"] as const)(
    "handles focused native %s controls in capture without duplicate default handling",
    (kind) => {
      const root = document.getElementById("root");
      if (root === null) throw new Error("missing test root");
      dispose = render(
        () => (
          <MediaFilePreviewPane
            kind={kind}
            path="/tmp/demo.mp4"
            fileName="demo.mp4"
            streamUrl={PROTOCOL_MEDIA_URL}
            autoplayRequestId={0}
          />
        ),
        root,
      );
      const media = root.querySelector(kind);
      if (!(media instanceof HTMLMediaElement))
        throw new Error("missing media element");
      media.tabIndex = 0;
      media.focus();
      Object.defineProperty(media, "duration", {
        configurable: true,
        value: 120,
      });
      media.currentTime = 30;
      const nativeHandler = vi.fn();
      media.addEventListener("keydown", nativeHandler);
      const down = new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      media.dispatchEvent(down);
      expect(media.currentTime).toBe(45);
      expect(down.defaultPrevented).toBe(true);
      const up = new KeyboardEvent("keydown", {
        key: "Process",
        code: "KeyU",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      media.dispatchEvent(up);
      expect(media.currentTime).toBe(30);
      expect(up.defaultPrevented).toBe(true);
      const space = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      });
      media.dispatchEvent(space);
      expect(media.play).toHaveBeenCalledTimes(1);
      expect(space.defaultPrevented).toBe(true);
      Object.defineProperty(media, "paused", {
        configurable: true,
        value: false,
      });
      media.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(media.pause).toHaveBeenCalledTimes(1);
      expect(nativeHandler).not.toHaveBeenCalled();
      expect(root.querySelector(".pane__header")?.textContent).not.toContain(
        "Space:",
      );
    },
  );

  it("preserves editable fields, modified keys, help, composing and inactive panes", () => {
    const root = document.getElementById("root");
    if (root === null) throw new Error("missing test root");
    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          fileName="demo.mp4"
          streamUrl={PROTOCOL_MEDIA_URL}
          autoplayRequestId={0}
        />
      ),
      root,
    );
    const media = root.querySelector("video");
    if (!(media instanceof HTMLMediaElement))
      throw new Error("missing media element");
    media.currentTime = 30;
    const input = document.createElement("input");
    root.append(input);
    const editorEvent = new KeyboardEvent("keydown", {
      key: "d",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(editorEvent);
    expect(editorEvent.defaultPrevented).toBe(false);
    for (const modifier of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: " ",
        ...modifier,
        bubbles: true,
        cancelable: true,
      });
      media.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    for (const properties of [
      { isComposing: true },
      { repeat: true },
      { shiftKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        ...properties,
        bubbles: true,
        cancelable: true,
      });
      media.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const help = document.createElement("div");
    help.className = "shortcuts-help-layer";
    root.append(help);
    const helpEvent = new KeyboardEvent("keydown", {
      key: "d",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    media.dispatchEvent(helpEvent);
    expect(helpEvent.defaultPrevented).toBe(false);
    help.remove();
    root.querySelector(".pane")?.classList.add("pane--hidden");
    const hiddenEvent = new KeyboardEvent("keydown", {
      key: "d",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    media.dispatchEvent(hiddenEvent);
    expect(hiddenEvent.defaultPrevented).toBe(false);
    expect(media.currentTime).toBe(30);
    expect(media.play).not.toHaveBeenCalled();
  });

  it("shows the fallback UI instead of fetching the full file for Linux video playback failures", () => {
    linuxWebKitDesktop = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          fileName="demo.mp4"
          streamUrl={PROTOCOL_MEDIA_URL}
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("video");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing video element");
    }

    media.dispatchEvent(new Event("error"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(media.getAttribute("src")).toBeNull();
    expect(document.querySelector(".preview-video__error")?.textContent).toBe(
      "Inline playback failed in the Linux WebView.",
    );
    expect(
      document.querySelector(".preview-video__open-default")?.textContent,
    ).toBe("Open in default app");
    document
      .querySelector<HTMLButtonElement>(".preview-video__open-default")
      ?.click();
    expect(openerMocks.openPath).toHaveBeenCalledWith("/tmp/demo.mp4");
  });

  it("renders inline Linux audio from the internal protocol URL", () => {
    linuxWebKitDesktop = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path={GENERIC_UPPERCASE_MP3_PATH}
          streamUrl={PROTOCOL_MEDIA_URL}
          fileName="demo.mp3"
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("audio");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing audio element");
    }

    expect(media.getAttribute("src")).toBe(PROTOCOL_MEDIA_URL);
  });

  it("renders inline macOS audio from the internal protocol URL", () => {
    macDesktopWebView = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path={GENERIC_UPPERCASE_MP3_PATH}
          streamUrl={PROTOCOL_MEDIA_URL}
          fileName="demo.mp3"
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("audio");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing audio element");
    }

    expect(media.getAttribute("src")).toBe(PROTOCOL_MEDIA_URL);
  });

  it("shows the fallback UI instead of fetching the full file for macOS audio stream failures", () => {
    macDesktopWebView = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path={GENERIC_UPPERCASE_MP3_PATH}
          streamUrl={PROTOCOL_MEDIA_URL}
          fileName="demo.mp3"
          autoplayRequestId={0}
        />
      ),
      root,
    );

    const media = document.querySelector("audio");

    if (!(media instanceof HTMLMediaElement)) {
      throw new Error("missing audio element");
    }

    media.dispatchEvent(new Event("error"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(media.getAttribute("src")).toBeNull();
    expect(document.querySelector(".preview-video__error")?.textContent).toBe(
      "Inline playback failed.",
    );
    expect(
      document.querySelector(".preview-video__open-default")?.textContent,
    ).toBe("Open in default app");
  });
});
