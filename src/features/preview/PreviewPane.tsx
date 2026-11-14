import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join, normalize } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import katex from "katex";
import "katex/dist/katex.min.css";
import "github-markdown-css/github-markdown.css";
import {
  createEffect,
  createSignal,
  Show,
  on,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import type { ColorScheme } from "../../lib/theme";
import {
  isDefaultBrowserUrl,
  resolveDocumentResource,
  type PreviewPathApi,
} from "./preview-assets";
import { PreviewHeader } from "./PreviewHeader";
import {
  anchorScrollAfterZoom,
  applyWheelZoom,
  attachPreviewPan,
  measureAnchor,
  type PreviewPanHandle,
} from "./previewPanZoom";

interface PreviewPaneProps {
  readonly fileName: string;
  readonly html: string;
  readonly visible: boolean;
  readonly selectedAnchorId: string | null;
  readonly documentPath: string | null;
  readonly colorScheme: ColorScheme;
  readonly subtitle?: string;
  readonly dragPanEnabled?: boolean;
  readonly imageRevision?: string | undefined;
  readonly localResourceGeneration?: number | undefined;
  readonly layout?: "rendered" | "source";
}

export type PreviewZoomDirection = "in" | "out";

const PREVIEW_ZOOM_STEP = 10;
export const PREVIEW_ZOOM_MIN = 50;
export const RENDERED_PREVIEW_ZOOM_MAX = 300;
export const IMAGE_PREVIEW_ZOOM_MAX = 800;

/** Returns the next bounded rendered-preview zoom percentage. */
export function nextPreviewZoom(
  current: number,
  direction: PreviewZoomDirection,
  maximum = RENDERED_PREVIEW_ZOOM_MAX,
): number {
  const adjustment =
    direction === "in" ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP;
  return Math.min(maximum, Math.max(PREVIEW_ZOOM_MIN, current + adjustment));
}

function previewZoomStyle(zoom: number): JSX.CSSProperties {
  return {
    "--preview-zoom-scale": String(zoom / 100),
  };
}

interface MarkdownThemePalette {
  readonly surface: string;
  readonly foreground: string;
  readonly heading: string;
  readonly muted: string;
  readonly border: string;
  readonly inlineCodeBackground: string;
  readonly preBackground: string;
  readonly tableStripe: string;
  readonly blockquoteBorder: string;
}

function markdownThemePalette(colorScheme: ColorScheme): MarkdownThemePalette {
  if (colorScheme === "dark") {
    return {
      surface: "#0d1117",
      foreground: "#c9d1d9",
      heading: "#f0f6fc",
      muted: "#8b949e",
      border: "#30363d",
      inlineCodeBackground: "rgb(110 118 129 / 0.4)",
      preBackground: "#161b22",
      tableStripe: "rgb(110 118 129 / 0.1)",
      blockquoteBorder: "#3b434b",
    };
  }

  return {
    surface: "#ffffff",
    foreground: "#1f2328",
    heading: "#1f2328",
    muted: "#59636e",
    border: "#d0d7de",
    inlineCodeBackground: "rgb(175 184 193 / 0.2)",
    preBackground: "#f6f8fa",
    tableStripe: "#f6f8fa",
    blockquoteBorder: "#d0d7de",
  };
}

export function previewThemeStyle(colorScheme: ColorScheme): JSX.CSSProperties {
  const palette = markdownThemePalette(colorScheme);

  return {
    "--markdown-surface": palette.surface,
    "--markdown-fg": palette.foreground,
    "--markdown-heading": palette.heading,
    "--markdown-muted": palette.muted,
    "--markdown-border": palette.border,
    "--markdown-inline-code-bg": palette.inlineCodeBackground,
    "--markdown-pre-bg": palette.preBackground,
    "--markdown-table-stripe": palette.tableStripe,
    "--markdown-blockquote-border": palette.blockquoteBorder,
    "background-color": palette.surface,
    color: palette.foreground,
    "color-scheme": colorScheme,
  };
}

const ASCIINEMA_HOSTNAME = "asciinema.org";
const ASCIINEMA_RECORDING_PATH_PATTERN = /^\/a\/([A-Za-z0-9_-]+)\/?$/;

let mermaidModulePromise:
  | Promise<typeof import("mermaid")["default"]>
  | undefined;

interface MermaidThemeVariables {
  readonly background: string;
  readonly primaryColor: string;
  readonly primaryTextColor: string;
  readonly primaryBorderColor: string;
  readonly secondaryColor: string;
  readonly secondaryTextColor: string;
  readonly secondaryBorderColor: string;
  readonly tertiaryColor: string;
  readonly tertiaryTextColor: string;
  readonly tertiaryBorderColor: string;
  readonly noteBkgColor: string;
  readonly noteTextColor: string;
  readonly noteBorderColor: string;
  readonly lineColor: string;
  readonly textColor: string;
  readonly mainBkg: string;
  readonly nodeBkg: string;
  readonly nodeBorder: string;
  readonly clusterBkg: string;
  readonly clusterBorder: string;
  readonly defaultLinkColor: string;
  readonly titleColor: string;
  readonly edgeLabelBackground: string;
  readonly nodeTextColor: string;
  readonly fontFamily: string;
  readonly fontSize: string;
}

function readCssVariable(source: Element, name: string): string {
  const value = getComputedStyle(source).getPropertyValue(name).trim();

  if (value !== "") {
    return value;
  }

  const rootValue = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (rootValue !== "") {
    return rootValue;
  }

  throw new Error(`Missing CSS custom property: ${name}`);
}

export function mermaidThemeVariables(
  source: Element = document.documentElement,
): MermaidThemeVariables {
  const surface = readCssVariable(source, "--markdown-surface");
  const preBackground = readCssVariable(source, "--markdown-pre-bg");
  const foreground = readCssVariable(source, "--markdown-fg");
  const heading = readCssVariable(source, "--markdown-heading");
  const muted = readCssVariable(source, "--markdown-muted");
  const border = readCssVariable(source, "--markdown-border");
  const fontFamily = readCssVariable(source, "--font-sans");

  return {
    background: surface,
    primaryColor: preBackground,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: preBackground,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: preBackground,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    noteBkgColor: preBackground,
    noteTextColor: foreground,
    noteBorderColor: border,
    lineColor: border,
    textColor: foreground,
    mainBkg: preBackground,
    nodeBkg: preBackground,
    nodeBorder: border,
    clusterBkg: preBackground,
    clusterBorder: border,
    defaultLinkColor: muted,
    titleColor: heading,
    edgeLabelBackground: surface,
    nodeTextColor: foreground,
    fontFamily,
    fontSize: "16px",
  };
}

function mermaidThemeCss(source: Element): string {
  const palette = mermaidThemeVariables(source);

  return `
    .label text,
    .nodeLabel,
    .edgeLabel,
    .cluster-label text,
    .flowchartTitleText {
      fill: ${palette.primaryTextColor} !important;
      color: ${palette.primaryTextColor} !important;
      font-family: ${palette.fontFamily} !important;
    }

    .edgeLabel rect {
      fill: ${palette.background} !important;
      opacity: 1 !important;
    }

    .node rect,
    .node circle,
    .node ellipse,
    .node polygon,
    .node path,
    .cluster rect,
    .actor,
    .labelBox,
    .note,
    .note rect {
      fill: ${palette.primaryColor} !important;
      stroke: ${palette.primaryBorderColor} !important;
    }

    .edgePath .path,
    .flowchart-link,
    marker path,
    .messageLine0,
    .messageLine1 {
      stroke: ${palette.primaryBorderColor} !important;
    }
  `;
}

async function getMermaid() {
  mermaidModulePromise ??= import("mermaid").then(({ default: mermaid }) => {
    return mermaid;
  });

  return mermaidModulePromise;
}

function enhanceKaTeX(container: HTMLElement): void {
  const inlineNodes = container.querySelectorAll<HTMLElement>(
    "span.math.math-inline",
  );
  for (const element of inlineNodes) {
    const tex = element.textContent ?? "";
    if (tex.trim() === "") {
      continue;
    }
    katex.render(tex, element, { displayMode: false, throwOnError: false });
  }

  const displayNodes = container.querySelectorAll<HTMLElement>(
    "span.math.math-display",
  );
  for (const element of displayNodes) {
    const tex = element.textContent ?? "";
    if (tex.trim() === "") {
      continue;
    }
    katex.render(tex, element, { displayMode: true, throwOnError: false });
  }
}

async function enhanceMermaid(
  container: HTMLElement,
  colorScheme: ColorScheme,
  isCurrent: () => boolean,
) {
  if (!isCurrent()) {
    return;
  }

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

  if (!isCurrent()) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    darkMode: colorScheme === "dark",
    theme: colorScheme === "dark" ? "dark" : "neutral",
    themeVariables: mermaidThemeVariables(container),
    themeCSS: mermaidThemeCss(container),
  });
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(".mermaid"));

  if (!isCurrent()) {
    return;
  }

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

