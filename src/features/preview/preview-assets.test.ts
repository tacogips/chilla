import { describe, expect, it } from "bun:test";
import {
  isDefaultBrowserUrl,
  isVideoResource,
  resolveDocumentResourceUrl,
  shouldResolveLocalResource,
  type PreviewPathApi,
} from "./preview-assets";

const stubPathApi: PreviewPathApi = {
  async dirname(path) {
    return path.slice(0, path.lastIndexOf("/"));
  },
  async join(...paths) {
    return paths.join("/").replace(/\/{2,}/g, "/");
  },
  async normalize(path) {
    return path.replace(/\\/g, "/");
  },
  convertFileSrc(path) {
    return `asset://${path}`;
  },
};

describe("preview asset helpers", () => {
  it("identifies URLs that should open in the default browser", () => {
    expect(isDefaultBrowserUrl("https://example.com")).toBe(true);
    expect(isDefaultBrowserUrl("mailto:hello@example.com")).toBe(true);
    expect(isDefaultBrowserUrl("#section-1")).toBe(false);
    expect(isDefaultBrowserUrl("./guide.md")).toBe(false);
  });

  it("identifies video resources by extension", () => {
    expect(isVideoResource("./clip.mp4")).toBe(true);
    expect(isVideoResource("./clip.webm?autoplay=1")).toBe(true);
    expect(isVideoResource("./photo.png")).toBe(false);
  });

  it("only resolves local non-anchor resources", () => {
    expect(shouldResolveLocalResource("./images/photo.png")).toBe(true);
    expect(shouldResolveLocalResource("/var/tmp/video.mp4")).toBe(true);
    expect(shouldResolveLocalResource("https://example.com")).toBe(false);
    expect(shouldResolveLocalResource("#intro")).toBe(false);
  });

  it("resolves relative resources against the markdown file directory", async () => {
    await expect(
      resolveDocumentResourceUrl(
        "./images/photo.png",
        "/docs/notes/guide.md",
        stubPathApi,
      ),
    ).resolves.toBe("asset:///docs/notes/./images/photo.png");
  });

  it("preserves absolute local file paths when converting to asset URLs", async () => {
    await expect(
      resolveDocumentResourceUrl(
        "C:\\docs\\media\\clip.mp4",
        "/docs/notes/guide.md",
        stubPathApi,
      ),
    ).resolves.toBe("asset://C:/docs/media/clip.mp4");
  });

  it("does not rewrite external URLs", async () => {
    await expect(
      resolveDocumentResourceUrl(
        "https://example.com/image.png",
        "/docs/notes/guide.md",
        stubPathApi,
      ),
    ).resolves.toBeNull();
  });

  it("preserves local resource query strings and fragments", async () => {
    await expect(
      resolveDocumentResourceUrl(
        "./clips/demo.mp4?download=1#t=30",
        "/docs/notes/guide.md",
        stubPathApi,
      ),
    ).resolves.toBe("asset:///docs/notes/./clips/demo.mp4?download=1#t=30");
  });
});
