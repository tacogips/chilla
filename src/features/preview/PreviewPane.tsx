import { convertFileSrc } from "@tauri-apps/api/core";
import { dirname, join, normalize } from "@tauri-apps/api/path";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createEffect, on, onCleanup, onMount } from "solid-js";
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
}

let mermaidModulePromise:
  | Promise<(typeof import("mermaid"))["default"]>
  | undefined;

async function getMermaid() {
  mermaidModulePromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
    });

    return mermaid;
  });

  return mermaidModulePromise;
}

async function enhanceMermaid(container: HTMLElement) {
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
      "img[src], video[src], video source[src]",
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

async function enhancePreviewContent(
  container: HTMLElement,
  documentPath: string | null,
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

  await enhancePreviewMedia(container, documentPath);
  await enhanceMermaid(container);
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
      [() => props.visible, () => props.html, () => props.documentPath],
      ([visible, , documentPath]) => {
        const container = containerRef;

        if (!visible || container === undefined) {
          return;
        }

        void enhancePreviewContent(container, documentPath).catch(() => {
          // Leave the rendered markup intact if asset or Mermaid enhancement fails.
        });
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
        ref={containerRef}
        innerHTML={props.html}
      />
    </section>
  );
}
