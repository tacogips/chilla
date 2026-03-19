import { createEffect, on } from "solid-js";

interface PreviewPaneProps {
  readonly html: string;
  readonly visible: boolean;
  readonly selectedAnchorId: string | null;
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

export function PreviewPane(props: PreviewPaneProps) {
  let containerRef: HTMLDivElement | undefined;

  createEffect(
    on([() => props.visible, () => props.html], ([visible]) => {
      const container = containerRef;

      if (!visible || container === undefined) {
        return;
      }

      void enhanceMermaid(container).catch(() => {
        // Leave Mermaid blocks in source form if hydration fails.
      });
    }),
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
