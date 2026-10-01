import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Builds an asset-protocol URL for an absolute file path that keeps '/' as
 * literal path separators, so relative resource references inside the loaded
 * HTML (`<link href="style.css">`, `<img src="img/cat.png">`, ...) resolve
 * against the file's own directory instead of the asset-protocol origin root.
 *
 * `convertFileSrc` alone runs `encodeURIComponent` over the *entire* path,
 * turning every '/' into `%2F` as well. The resulting URL has exactly one
 * path segment, so the browser has no directory to resolve relative URLs
 * against — everything resolves to the origin root and breaks.
 *
 * Tauri's asset protocol handler (`tauri::protocol::asset::get_response`)
 * strips exactly the first byte (the URL path's leading '/') from the
 * request path and percent-decodes the remainder as a single blob:
 *
 * ```rust
 * let path = percent_encoding::percent_decode(&request.uri().path().as_bytes()[1..])
 *   .decode_utf8_lossy()
 *   .to_string();
 * ```
 *
 * Literal '/' characters left in that remainder pass through percent-decode
 * unchanged and become directory separators in the resulting filesystem
 * path; only `%XX` triplets are decoded. So per-segment percent-encoding
 * (leaving '/' between segments literal) survives this step intact, and the
 * absolute path's own leading separator is re-added as a literal `%2F` ahead
 * of the segments so it decodes back to '/' and keeps the path absolute
 * (mirroring how `encodeURIComponent(absolutePath)` encodes that same
 * leading '/' as part of its single opaque segment today).
 *
 * `assetBase` defaults to `convertFileSrc("")`, which yields the correct
 * platform-specific asset origin with a trailing '/' (e.g.
 * `asset://localhost/` on macOS/Linux, `http://asset.localhost/` on
 * Windows/Android) without hardcoding the scheme here.
 */
export function buildRenderedHtmlAssetUrl(
  absolutePath: string,
  assetBase: string = convertFileSrc(""),
): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const segments = normalized
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));

  return `${assetBase}%2F${segments.join("/")}`;
}
