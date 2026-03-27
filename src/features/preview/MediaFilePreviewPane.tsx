import { convertFileSrc } from "@tauri-apps/api/core";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import { isLinuxWebKitDesktop } from "../../lib/platform";

interface MediaFilePreviewPaneProps {
  readonly kind: "video" | "audio";
  readonly path: string;
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
  const isLinuxDesktop = isLinuxWebKitDesktop() && isVideo();
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  const [showPlayOverlay, setShowPlayOverlay] = createSignal(true);
  const [mediaSrc, setMediaSrc] = createSignal(convertFileSrc(props.path));
  let playButtonElement: HTMLButtonElement | undefined;
  let mediaElement: HTMLMediaElement | undefined;
  let activeBlobUrl: string | null = null;
  let loadGeneration = 0;
  let blobFallbackRequestedForPath: string | null = null;
  let playRequested = false;
  let handledAutoplayRequestId = 0;

  const clearBlobUrl = () => {
    if (activeBlobUrl !== null) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
  };

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
    void props.kind;
    loadGeneration += 1;
    blobFallbackRequestedForPath = null;
    handledAutoplayRequestId = 0;
    clearBlobUrl();
    setPlaybackFailed(false);
    setShowPlayOverlay(true);
    setMediaSrc(convertFileSrc(props.path));

    onCleanup(() => {
      loadGeneration += 1;
      clearBlobUrl();
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

  const switchToBlobFallback = async () => {
    if (!isLinuxDesktop || activeBlobUrl !== null) {
      return;
    }

    const assetSrc = convertFileSrc(props.path);
    const generation = loadGeneration;

    try {
      const response = await fetch(assetSrc);

      if (!response.ok) {
        throw new Error(`Failed to load media: HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      if (generation !== loadGeneration) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      clearBlobUrl();
      activeBlobUrl = objectUrl;
      setPlaybackFailed(false);
      setMediaSrc(objectUrl);

      const media = mediaElement;
      if (playRequested && media !== undefined) {
        void media.play().catch(() => {
          // Wait for canplay if the element is still not ready.
        });
      }
    } catch (error: unknown) {
      if (generation !== loadGeneration) {
        return;
      }

      console.error("Failed to create blob URL for media playback.", error);
      setPlaybackFailed(true);
    }
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
        class={`pane__body preview ${isVideo() ? "preview--embedded-video" : "preview--embedded-audio"}${isLinuxDesktop ? " preview--video-external-linux" : ""}`}
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
              preload="auto"
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
              onError={() => {
                if (
                  isLinuxDesktop &&
                  activeBlobUrl === null &&
                  blobFallbackRequestedForPath !== props.path
                ) {
                  blobFallbackRequestedForPath = props.path;
                  void switchToBlobFallback();
                  return;
                }

                if (mediaElement !== undefined) {
                  mediaElement.pause();
                  mediaElement.removeAttribute("src");
                  mediaElement.load();
                }

                playRequested = false;
                setShowPlayOverlay(true);
                setPlaybackFailed(true);
              }}
            >
              {props.fileName}
            </video>
          </Show>
        </figure>
        <Show when={isVideo()}>
          <div class="preview-video__actions">
            <Show when={playbackFailed()}>
              <p class="preview-video__error">
                Inline playback failed in the Linux WebView.
              </p>
            </Show>
          </div>
        </Show>
      </div>
    </section>
  );
}