function attachImageLoadFallback(
  image: HTMLImageElement,
  sourceLabel: string,
  openPathValue: string | null,
): void {
  if (image.dataset["chillaFallbackAttached"] === "true") {
    return;
  }

  image.dataset["chillaFallbackAttached"] = "true";

  image.addEventListener(
    "error",
    () => {
      if (image.dataset["chillaFallbackShown"] === "true") {
        return;
      }

      image.dataset["chillaFallbackShown"] = "true";
      image.classList.add("preview-image--failed");

      const fallback = document.createElement("div");
      fallback.className = "preview-image-fallback";

      const title = document.createElement("p");
      title.className = "preview-image-fallback__title";
      title.textContent = "Image preview is not available.";

      const detail = document.createElement("p");
      detail.className = "preview-image-fallback__detail";
      detail.textContent = sourceLabel;

      fallback.append(title, detail);

      if (openPathValue !== null) {
        const button = document.createElement("button");
        button.className = "preview-image-fallback__button";
        button.type = "button";
        button.textContent = "Open in default app";
        button.addEventListener("click", () => {
          void openPath(openPathValue).catch((error: unknown) => {
            console.error(
              "Failed to open image in the default application.",
              error,
            );
          });
        });
        fallback.append(button);
      }

      image.after(fallback);
    },
    { once: true },
  );
}

