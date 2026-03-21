import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import { isLinuxWebKitDesktop } from "../../lib/platform";

interface VideoFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
}

export function VideoFilePreviewPane(props: VideoFilePreviewPaneProps) {
  const isLinuxDesktop = isLinuxWebKitDesktop();
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  const [openFailed, setOpenFailed] = createSignal<string | null>(null);
  const [videoSrc, setVideoSrc] = createSignal(convertFileSrc(props.path));
  let videoElement: HTMLVideoElement | undefined;
  let activeBlobUrl: string | null = null;
  let loadGeneration = 0;
  let blobFallbackRequestedForPath: string | null = null;

  const clearBlobUrl = () => {
    if (activeBlobUrl !== null) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
  };

  const openInDefaultPlayer = () => {
    setOpenFailed(null);
    void openPath(props.path).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to open the file.";
      console.error("Failed to open video in default player.", error);
      setOpenFailed(message);
    });
  };

  createEffect(() => {
    void props.path;
    loadGeneration += 1;
    blobFallbackRequestedForPath = null;
    clearBlobUrl();
    setPlaybackFailed(false);
    setOpenFailed(null);
    setVideoSrc(convertFileSrc(props.path));

    onCleanup(() => {
      loadGeneration += 1;
      clearBlobUrl();
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
        throw new Error(`Failed to load video: HTTP ${response.status}`);
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
      setVideoSrc(objectUrl);
    } catch (error: unknown) {
      if (generation !== loadGeneration) {
        return;
      }

      console.error("Failed to create blob URL for video playback.", error);
      setPlaybackFailed(true);
    }
  };

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.code !== "Space") {
        return;
      }

      if (event.repeat) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(".shortcuts-help-layer")
      ) {
        return;
      }

      const video = videoElement;

      if (video === undefined) {
        return;
      }

      if (
        target instanceof Node &&
        (target === video || video.contains(target))
      ) {
        return;
      }

      event.preventDefault();

      if (video.paused) {
        void video.play().catch(() => {
          // Codec or autoplay policy blocked playback.
        });
      } else {
        video.pause();
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
          {isLinuxDesktop
            ? "Video (Space: play / pause, fallback: system player)"
            : "Video (Space: play / pause)"}
        </span>
      </header>
      <div
        class={`pane__body preview preview--embedded-video${isLinuxDesktop ? " preview--video-external-linux" : ""}`}
      >
        <figure class="preview-media preview-media--video">
          <video
            ref={(element) => {
              videoElement = element ?? undefined;
            }}
            controls
            preload="none"
            playsinline
            src={videoSrc()}
            aria-label={props.fileName}
            onError={() => {
              const video = videoElement;

              if (
                isLinuxDesktop &&
                activeBlobUrl === null &&
                blobFallbackRequestedForPath !== props.path
              ) {
                blobFallbackRequestedForPath = props.path;
                void switchToBlobFallback();
                return;
              }

              if (video !== undefined) {
                video.pause();
                video.removeAttribute("src");
                video.load();
              }

              setPlaybackFailed(true);
            }}
          >
            {props.fileName}
          </video>
        </figure>
        <div class="preview-video__actions">
          <Show when={playbackFailed()}>
            <p class="preview-video__error">
              Inline playback failed in the Linux WebView. Open the file in your
              system player instead.
            </p>
          </Show>
          <Show when={openFailed() !== null}>
            <p class="preview-video__error">{openFailed()}</p>
          </Show>
          {isLinuxDesktop || playbackFailed() ? (
            <button
              type="button"
              class="button button--ghost preview-video__open-default"
              onClick={() => {
                openInDefaultPlayer();
              }}
            >
              Open {props.fileName}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
