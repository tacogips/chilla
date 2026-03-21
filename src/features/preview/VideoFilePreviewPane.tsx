import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import { isLinuxWebKitDesktop } from "../../lib/platform";

interface VideoFilePreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
}

export function VideoFilePreviewPane(props: VideoFilePreviewPaneProps) {
  const isLinuxDesktop = isLinuxWebKitDesktop();
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  let videoElement: HTMLVideoElement | undefined;

  const openInDefaultPlayer = () => {
    void openPath(props.path).catch(() => {
      // Opener unavailable (e.g. browser-only dev without Tauri).
    });
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
            src={convertFileSrc(props.path)}
            aria-label={props.fileName}
            onError={() => {
              const video = videoElement;

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