async function enhancePreviewMedia(
  container: HTMLElement,
  documentPath: string | null,
  imageRevision?: string,
  localResourceGeneration = 0,
) {
  const mediaElements = Array.from(
    container.querySelectorAll<HTMLElement>(
      "img[src], video[src], video source[src], audio[src], audio source[src], iframe[src], embed[src]",
    ),
  );

  for (const element of mediaElements) {
    const source = element.getAttribute("src");

    if (source === null) {
      continue;
    }

    const resolvedResource = await resolveDocumentResource(
      source,
      documentPath,
      previewPathApi,
    );

    if (element instanceof HTMLImageElement) {
      attachImageLoadFallback(element, source, resolvedResource?.path ?? null);
    }

    if (resolvedResource !== null) {
      if (imageRevision !== undefined || localResourceGeneration > 0) {
        const revisedUrl = new URL(resolvedResource.url);
        if (
          element instanceof HTMLImageElement &&
          imageRevision !== undefined
        ) {
          revisedUrl.searchParams.set("chilla_revision", imageRevision);
        }
        if (localResourceGeneration > 0) {
          revisedUrl.searchParams.set(
            "chilla_refresh",
            String(localResourceGeneration),
          );
        }
        element.setAttribute("src", revisedUrl.toString());
      } else {
        element.setAttribute("src", resolvedResource.url);
      }
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

  return (
    parsedUrl.pathname.match(ASCIINEMA_RECORDING_PATH_PATTERN)?.[1] ?? null
  );
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

export async function enhancePreviewContent(
  container: HTMLElement,
  documentPath: string | null,
  colorScheme: ColorScheme,
  isCurrent: () => boolean,
  imageRevision?: string,
  localResourceGeneration = 0,
) {
  if (!isCurrent()) {
    return;
  }

  for (const link of Array.from(
    container.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )) {
    const href = link.getAttribute("href");

    if (href !== null && isDefaultBrowserUrl(href)) {
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("target", "_blank");
    }
  }

  if (!isCurrent()) {
    return;
  }

  enhanceAsciinemaEmbeds(container);
  await enhancePreviewMedia(
    container,
    documentPath,
    imageRevision,
    localResourceGeneration,
  );

  if (!isCurrent()) {
    return;
  }

  enhanceKaTeX(container);
  await enhanceMermaid(container, colorScheme, isCurrent);
}

export function PreviewPane(props: PreviewPaneProps) {
  let containerRef: HTMLDivElement | undefined;
  let previewRef: HTMLDivElement | undefined;
  let enhancementRunId = 0;
  let panHandle: PreviewPanHandle | undefined;
  const [zoom, setZoom] = createSignal(100);

  const adjustZoom = (direction: PreviewZoomDirection) => {
    const maximum =
      props.dragPanEnabled === true
        ? IMAGE_PREVIEW_ZOOM_MAX
        : RENDERED_PREVIEW_ZOOM_MAX;
    setZoom((current) => nextPreviewZoom(current, direction, maximum));
  };

  const sourceScrollOwner = (): HTMLElement => {
    const preview = previewRef;
    if (preview === undefined) throw new Error("Preview is not mounted");
    return props.layout === "source"
      ? (preview.querySelector<HTMLElement>(
          ".preview__source-content > .file-preview--text > pre",
        ) ?? preview)
      : preview;
  };

  createEffect(
    on(
      () => [props.html, props.layout],
      () => panHandle?.stopFling(),
      { defer: true },
    ),
  );

  onMount(() => {
    const container = containerRef;
    const preview = previewRef;

    if (container === undefined || preview === undefined) {
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !props.visible ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (event.key !== "+" && event.key !== "-") {
        return;
      }

      event.preventDefault();
      adjustZoom(event.key === "+" ? "in" : "out");
    };

    const handleWheel = (event: WheelEvent) => {
      if (!props.visible) return;
      const old = zoom();
      const maximum =
        props.dragPanEnabled === true
          ? IMAGE_PREVIEW_ZOOM_MAX
          : RENDERED_PREVIEW_ZOOM_MAX;
      const next = applyWheelZoom(event, old, maximum);
      if (next === null) return;
      const owner = sourceScrollOwner();
      const anchor =
        props.layout === "source"
          ? owner
          : (preview.querySelector<HTMLElement>(".preview__zoom-surface") ??
            owner);
      const before = measureAnchor(owner, anchor);
      setZoom(next);
      const after = measureAnchor(owner, anchor);
      anchorScrollAfterZoom(owner, event, before, after, next / old);
    };

    panHandle = attachPreviewPan(preview, {
      isActive: () => props.visible,
      leftButton: () => props.dragPanEnabled === true,
      scrollOwner: sourceScrollOwner,
    });

    container.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);
    preview.addEventListener("wheel", handleWheel, { passive: false });
    onCleanup(() => {
      panHandle?.detach();
      panHandle = undefined;
      container.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);
      preview.removeEventListener("wheel", handleWheel);
    });
  });

  createEffect(
    on(
      [
        () => props.visible,
        () => props.html,
        () => props.documentPath,
        () => props.colorScheme,
        () => props.layout,
        () => props.imageRevision,
        () => props.localResourceGeneration,
      ],
      ([visible, html, documentPath, colorScheme]) => {
        const container = containerRef;

        if (!visible || container === undefined) {
          return;
        }

        const currentRunId = ++enhancementRunId;

        // Source HTML contains only escaped code and file metadata. Markdown
        // enhancements are unnecessary. JSX owns source HTML updates, so avoid
        // parsing and building its potentially large DOM a second time here.
        if (props.layout === "source") return;

        container.innerHTML = html;

        void enhancePreviewContent(
          container,
          documentPath,
          colorScheme,
          () => currentRunId === enhancementRunId,
          props.imageRevision,
          props.localResourceGeneration,
        ).catch(() => {
          // Leave the rendered markup intact if asset or Mermaid enhancement fails.
        });
      },
    ),
  );

  onCleanup(() => {
    enhancementRunId += 1;
  });

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
      <PreviewHeader fileName={props.fileName}>
        <span class="preview__header-detail">
          <Show when={props.layout !== "source"}>
            <span>{props.subtitle ?? "Rendered HTML"}</span>
          </Show>
          <span class="preview__zoom" aria-live="polite">
            {Math.round(zoom())}%
          </span>
        </span>
      </PreviewHeader>
      <div
        ref={previewRef}
        class={`pane__body preview${props.layout === "source" ? " preview--source" : ""}`}
        style={previewThemeStyle(props.colorScheme)}
      >
        <div
          ref={containerRef}
          class={`preview__content ${props.layout === "source" ? "preview__source-content" : "preview__zoom-surface markdown-body"}`}
          style={{
            ...previewThemeStyle(props.colorScheme),
            ...previewZoomStyle(zoom()),
          }}
          innerHTML={props.html}
        />
      </div>
    </section>
  );
}
