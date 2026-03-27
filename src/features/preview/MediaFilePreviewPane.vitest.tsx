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

  it("falls back to a blob URL for Linux video playback failures", async () => {
    linuxWebKitDesktop = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["audio"], { type: "audio/mpeg" }),
    }));
    const createObjectUrlMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:linux-audio");
    const revokeObjectUrlMock = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});

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
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith("asset:///tmp/demo.mp4");
    expect(createObjectUrlMock).toHaveBeenCalledOnce();
    expect(media.getAttribute("src")).toBe("blob:linux-audio");
    expect(document.querySelector(".preview-video__error")).toBeNull();

    dispose?.();
    dispose = undefined;

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:linux-audio");
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

  it("falls back to a blob URL for desktop local-stream playback failures", async () => {
    linuxWebKitDesktop = true;

    const root = document.getElementById("root");

    if (root === null) {
      throw new Error("missing test root");
    }

    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["wav"], { type: "audio/wav" }),
    }));
    const createObjectUrlMock = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:linux-inline-audio");

    vi.stubGlobal("fetch", fetchMock);

    dispose = render(
      () => (
        <MediaFilePreviewPane
          kind="audio"
          path="/tmp/demo.mp3"
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
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:41234/media/demo-token",
    );
    expect(createObjectUrlMock).toHaveBeenCalledOnce();
    expect(media.getAttribute("src")).toBe("blob:linux-inline-audio");
  });
});
