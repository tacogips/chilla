import { convertFileSrc } from "@tauri-apps/api/core";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import { isLinuxWebKitDesktop } from "../../lib/platform";

interface VideoFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly autoplayRequestId: number;
}

export function VideoFilePreviewPane(props: VideoFilePreviewPaneProps) {
  const isLinuxDesktop = isLinuxWebKitDesktop();
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  const [videoSrc, setVideoSrc] = createSignal(convertFileSrc(props.path));
  let videoElement: HTMLVideoElement | undefined;
  let activeBlobUrl: string | null = null;
  let loadGeneration = 0;
  let blobFallbackRequestedForPath: string | null = null;
  let playRequested = false;

  const clearBlobUrl = () => {
    if (activeBlobUrl !== null) {
      URL.revokeObjectURL(activeBlobUrl);
      activeBlobUrl = null;
    }
  };

  const requestPlayback = () => {
    const video = videoElement;

    playRequested = true;

    if (video === undefined) {
      return;
    }

    void video.play().catch(() => {
      // If media is still loading, onCanPlay will honor the pending request.
    });
  };

  createEffect(() => {
    void props.path;
    loadGeneration += 1;
    blobFallbackRequestedForPath = null;
    clearBlobUrl();
    setPlaybackFailed(false);
    setVideoSrc(convertFileSrc(props.path));
    playRequested = false;

    onCleanup(() => {
      loadGeneration += 1;
      clearBlobUrl();
    });
  });

  createEffect(() => {
    if (props.autoplayRequestId <= 0) {
      return;
    }

    requestPlayback();
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

      const video = videoElement;
      if (playRequested && video !== undefined) {
        void video.play().catch(() => {
          // Wait for canplay if the element is still not ready.
        });
      }
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
        requestPlayback();
      } else {
        playRequested = false;
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
        <span>Video (Space: play / pause)</span>
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
            onCanPlay={() => {
              const video = videoElement;

              if (!playRequested || video === undefined || !video.paused) {
                return;
              }

              void video.play().catch(() => {
                // Keep the request pending until playback succeeds or errors.
              });
            }}
            onPlay={() => {
              playRequested = false;
            }}
            onPause={() => {
              const video = videoElement;

              if (video !== undefined && video.ended) {
                playRequested = false;
              }
            }}
            onError={() => {
              const video = videoElement;
              playRequested = false;

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
              Inline playback failed in the Linux WebView.
            </p>
          </Show>
        </div>
      </div>
    </section>
  );
}
