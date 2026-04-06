import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import { isLinuxWebKitDesktop } from "../../lib/platform";

interface MediaFilePreviewPaneProps {
  readonly kind: "video" | "audio";
  readonly path: string;
  readonly streamUrl?: string | null;
  readonly fileName: string;
  readonly autoplayRequestId: number;
}

const LARGE_MEDIA_SEEK_SECONDS = 15;

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6.5v11l9-5.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function hasExactModifiers(
  event: KeyboardEvent,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  } = {},
) {
  return (
    event.ctrlKey === (modifiers.ctrl ?? false) &&
    event.metaKey === (modifiers.meta ?? false) &&
    event.altKey === (modifiers.alt ?? false) &&
    event.shiftKey === (modifiers.shift ?? false)
  );
}

function matchesShortcut(
  event: KeyboardEvent,
  key: string,
  modifiers: {
    readonly ctrl?: boolean;
    readonly meta?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  } = {},
) {
  const shortcutCode =
    key.length === 1 && key >= "a" && key <= "z"
      ? `Key${key.toUpperCase()}`
      : null;

  return (
    (event.key.toLowerCase() === key || event.code === shortcutCode) &&
    hasExactModifiers(event, modifiers)
  );
}

function eventTargetsMediaElement(
  target: EventTarget | null,
  media: HTMLMediaElement | undefined,
): boolean {
  if (media === undefined || !(target instanceof Node)) {
    return false;
  }

  return target === media || media.contains(target);
}

