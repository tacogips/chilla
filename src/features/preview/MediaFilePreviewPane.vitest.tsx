import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { MediaFilePreviewPane } from "./MediaFilePreviewPane";

let linuxWebKitDesktop = false;
let macDesktopWebView = false;
const GENERIC_UPPERCASE_MP3_PATH = "/tmp/テスト音声.MP3";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
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
    linuxWebKitDesktop = false;
    macDesktopWebView = false;
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    linuxWebKitDesktop = false;
    macDesktopWebView = false;
  });

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

  it("preloads streamed video aggressively to reduce play-start latency", () => {
    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="video"
          path="/tmp/demo.mp4"
          streamUrl="http://127.0.0.1:12345/media/token"
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
    expect(media.getAttribute("src")).toBe(
      "http://127.0.0.1:12345/media/token",
    );
  });

  it("does not hijack shortcuts when the native media element is the event target", () => {
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
    media.currentTime = 30;

    media.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        code: "KeyD",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(30);
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
  });

  it("renders inline Linux audio from the local stream URL", () => {
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
          streamUrl="http://127.0.0.1:41234/media/demo-token"
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

    expect(media.getAttribute("src")).toBe(
      "http://127.0.0.1:41234/media/demo-token",
    );
  });

  it("renders inline macOS audio from the local stream URL", () => {
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
          streamUrl="http://127.0.0.1:41234/media/demo-token"
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

    expect(media.getAttribute("src")).toBe(
      "http://127.0.0.1:41234/media/demo-token",
    );
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
          streamUrl="http://127.0.0.1:41234/media/demo-token"
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
