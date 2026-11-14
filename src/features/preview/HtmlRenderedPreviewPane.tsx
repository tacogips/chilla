import { createMemo } from "solid-js";
import { PreviewHeader } from "./PreviewHeader";
import { buildRenderedHtmlAssetUrl } from "./htmlAssetUrl";

interface HtmlRenderedPreviewPaneProps {
  readonly path: string;
  readonly fileName: string;
  readonly revision: string;
  readonly localResourceGeneration?: number | undefined;
}

/**
 * Browser-style rendered view for an HTML file preview. Loads the file
 * through the asset protocol in a maximally sandboxed iframe (no
 * `allow-scripts`, no `allow-same-origin`) so page script never runs and the
 * document cannot read or write app storage/cookies; only markup, styles,
 * and same-directory resource references are rendered.
 */
export function HtmlRenderedPreviewPane(props: HtmlRenderedPreviewPaneProps) {
  const renderedSrc = createMemo(() => {
    const url = new URL(buildRenderedHtmlAssetUrl(props.path));
    url.searchParams.set("revision", props.revision);
    if ((props.localResourceGeneration ?? 0) > 0) {
      url.searchParams.set(
        "chilla_refresh",
        String(props.localResourceGeneration),
      );
    }
    return url.toString();
  });

  return (
    <section class="pane">
      <PreviewHeader fileName={props.fileName}>
        <span>Preview (scripts disabled)</span>
      </PreviewHeader>
      <div class="pane__body preview preview--embedded-html">
        <iframe
          class="preview-html-frame"
          src={renderedSrc()}
          sandbox=""
          title={props.fileName}
        />
      </div>
    </section>
  );
}