export function MediaFilePreviewPane(props: MediaFilePreviewPaneProps) {
  const isVideo = () => props.kind === "video";
  const usesLinuxVideoBlobFallback = isLinuxWebKitDesktop() && isVideo();
  const isLinuxVideoLayout = usesLinuxVideoBlobFallback && isVideo();
  const resolvedMediaSrc = () => props.streamUrl ?? convertFileSrc(props.path);
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  const [showPlayOverlay, setShowPlayOverlay] = createSignal(true);
  const [mediaSrc, setMediaSrc] = createSignal(resolvedMediaSrc());
  let playButtonElement: HTMLButtonElement | undefined;
  let mediaElement: HTMLMediaElement | undefined;
  let loadGeneration = 0;
  let playRequested = false;
  let handledAutoplayRequestId = 0;

  const requestPlayback = () => {
    const media = mediaElement;

    playRequested = true;

    if (media === undefined) {
      return;
    }

    void media.play().catch(() => {
      // If media is still loading, onCanPlay will honor the pending request.
    });
  };

  const seekBy = (seconds: number) => {
    const media = mediaElement;

    if (media === undefined) {
      return;
    }

    const duration = media.duration;
    const unclampedTime = media.currentTime + seconds;
    const clampedTime = Number.isFinite(duration)
      ? Math.min(Math.max(unclampedTime, 0), duration)
      : Math.max(unclampedTime, 0);

    media.currentTime = clampedTime;
  };

  createEffect(() => {
    void props.path;
    void props.streamUrl;
    void props.kind;
    loadGeneration += 1;
    handledAutoplayRequestId = 0;
    setPlaybackFailed(false);
    setShowPlayOverlay(true);
    setMediaSrc(resolvedMediaSrc());

    onCleanup(() => {
      loadGeneration += 1;
    });
  });

  createEffect(() => {
    const requestId = props.autoplayRequestId;

    if (
      !isVideo() ||
      requestId <= 0 ||
      requestId === handledAutoplayRequestId
    ) {
      return;
    }

    handledAutoplayRequestId = requestId;

    queueMicrotask(() => {
      const playButton = playButtonElement;

      if (playButton !== undefined) {
        playButton.focus();
        playButton.click();
        return;
      }

      requestPlayback();
    });
  });

  const handleMediaError = () => {
    if (mediaElement !== undefined) {
      mediaElement.pause();
      mediaElement.removeAttribute("src");
      mediaElement.load();
    }

    playRequested = false;
    setShowPlayOverlay(true);
    setPlaybackFailed(true);
  };

  const openInDefaultApp = () => {
    void openPath(props.path).catch((error: unknown) => {
      console.error("Failed to open media in the default application.", error);
    });
  };

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.repeat) {
        return;
      }

      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(".shortcuts-help-layer")
      ) {
        return;
      }

      if (eventTargetsMediaElement(target, mediaElement)) {
        return;
      }

      if (matchesShortcut(event, "d", { ctrl: true })) {
        event.preventDefault();
        seekBy(LARGE_MEDIA_SEEK_SECONDS);
        return;
      }

      if (matchesShortcut(event, "u", { ctrl: true })) {
        event.preventDefault();
        seekBy(-LARGE_MEDIA_SEEK_SECONDS);
        return;
      }

      if (event.key !== " " && event.code !== "Space") {
        return;
      }

      event.preventDefault();

      const media = mediaElement;

      if (media === undefined) {
        return;
      }

      if (media.paused) {
        requestPlayback();
      } else {
        playRequested = false;
        media.pause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <section class="pane">
      <header class="pane__header">
        <span class="pane__title">Preview</span>
        <span>
          {isVideo() ? "Video" : "Audio"} (Space: play / pause, J/K: +/-5s when
          the file tree is hidden, Ctrl-D/Ctrl-U: +/-15s)
        </span>
      </header>
      <div
        class={`pane__body preview ${isVideo() ? "preview--embedded-video" : "preview--embedded-audio"}${isLinuxVideoLayout ? " preview--video-external-linux" : ""}`}
      >
        <figure
          class={`preview-media ${isVideo() ? "preview-media--video" : "preview-media--audio"}`}
        >
          <Show when={isVideo() && showPlayOverlay() && !playbackFailed()}>
            <div class="preview-video__overlay">
              <button
                ref={(element) => {
                  playButtonElement = element ?? undefined;
                }}
                type="button"
                class="button preview-video__play-button"
                aria-label={`Play ${props.fileName}`}
                onClick={() => {
                  requestPlayback();
                }}
              >
                <PlayGlyph />
              </button>
            </div>
          </Show>
          <Show
            when={isVideo()}
            fallback={
              <audio
                ref={(element) => {
                  mediaElement = element ?? undefined;
                }}
                class="preview-audio"
                controls
                preload="metadata"
                src={mediaSrc()}
                aria-label={props.fileName}
                onCanPlay={() => {
                  const media = mediaElement;

                  if (!playRequested || media === undefined || !media.paused) {
                    return;
                  }

                  void media.play().catch(() => {
                    // Keep the request pending until playback succeeds or errors.
                  });
                }}
                onPlay={() => {
                  playRequested = false;
                }}
                onPause={() => {
                  if (mediaElement?.ended === true) {
                    playRequested = false;
                  }
                }}
                onEnded={() => {
                  playRequested = false;
                }}
                onError={handleMediaError}
              >
                {props.fileName}
              </audio>
            }
          >
            <video
              ref={(element) => {
                mediaElement = element ?? undefined;
              }}
              controls
              preload="metadata"
              playsinline
              src={mediaSrc()}
              aria-label={props.fileName}
              onCanPlay={() => {
                const media = mediaElement;

                if (!playRequested || media === undefined || !media.paused) {
                  return;
                }

                void media.play().catch(() => {
                  // Keep the request pending until playback succeeds or errors.
                });
              }}
              onPlay={() => {
                playRequested = false;
                setShowPlayOverlay(false);
              }}
              onPause={() => {
                const media = mediaElement;

                if (media?.ended === true) {
                  playRequested = false;
                }

                if (media?.ended !== true) {
                  setShowPlayOverlay(true);
                }
              }}
              onEnded={() => {
                playRequested = false;
                setShowPlayOverlay(true);
              }}
              onError={handleMediaError}
            >
              {props.fileName}
            </video>
          </Show>
        </figure>
        <Show when={playbackFailed()}>
          <div class="preview-video__actions">
            <p class="preview-video__error">
              {usesLinuxVideoBlobFallback
                ? "Inline playback failed in the Linux WebView."
                : "Inline playback failed."}
            </p>
            <button
              type="button"
              class="button preview-video__open-default"
              onClick={openInDefaultApp}
            >
              Open in default app
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}
