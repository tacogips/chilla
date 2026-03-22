import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join, normalize } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createEffect, on, onCleanup, onMount } from "solid-js";
import type { ColorScheme } from "../../lib/theme";
import {
  isDefaultBrowserUrl,
  resolveDocumentResourceUrl,
  type PreviewPathApi,
} from "./preview-assets";

interface PreviewPaneProps {
  readonly html: string;
  readonly visible: boolean;
  readonly selectedAnchorId: string | null;
  readonly documentPath: string | null;
  readonly colorScheme: ColorScheme;
}

const ASCIINEMA_HOSTNAME = "asciinema.org";
const ASCIINEMA_RECORDING_PATH_PATTERN = /^\/a\/([A-Za-z0-9_-]+)\/?$/;

let mermaidModulePromise:
  | Promise<(typeof import("mermaid"))["default"]>
  | undefined;

async function getMermaid() {
  mermaidModulePromise ??= import("mermaid").then(({ default: mermaid }) => {
    return mermaid;
  });

  return mermaidModulePromise;
}

function mermaidTheme(colorScheme: ColorScheme): "dark" | "neutral" {
  return colorScheme === "dark" ? "dark" : "neutral";
}

async function enhanceMermaid(
  container: HTMLElement,
  colorScheme: ColorScheme,
) {
  const mermaidBlocks = Array.from(
    container.querySelectorAll("pre > code.language-mermaid"),
  );

  if (mermaidBlocks.length === 0) {
    return;
  }

  for (const block of mermaidBlocks) {
    const host = block.parentElement;

    if (host === null) {
      continue;
    }

    const mermaidTarget = document.createElement("div");
    mermaidTarget.className = "mermaid";
    mermaidTarget.textContent = block.textContent ?? "";
    host.replaceWith(mermaidTarget);
  }

  const mermaid = await getMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: mermaidTheme(colorScheme),
  });
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));

  if (nodes.length > 0) {
    await mermaid.run({ nodes });
  }
}

const previewPathApi: PreviewPathApi = {
  dirname,
  join,
  normalize,
  convertFileSrc,
};

async function enhancePreviewMedia(
  container: HTMLElement,
  documentPath: string | null,
) {
  const mediaElements = Array.from(
    container.querySelectorAll<HTMLElement>(
      "img[src], video[src], video source[src], iframe[src], embed[src]",
    ),
  );

  for (const element of mediaElements) {
    const source = element.getAttribute("src");

    if (source === null) {
      continue;
    }

    const resolvedSource = await resolveDocumentResourceUrl(
      source,
      documentPath,
      previewPathApi,
    );

    if (resolvedSource !== null) {
      element.setAttribute("src", resolvedSource);
    }
  }
}

function extractAsciinemaRecordingId(rawUrl: string): string | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== ASCIINEMA_HOSTNAME
  ) {
    return null;
  }

  return parsedUrl.pathname.match(ASCIINEMA_RECORDING_PATH_PATTERN)?.[1] ?? null;
}

function isAsciinemaPosterImage(
  image: HTMLImageElement,
  recordingId: string,
): boolean {
  const source = image.getAttribute("src");

  if (source === null) {
    return false;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(source);
  } catch {
    return false;
  }

  return (
    parsedUrl.protocol === "https:" &&
    parsedUrl.hostname === ASCIINEMA_HOSTNAME &&
    parsedUrl.pathname === `/a/${recordingId}.svg`
  );
}

function enhanceAsciinemaEmbeds(container: HTMLElement): void {
  const links = Array.from(
    container.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );

  for (const link of links) {
    const href = link.getAttribute("href");

    if (href === null) {
      continue;
    }

    const recordingId = extractAsciinemaRecordingId(href);

    if (recordingId === null) {
      continue;
    }

    const posterImage = link.querySelector<HTMLImageElement>("img[src]");

    if (
      posterImage === null ||
      !isAsciinemaPosterImage(posterImage, recordingId)
    ) {
      continue;
    }

    const figure = document.createElement("figure");
    figure.className = "preview-media preview-media--asciinema";

    const embedContainer = document.createElement("div");
    embedContainer.className = "preview-asciinema";
    embedContainer.dataset["asciinemaId"] = recordingId;

    const script = document.createElement("script");
    script.async = true;
    script.id = `asciicast-${recordingId}`;
    script.src = `https://asciinema.org/a/${recordingId}.js`;
    embedContainer.append(script);

    const caption = document.createElement("figcaption");
    caption.className = "preview-asciinema__fallback";

    const fallbackLink = document.createElement("a");
    fallbackLink.href = href;
    fallbackLink.rel = "noopener noreferrer";
    fallbackLink.target = "_blank";
    fallbackLink.textContent = "Open recording in browser";
    caption.append(fallbackLink);

    figure.append(embedContainer, caption);
    link.replaceWith(figure);
  }
}

async function enhancePreviewContent(
  container: HTMLElement,
  documentPath: string | null,
  colorScheme: ColorScheme,
) {
  for (const link of Array.from(
    container.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )) {
    const href = link.getAttribute("href");

    if (href !== null && isDefaultBrowserUrl(href)) {
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("target", "_blank");
    }
  }

  enhanceAsciinemaEmbeds(container);
  await enhancePreviewMedia(container, documentPath);
  await enhanceMermaid(container, colorScheme);
}

export function PreviewPane(props: PreviewPaneProps) {
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    const container = containerRef;

    if (container === undefined) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      const href = link?.getAttribute("href");

      if (href === null || href === undefined || !isDefaultBrowserUrl(href)) {
        return;
      }

      event.preventDefault();
      void openUrl(href).catch(() => {
        // Leave the link inert if the desktop opener is unavailable.
      });
    };

    container.addEventListener("click", handleClick);

    onCleanup(() => {
      container.removeEventListener("click", handleClick);
    });
  });

  createEffect(
    on(
      [
        () => props.visible,
        () => props.html,
        () => props.documentPath,
        () => props.colorScheme,
      ],
      ([visible, html, documentPath, colorScheme]) => {
        const container = containerRef;

        if (!visible || container === undefined) {
          return;
        }

        container.innerHTML = html;

        void enhancePreviewContent(container, documentPath, colorScheme).catch(
          () => {
            // Leave the rendered markup intact if asset or Mermaid enhancement fails.
          },
        );
      },
    ),
  );

  createEffect(() => {
    const anchorId = props.selectedAnchorId;
    const container = containerRef;

    if (!props.visible || anchorId === null || container === undefined) {
      return;
    }

    const target = container.querySelector<HTMLElement>(`#${anchorId}`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  });

  return (
    <section class={`pane${props.visible ? "" : " pane--hidden"}`}>
      <header class="pane__header">
        <span class="pane__title">Preview</span>
        <span>Rendered HTML</span>
      </header>
      <div class="pane__body preview">
        <div
          ref={containerRef}
          class="preview__content"
          innerHTML={props.html}
        />
      </div>
    </section>
  );
}
