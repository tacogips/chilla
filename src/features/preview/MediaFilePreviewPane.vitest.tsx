import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { MediaFilePreviewPane } from "./MediaFilePreviewPane";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc(path: string) {
    return `asset://${path}`;
  },
}));

vi.mock("../../lib/platform", () => ({
  isLinuxWebKitDesktop() {
    return false;
  },
}));

describe("MediaFilePreviewPane", () => {
  let dispose: VoidFunction | undefined;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.innerHTML = "";
  });

  it("seeks video playback with small and large shortcuts", () => {
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
        key: "f",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(15);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(30);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "u",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(15);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(10);
  });

  it("seeks audio playback with small and large shortcuts", () => {
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
        key: "b",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(0);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "u",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(0);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(5);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(20);
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
        code: "KeyF",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(15);

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Process",
        code: "KeyU",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(0);
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
        key: "f",
        bubbles: true,
      }),
    );
    expect(media.currentTime).toBe(30);

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
});
