import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join, normalize } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import katex from "katex";
import "katex/dist/katex.min.css";
import "github-markdown-css/github-markdown.css";
import { createEffect, on, onCleanup, onMount, type JSX } from "solid-js";
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

function previewThemeStyle(colorScheme: ColorScheme): JSX.CSSProperties {
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
  | Promise<(typeof import("mermaid"))["default"]>
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

function readCssVariable(name: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (value === "") {
    throw new Error(`Missing CSS custom property: ${name}`);
  }

  return value;
}

export function mermaidThemeVariables(): MermaidThemeVariables {
  const surface = readCssVariable("--markdown-surface");
  const preBackground = readCssVariable("--markdown-pre-bg");
  const foreground = readCssVariable("--markdown-fg");
  const heading = readCssVariable("--markdown-heading");
  const muted = readCssVariable("--markdown-muted");
  const border = readCssVariable("--markdown-border");
  const fontFamily = readCssVariable("--font-sans");

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

function mermaidThemeCss(colorScheme: ColorScheme): string {
  const palette = markdownThemePalette(colorScheme);
  const fontFamily = readCssVariable("--font-sans");

  return `
    .label text,
    .nodeLabel,
    .edgeLabel,
    .cluster-label text,
    .flowchartTitleText {
      fill: ${palette.foreground} !important;
      color: ${palette.foreground} !important;
      font-family: ${fontFamily} !important;
    }

    .edgeLabel rect {
      fill: ${palette.surface} !important;
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
      fill: ${palette.preBackground} !important;
      stroke: ${palette.border} !important;
    }

    .edgePath .path,
    .flowchart-link,
    marker path,
    .messageLine0,
    .messageLine1 {
      stroke: ${palette.border} !important;
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
    darkMode: colorScheme === "dark",
    theme: colorScheme === "dark" ? "dark" : "neutral",
    themeVariables: mermaidThemeVariables(),
    themeCSS: mermaidThemeCss(colorScheme),
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
  enhanceKaTeX(container);
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
      <div
        class="pane__body preview"
        style={previewThemeStyle(props.colorScheme)}
      >
        <div
          ref={containerRef}
          class="preview__content markdown-body"
          style={previewThemeStyle(props.colorScheme)}
          innerHTML={props.html}
        />
      </div>
    </section>
  );
}
